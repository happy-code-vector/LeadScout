import type { Campaign, Lead, Mailbox } from "@prisma/client";
import { prisma } from "../db";
import { log } from "../logger";
import { isPostalEnabled } from "../env";
import { fromJsonArray } from "../domain";
import type { TemplateVars } from "./render";
import { renderTemplate } from "./render";
import { sendEmail } from "./sender";
import { isWithinSendWindow, parseSendWindow, timezoneForState } from "./timezone";
import { unsubscribeUrl } from "./unsubscribe";

/**
 * Outreach engine (spec: Pipeline / Outreach).
 *
 * Auto mode walks channelOrder per lead and starts with the first channel
 * whose data exists: EMAIL needs a verified or website-sourced, unsuppressed
 * email; POSTAL needs an address + LOB_API_KEY; PHONE needs a number. Email
 * sequence steps are scheduled by delayDays; when the sequence runs out
 * without a reply, an outreach.fallthrough job moves to the next channel
 * (postcard, then a CallTask on the next business day). Everything stops on
 * reply / bounce / unsubscribe / NOT_INTERESTED / DO_NOT_CALL / manual change.
 */

// ---------------------------------------------------------------------------
// Pool selection
// ---------------------------------------------------------------------------

export interface CampaignFilters {
  tiers?: string[];
  categorySlugs?: string[];
  areas?: string[];
  websiteClasses?: string[];
}

export function parseCampaignFilters(raw: string | null): CampaignFilters {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CampaignFilters;
  } catch {
    return {};
  }
}

/** Count leads matching the campaign filters (for the live count in the editor). */
export async function countCampaignPool(filters: CampaignFilters): Promise<number> {
  const where = poolWhere(filters);
  return prisma.business.count({ where });
}

function poolWhere(filters: CampaignFilters) {
  return {
    isChain: false,
    score: filters.tiers?.length ? { tier: { in: filters.tiers } } : { tier: { not: "D" } },
    lead: { status: { notIn: ["DO_NOT_CONTACT", "WON", "LOST"] } },
    ...(filters.categorySlugs?.length ? { category: { slug: { in: filters.categorySlugs } } } : {}),
    ...(filters.areas?.length ? { OR: filters.areas.flatMap((a) => [{ borough: a }, { city: a }]) } : {}),
    ...(filters.websiteClasses?.length ? { audit: { websiteClass: { in: filters.websiteClasses } } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Campaign start / scheduling
// ---------------------------------------------------------------------------

export class CampaignValidationError extends Error {}

export async function startCampaign(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { sequence: { include: { steps: { include: { template: true } } } } },
  });
  if (!campaign) throw new CampaignValidationError("campaign not found");

  // CAN-SPAM: a campaign cannot start until sender identity is set.
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.senderName || !settings.senderPostalAddress) {
    throw new CampaignValidationError("Set sender name and postal address in Settings before starting a campaign");
  }
  if (campaign.mode === "AUTO") {
    if (!campaign.sequence || campaign.sequence.steps.length === 0) {
      throw new CampaignValidationError("Auto campaigns need a sequence with steps");
    }
    if (!campaign.mailboxId) {
      throw new CampaignValidationError("Auto campaigns need a mailbox");
    }
  }

  const filters = parseCampaignFilters(campaign.filters);
  const poolWhereClause = poolWhere(filters);

  // Pool = filter matches + explicitly added, minus suppressed and recently
  // contacted from another campaign (30-day placeId rule).
  const matched = await prisma.business.findMany({
    where: poolWhereClause,
    select: { id: true },
  });
  const added = await prisma.campaignLead.findMany({
    where: { campaignId },
    select: { lead: { select: { businessId: true } } },
  });
  const businessIds = [...new Set([...matched.map((m) => m.id), ...added.map((a) => a.lead.businessId)])];

  const suppressed = new Set(
    (await prisma.suppression.findMany({ select: { value: true } })).map((s) => s.value),
  );

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const recent = await prisma.outreachEvent.findMany({
    where: { status: "SENT", occurredAt: { gte: cutoff }, campaignId: { not: campaignId } },
    select: { lead: { select: { business: { select: { placeId: true } } } } },
  });
  const recentPlaceIds = new Set(recent.map((r) => r.lead.business.placeId));

  const businesses = await prisma.business.findMany({
    where: { id: { in: businessIds }, isChain: false },
    include: {
      lead: true,
      audit: true,
      contacts: true,
      category: true,
    },
  });

  let scheduled = 0;
  for (const b of businesses) {
    if (!b.lead) continue;
    if (b.lead.status === "DO_NOT_CONTACT") continue;
    if (suppressed.has(b.placeId) || recentPlaceIds.has(b.placeId)) continue;
    if (b.contacts.some((c) => c.type === "EMAIL" && suppressed.has(c.value))) continue;
    if (b.phone && suppressed.has(b.phone)) continue;
    if ((await scheduleLead(campaign, b.lead.id)) > 0) scheduled += 1;
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "RUNNING" },
  });
  log.info("campaign started", { campaignId, pool: businesses.length, scheduled });
  return scheduled;
}

