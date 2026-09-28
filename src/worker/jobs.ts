import { z } from "zod";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { log } from "../lib/logger";
import { fromJsonArray } from "../lib/domain";
import { registerJob } from "../lib/queue";
import { BudgetGuard, CapReachedError } from "../lib/discovery/budget";
import { PrismaUsageCounter, settingsCapProvider } from "../lib/discovery/usage";
import { createProvider } from "../lib/discovery/places";
import { discoverCategoryArea } from "../lib/discovery/engine";
import { isTileFresh, refreshChainFlags, upsertPlace } from "../lib/discovery/upsert";

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
