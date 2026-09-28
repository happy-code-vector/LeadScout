import { z } from "zod";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { fromJsonArray } from "../lib/domain";
import { enqueue, registerJob } from "../lib/queue";
import { BudgetGuard, CapReachedError } from "../lib/discovery/budget";
import { PrismaUsageCounter, settingsCapProvider } from "../lib/discovery/usage";
import { createProvider } from "../lib/discovery/places";
import { discoverCategoryArea } from "../lib/discovery/engine";
import { isTileFresh, refreshChainFlags, upsertPlace } from "../lib/discovery/upsert";
import { auditBusiness, runAuditSweep } from "../lib/audit/audit";
import { rescoreAll } from "../lib/scoring/rescore";
import {
  CampaignValidationError,
  scheduleLead,
  startCampaign,
  stopSequences,
} from "../lib/outreach/engine";
import { prisma as db } from "../lib/db";

/**
 * discovery.run — walk every (category × area) of a DiscoveryRun with the
 * two-pass tiler. maxAttempts is 1: a run is user-triggered, partially
 * applied on failure, and cleanly re-runnable from the UI (upserts are
 * idempotent and fresh tiles are skipped without billing).
 */
registerJob(
  "discovery.run",
  async (payload) => {
    const { runId } = z.object({ runId: z.string().min(1) }).parse(payload);

    const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error(`discovery run ${runId} not found`);
    if (run.status !== "RUNNING") {
      log.info("discovery run already handled, skipping", { runId, status: run.status });
      return;
    }

    const categories = await prisma.category.findMany({
      where: { id: { in: fromJsonArray(run.categoryIds) } },
    });
    const areas = await prisma.area.findMany({
      where: { id: { in: fromJsonArray(run.areaIds) } },
    });
    if (categories.length === 0 || areas.length === 0) {
      throw new Error("run has no categories or no areas");
    }

    const provider = createProvider(env.GOOGLE_PLACES_API_KEY);
    const guard = new BudgetGuard(new PrismaUsageCounter(), settingsCapProvider);

    const totals = { requestsUsed: 0, placesFound: 0, newPlaces: 0 };
    log.info("discovery run started", {
      runId,
      provider: env.GOOGLE_PLACES_API_KEY ? "places" : "mock",
      categories: categories.length,
      areas: areas.length,
    });

    try {
      for (const category of categories) {
        for (const area of areas) {
          const stats = await discoverCategoryArea(
            provider,
            guard,
            {
              textQuery: category.textQuery,
              includedType: category.includedType,
              rectangle: { south: area.south, west: area.west, north: area.north, east: area.east },
            },
            {
              isTileFresh: (ids) => isTileFresh(prisma, ids),
              persistPlaces: async (places) => {
                let found = 0;
                let created = 0;
                for (const place of places) {
                  const outcome = await upsertPlace(prisma, place, category.id, {
                    name: area.name,
                    city: area.city,
                    state: area.state,
                  });
                  if (outcome !== "skipped") {
                    found += 1;
                    if (outcome === "created") created += 1;
                  }
                }
                return { found, created };
              },
              onProgress: async (p) => {
                await prisma.discoveryRun.update({
                  where: { id: run.id },
                  data: {
                    requestsUsed: totals.requestsUsed + p.requestsUsed,
                    placesFound: totals.placesFound + p.placesFound,
                    newPlaces: totals.newPlaces + p.newPlaces,
                  },
                });
              },
            },
          );
          totals.requestsUsed += stats.requestsUsed;
          totals.placesFound += stats.placesFound;
          totals.newPlaces += stats.newPlaces;
          await prisma.discoveryRun.update({ where: { id: run.id }, data: { ...totals } });
        }
      }

      const flagged = await refreshChainFlags(prisma);
      await prisma.discoveryRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", finishedAt: new Date(), ...totals },
      });
      log.info("discovery run completed", { runId, ...totals, chainsFlagged: flagged });

      // Newly discovered businesses need website audits.
      await enqueue("audit.sweep", {});
    } catch (err) {
      if (err instanceof CapReachedError) {
        // Clean stop at the budget cap (spec: stop with status CAP_REACHED).
        await prisma.discoveryRun.update({
          where: { id: run.id },
          data: {
            status: "CAP_REACHED",
            finishedAt: new Date(),
            error: err.message,
            ...totals,
          },
        });
        log.warn("discovery run stopped at cap", { runId, ...totals });
        return;
      }
      await prisma.discoveryRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
          ...totals,
        },
      });
      throw err;
    }
  },
);