/**
 * Pick the first available channel and schedule its actions for one lead.
 * Returns how many actions were scheduled (0 = no channel available).
 * `channelsOverride` restricts the walk (used by the fallthrough job).
 */
export async function scheduleLead(
  campaign: Campaign,
  leadId: string,
  channelsOverride?: string[],
): Promise<number> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      business: { include: { audit: true, contacts: true, category: true } },
    },
  });
  if (!lead || !lead.business) return 0;

  const suppressed = new Set(
    (await prisma.suppression.findMany({ select: { value: true } })).map((s) => s.value),
  );

  const channels = channelsOverride ?? (fromJsonArray(campaign.channelOrder) as string[]);
  for (const channel of channels) {
    if (channel === "EMAIL") {
      const email = pickEmail(lead.business.contacts, suppressed);
      if (!email) continue;
      if (campaign.mode !== "AUTO") {
        // Manual campaigns only list/export — no scheduled events.
        return 0;
      }
      const steps = await prisma.sequenceStep.findMany({
        where: { sequenceId: campaign.sequenceId! },
        orderBy: { order: "asc" },
      });
      if (steps.length === 0) continue;
      for (const step of steps) {
        await prisma.outreachEvent.create({
          data: {
            leadId,
            campaignId: campaign.id,
            channel: "EMAIL",
            templateId: step.templateId,
            status: "SCHEDULED",
            scheduledFor: new Date(Date.now() + step.delayDays * 24 * 60 * 60_000),
            meta: JSON.stringify({ email, delayDays: step.delayDays }),
          },
        });
      }
      // After the last email, fall through to the next channel if no reply.
      const lastDelay = Math.max(...steps.map((s) => s.delayDays));
      await prisma.job.create({
        data: {
          type: "outreach.fallthrough",
          payload: JSON.stringify({ leadId, campaignId: campaign.id, fromChannel: "EMAIL" }),
          runAt: new Date(Date.now() + (lastDelay + 1) * 24 * 60 * 60_000),
        },
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: lead.status === "NEW" ? "QUEUED" : lead.status, lastActivityAt: new Date() },
      });
      return steps.length;
    }
    if (channel === "POSTAL") {
      if (!isPostalEnabled || !lead.business.address) continue;
      if (campaign.mode !== "AUTO") return 0;
      await prisma.outreachEvent.create({
        data: {
          leadId,
          campaignId: campaign.id,
          channel: "POSTAL",
          status: "SCHEDULED",
          scheduledFor: new Date(),
          meta: JSON.stringify({ address: lead.business.address }),
        },
      });
      return 1;
    }
    if (channel === "PHONE") {
      const phone =
        lead.business.contacts.find((c) => c.type === "PHONE")?.value ?? lead.business.phone;
      if (!phone || suppressed.has(phone)) continue;
      if (campaign.mode !== "AUTO") return 0;
      await createCallTask(lead, campaign);
      return 1;
    }
  }
  return 0;
}

function pickEmail(
  contacts: { type: string; value: string; verified: boolean; source: string }[],
  suppressed: Set<string>,
): string | null {
  const usable = contacts.filter(
    (c) => c.type === "EMAIL" && (c.verified || c.source === "WEBSITE") && !suppressed.has(c.value),
  );
  const verified = usable.find((c) => c.verified);
  return verified?.value ?? usable[0]?.value ?? null;
}

type LeadWithBusiness = Lead & {
  business: {
    name: string;
    borough: string | null;
    city: string | null;
    state: string | null;
    reviewCount: number | null;
    rating: number | null;
    address: string | null;
    phone: string | null;
    audit: { findings: string; websiteClass: string } | null;
    contacts: { type: string; value: string; verified: boolean; source: string }[];
    category: { name: string };
  };
};

