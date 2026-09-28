import { prisma } from "../db";
import { log } from "../logger";
import { stopSequences } from "./engine";

/**
 * Reply and bounce detection (spec: Outreach / Reply and bounce tracking).
 * One handler, two feeds: the IMAP poller (production) and the dev inbox's
 * "simulate reply" action — both construct IncomingMessage and land here.
 *
 * Replies match by In-Reply-To/References → sent messageId. On a match the
 * lead goes REPLIED, its sequence stops, and it shows in the Dashboard
 * inbox. Bounces (DSN messages) suppress the address, unverify the contact,
 * and stop the sequence.
 */

export interface IncomingMessage {
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  from?: string;
  subject?: string;
  text?: string;
  isDeliveryStatus?: boolean;
}

export type IncomingOutcome = "reply" | "bounce" | "ignored";

const REPLIED_OR_LATER = ["REPLIED", "MEETING", "PROPOSAL", "WON"];

/** Pure: does this message look like a bounce (DSN)? */
export function looksLikeBounce(msg: IncomingMessage): boolean {
  if (msg.isDeliveryStatus) return true;
  const from = (msg.from ?? "").toLowerCase();
  if (from.includes("mailer-daemon") || from.includes("postmaster@")) return true;
  const subject = (msg.subject ?? "").toLowerCase();
  return (
    subject.includes("undeliverable") ||
    subject.includes("undelivered") ||
    subject.includes("delivery status notification") ||
    subject.includes("delivery failure") ||
    subject.includes("returned mail") ||
    subject.includes("mail delivery failed")
  );
}

/** Pure: extract the failing address from a DSN body ("Final-Recipient: …;addr"). */
export function extractBounceAddress(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.match(/final-recipient:\s*rfc822;\s*([^\s<>,]+)/i);
  if (m) return m[1].toLowerCase();
  const m2 = text.match(/failed recipient:\s*([^\s<>,]+)/i);
  if (m2) return m2[1].toLowerCase();
  return null;
}

/** Pure: find the sent event an incoming message answers, if any. */
export function findAnsweredEventId(
  msg: IncomingMessage,
  sentEvents: { id: string; messageId: string | null }[],
): string | null {
  const candidates = [msg.inReplyTo, ...(msg.references ?? [])]
    .map((s) => (s ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (candidates.length === 0) return null;
  for (const candidate of candidates) {
    const hit = sentEvents.find((e) => (e.messageId ?? "").toLowerCase() === candidate);
    if (hit) return hit.id;
  }
  return null;
}

export async function processIncoming(msg: IncomingMessage): Promise<IncomingOutcome> {
  if (looksLikeBounce(msg)) {
    return processBounce(msg);
  }
  return processReply(msg);
}

async function processReply(msg: IncomingMessage): Promise<IncomingOutcome> {
  const sentEvents = await prisma.outreachEvent.findMany({
    where: { status: "SENT", messageId: { not: null } },
    select: { id: true, messageId: true, leadId: true, campaignId: true },
  });
  const answeredId = findAnsweredEventId(msg, sentEvents);
  if (!answeredId) {
    log.debug("incoming message matched no sent email", { subject: msg.subject });
    return "ignored";
  }
  const answered = sentEvents.find((e) => e.id === answeredId)!;
  const lead = await prisma.lead.findUnique({ where: { id: answered.leadId } });

  // Record the reply against the campaign that earned it.
  await prisma.outreachEvent.create({
    data: {
      leadId: answered.leadId,
      campaignId: answered.campaignId,
      channel: "EMAIL",
      status: "REPLIED",
      messageId: msg.messageId ?? null,
      meta: JSON.stringify({ subject: msg.subject ?? "", from: msg.from ?? "" }),
    },
  });

  // Only advance the pipeline if the lead isn't already further along.
  if (lead && !REPLIED_OR_LATER.includes(lead.status)) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "REPLIED", lastActivityAt: new Date() },
    });
  }
  await stopSequences(answered.leadId, "reply");
  log.info("reply processed", { leadId: answered.leadId, subject: msg.subject });
  return "reply";
}

async function processBounce(msg: IncomingMessage): Promise<IncomingOutcome> {
  const sentEvents = await prisma.outreachEvent.findMany({
    where: { status: { in: ["SENT", "BOUNCED"] }, messageId: { not: null } },
    select: { id: true, messageId: true, leadId: true, campaignId: true, meta: true },
  });
  const answeredId = findAnsweredEventId(msg, sentEvents);

  // The failing address: DSN Final-Recipient, else the email we sent to.
  let bouncedEmail = extractBounceAddress(msg.text);
  let leadId: string | null = null;
  let campaignId: string | null = null;

  if (answeredId) {
    const answered = sentEvents.find((e) => e.id === answeredId)!;
    leadId = answered.leadId;
    campaignId = answered.campaignId;
    if (!bouncedEmail) {
      try {
        bouncedEmail = (JSON.parse(answered.meta || "{}") as { email?: string }).email ?? null;
      } catch {
        bouncedEmail = null;
      }
    }
  } else if (bouncedEmail) {
    const event = await prisma.outreachEvent.findFirst({
      where: { status: "SENT", meta: { contains: `"email":"${bouncedEmail}"` } },
      select: { leadId: true, campaignId: true },
    });
    leadId = event?.leadId ?? null;
    campaignId = event?.campaignId ?? null;
  }

  if (!leadId || !campaignId || !bouncedEmail) {
    log.debug("bounce matched nothing actionable", { subject: msg.subject });
    return "ignored";
  }

  await prisma.outreachEvent.create({
    data: {
      leadId,
      campaignId,
      channel: "EMAIL",
      status: "BOUNCED",
      messageId: msg.messageId ?? null,
      meta: JSON.stringify({ email: bouncedEmail, subject: msg.subject ?? "" }),
    },
  });
  await prisma.suppression.upsert({
    where: { value: bouncedEmail },
    update: {},
    create: { value: bouncedEmail, reason: "bounce" },
  });
  const business = await prisma.business.findFirst({
    where: { lead: { id: leadId } },
    select: { id: true },
  });
  if (business) {
    await prisma.contact.updateMany({
      where: { businessId: business.id, type: "EMAIL", value: bouncedEmail },
      data: { verified: false },
    });
  }
  await stopSequences(leadId, "bounce");
  log.info("bounce processed", { leadId, email: bouncedEmail });
  return "bounce";
}