// Importing this module registers its jobs; future phases register here too.

/** Audit one business (idempotent; safe to retry). */
registerJob(
  "audit.business",
  async (payload) => {
    const { businessId } = z.object({ businessId: z.string().min(1) }).parse(payload);
    const outcome = await auditBusiness(businessId);
    log.info("audit done", { ...outcome });
  },
);

/** Audit every business whose audit is missing or older than 90 days. */
registerJob("audit.sweep", async () => {
  await runAuditSweep();
  // Audits feed the score — rescore right after.
  await enqueue("score.sweep", {});
});

/** Recompute scores for every business (idempotent). */
registerJob("score.sweep", async () => {
  await rescoreAll();
});

/** Start a campaign: validate, build the pool, schedule first-channel actions. */
registerJob(
  "campaign.start",
  async (payload) => {
    const { campaignId } = z.object({ campaignId: z.string().min(1) }).parse(payload);
    try {
      await startCampaign(campaignId);
    } catch (err) {
      if (err instanceof CampaignValidationError) {
        await db.campaign.update({
          where: { id: campaignId },
          data: { status: "DRAFT" },
        });
        log.warn("campaign start rejected", { campaignId, reason: err.message });
        return;
      }
      throw err;
    }
  },
);

/**
 * After an email sequence runs out (or immediately when no email exists),
 * fall through to the next available channel: postcard, then a call task.
 * Re-validates terminal states, so stale fallthrough jobs are harmless.
 */
registerJob(
  "outreach.fallthrough",
  async (payload) => {
    const { leadId, campaignId, fromChannel } = z
      .object({ leadId: z.string(), campaignId: z.string(), fromChannel: z.string() })
      .parse(payload);

    const lead = await db.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;
    if (["REPLIED", "MEETING", "PROPOSAL", "WON", "LOST", "DO_NOT_CONTACT"].includes(lead.status)) {
      await stopSequences(leadId, `fallthrough skipped: lead ${lead.status}`);
      return;
    }

    const terminal = await db.outreachEvent.findFirst({
      where: {
        leadId,
        status: { in: ["BOUNCED", "REPLIED", "UNSUBSCRIBED"] },
      },
    });
    if (terminal) {
      await stopSequences(leadId, "fallthrough skipped: terminal event");
      return;
    }

    const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== "RUNNING") return;

    // Continue walking channelOrder after the channel that just finished.
    const order = fromJsonArray(campaign.channelOrder);
    const idx = order.indexOf(fromChannel);
    const rest = (idx >= 0 ? order.slice(idx + 1) : order).filter((c) => c !== "EMAIL");
    for (const channel of rest) {
      if (channel === "POSTAL" && !process.env.LOB_API_KEY) continue;
      const created = await scheduleLead(campaign, leadId, [channel]);
      if (created > 0) return;
    }
    // Nothing else available — expected for website-less businesses.
    log.info("fallthrough exhausted", { leadId, campaignId });
  },
);

/**
 * Mark discovery runs stuck in RUNNING when no active job exists for them
 * (e.g. a worker crash or a job that failed before the handler ran, such as
 * a stale worker with no handler registered). Safe to call at every startup.
 */
export async function recoverOrphanedRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const stuck = await prisma.discoveryRun.findMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    select: { id: true },
  });
  let fixed = 0;
  for (const run of stuck) {
    const active = await prisma.job.count({
      where: {
        type: "discovery.run",
        status: { in: ["PENDING", "RUNNING"] },
        payload: { contains: `"runId":"${run.id}"` },
      },
    });
    if (active === 0) {
      await prisma.discoveryRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), error: "orphaned run (no active job)" },
      });
      fixed += 1;
    }
  }
  return fixed;
}