async function createCallTask(lead: LeadWithBusiness, campaign: Campaign): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const b = lead.business;
  const cls = b.audit?.websiteClass ?? "NONE";
  const variant = cls === "OUTDATED" || cls === "OK" ? "outdated" : "none";
  const template =
    (await prisma.template.findFirst({ where: { channel: "PHONE", variant } })) ??
    (await prisma.template.findFirst({ where: { channel: "PHONE" } }));
  const findings = b.audit ? fromJsonArray(b.audit.findings) : [];

  let script = "";
  if (template) {
    const vars = templateVarsFor(settings, b.name, b.category.name, b.borough ?? b.city ?? "", b.reviewCount, b.rating, findings[0] ?? "", lead.id);
    script = renderTemplate(template.body, vars);
  }

  await prisma.callTask.create({
    data: {
      leadId: lead.id,
      campaignId: campaign.id,
      dueAt: nextBusinessDay(new Date()),
      script,
    },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastActivityAt: new Date() },
  });
}

export function templateVarsFor(
  settings: { senderName: string | null; senderPostalAddress: string | null } | null,
  businessName: string,
  category: string,
  neighborhood: string,
  reviewCount: number | null,
  rating: number | null,
  topFinding: string,
  leadId: string,
  email?: string,
): TemplateVars {
  return {
    businessName,
    category,
    neighborhood,
    reviewCount: reviewCount ?? 0,
    rating,
    topFinding,
    senderName: settings?.senderName ?? "",
    senderPostalAddress: settings?.senderPostalAddress ?? "",
    unsubscribeUrl: email ? unsubscribeUrl(leadId, email) : "",
  };
}

function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6); // skip Sat/Sun
  d.setHours(10, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Stop conditions
// ---------------------------------------------------------------------------

/** Cancel every pending SCHEDULED event for a lead (reply/bounce/unsub/manual). */
export async function stopSequences(leadId: string, reason: string): Promise<void> {
  const res = await prisma.outreachEvent.deleteMany({
    where: { leadId, status: "SCHEDULED" },
  });
  if (res.count > 0) {
    log.info("sequence stopped", { leadId, reason, cancelled: res.count });
  }
}

// ---------------------------------------------------------------------------
// Tick: send due scheduled emails
// ---------------------------------------------------------------------------

let ticking = false;

export async function processDueEmails(): Promise<{ sent: number; skipped: number; failed: number }> {
  if (ticking) return { sent: 0, skipped: 0, failed: 0 };
  ticking = true;
  try {
    const due = await prisma.outreachEvent.findMany({
      where: { status: "SCHEDULED", scheduledFor: { lte: new Date() }, channel: "EMAIL" },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of due) {
      const outcome = await sendOne(event.id);
      if (outcome === "sent") sent += 1;
      else if (outcome === "failed") failed += 1;
      else skipped += 1;
    }
    if (due.length > 0) log.info("outreach tick", { due: due.length, sent, skipped, failed });
    return { sent, skipped, failed };
  } finally {
    ticking = false;
  }
}

type SendOutcome = "sent" | "failed" | "skipped" | "done";

async function sendOne(eventId: string): Promise<SendOutcome> {
  const event = await prisma.outreachEvent.findUnique({
    where: { id: eventId },
    include: {
      campaign: true,
      lead: {
        include: {
          business: { include: { audit: true, contacts: true, category: true } },
        },
      },
    },
  });
  if (!event || event.status !== "SCHEDULED") return "done";

  const campaign = event.campaign;
  if (campaign.status !== "RUNNING") return "skipped";

  const lead = event.lead;
  const business = lead.business;

  // Terminal states stop everything (defensive; transitions also stop eagerly).
  if (["REPLIED", "WON", "LOST", "DO_NOT_CONTACT", "MEETING", "PROPOSAL"].includes(lead.status)) {
    await stopSequences(lead.id, `lead status ${lead.status}`);
    return "skipped";
  }

  const meta = JSON.parse(event.meta || "{}") as { email?: string; attempts?: number; mailboxId?: string };
  const email = meta.email ?? pickEmail(business.contacts, new Set());
  if (!email) {
    await prisma.outreachEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", meta: JSON.stringify({ ...meta, error: "no usable email" }) },
    });
    return "failed";
  }

  // Send window, in the recipient's timezone (derived from the state).
  const window = parseSendWindow(campaign.sendWindow);
  const tz = timezoneForState(business.state);
  if (!isWithinSendWindow(new Date(), window, tz)) return "skipped";

  const mailbox = campaign.mailboxId
    ? await prisma.mailbox.findUnique({ where: { id: campaign.mailboxId } })
    : null;
  if (!mailbox || !mailbox.active) return "skipped";

  // ---- Limits -------------------------------------------------------------
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [mailboxSent, campaignSent] = await Promise.all([
    prisma.outreachEvent.count({
      where: {
        status: "SENT",
        occurredAt: { gte: startOfDay },
        meta: { contains: `"mailboxId":"${mailbox.id}"` },
      },
    }),
    prisma.outreachEvent.count({
      where: { status: "SENT", campaignId: campaign.id, occurredAt: { gte: startOfDay } },
    }),
  ]);

  const mailboxCap = warmupCap(mailbox);
  if (mailboxSent >= mailboxCap) return "skipped";
  if (campaignSent >= campaign.dailyLimit) return "skipped";

  // ---- Spacing: 2–6 minutes apart with jitter -----------------------------
  const lastForMailbox = await prisma.outreachEvent.findFirst({
    where: {
      status: "SENT",
      meta: { contains: `"mailboxId":"${mailbox.id}"` },
    },
    orderBy: { occurredAt: "desc" },
  });
  if (lastForMailbox) {
    const gapMinutes = 2 + Math.random() * 4;
    const elapsedMin = (Date.now() - lastForMailbox.occurredAt.getTime()) / 60_000;
    if (elapsedMin < gapMinutes) return "skipped";
  }

  // ---- Render & send ------------------------------------------------------
  const template = event.templateId
    ? await prisma.template.findUnique({ where: { id: event.templateId } })
    : null;
  if (!template) {
    await prisma.outreachEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", meta: JSON.stringify({ ...meta, error: "template missing" }) },
    });
    return "failed";
  }

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const findings = business.audit ? fromJsonArray(business.audit.findings) : [];
  const vars = templateVarsFor(
    settings,
    business.name,
    business.category.name,
    business.borough ?? business.city ?? "",
    business.reviewCount,
    business.rating,
    findings[0] ?? "their website could work harder for them",
    lead.id,
    email,
  );
  const unsubUrl = unsubscribeUrl(lead.id, email);

  try {
    const result = await sendEmail({
      mailbox,
      to: email,
      templateSubject: template.subject,
      templateBody: template.body,
      vars,
      unsubscribeUrl: unsubUrl,
    });
    await prisma.outreachEvent.update({
      where: { id: event.id },
      data: {
        status: "SENT",
        occurredAt: new Date(),
        messageId: result.messageId,
        meta: JSON.stringify({ ...meta, mailboxId: mailbox.id }),
      },
    });
    if (["NEW", "QUEUED"].includes(lead.status)) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "CONTACTED", lastActivityAt: new Date() },
      });
    } else {
      await prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } });
    }
    return "sent";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A hard bounce is the recipient's server rejecting the ADDRESS (SMTP
    // 5xx on MAIL/RCPT). Auth failures and connection problems are sender
    // config errors — never suppress an address for those.
    const smtpErr = err as { responseCode?: number; command?: string };
    const isHardBounce =
      typeof smtpErr.responseCode === "number" &&
      smtpErr.responseCode >= 500 &&
      (smtpErr.command === "RCPT" || /recipient|user|mailbox|not.*exist/i.test(message));
    if (isHardBounce) {
      // Treat as a bounce: suppress the address, unverify the contact, stop.
      await prisma.outreachEvent.update({
        where: { id: event.id },
        data: { status: "BOUNCED", meta: JSON.stringify({ ...meta, error: message }) },
      });
      await prisma.suppression.upsert({
        where: { value: email },
        update: {},
        create: { value: email, reason: "bounce" },
      });
      await prisma.contact.updateMany({
        where: { businessId: business.id, type: "EMAIL", value: email },
        data: { verified: false },
      });
      await stopSequences(lead.id, "bounce");
      return "failed";
    }
    // Transient: retry in 15 minutes, up to 3 attempts.
    const attempts = (meta.attempts ?? 0) + 1;
    if (attempts >= 3) {
      await prisma.outreachEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", meta: JSON.stringify({ ...meta, attempts, error: message }) },
      });
      return "failed";
    }
    await prisma.outreachEvent.update({
      where: { id: event.id },
      data: {
        scheduledFor: new Date(Date.now() + 15 * 60_000),
        meta: JSON.stringify({ ...meta, attempts }),
      },
    });
    return "skipped";
  }
}

/** Warmup ramp: start at 10/day, add 5/day, capped at dailyLimit (spec). */
export function warmupCap(mailbox: Mailbox): number {
  const cap = mailbox.dailyLimit;
  if (!mailbox.warmupStartDate) return cap;
  const days = Math.floor((Date.now() - mailbox.warmupStartDate.getTime()) / (24 * 60 * 60_000));
  return Math.min(cap, 10 + 5 * days);
}
