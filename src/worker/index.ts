import "dotenv/config";
import { log } from "../lib/logger";
import { drainQueue, pruneOldJobs, recoverStaleJobs } from "../lib/queue";
import "./jobs";
import { recoverOrphanedRuns } from "./jobs";

/**
 * LeadScout background worker. Polls the Job table on SQLite — no external
 * services. Jobs are registered per build phase in src/worker/jobs.ts.
 */

const POLL_INTERVAL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const recovered = await recoverStaleJobs();
  const pruned = await pruneOldJobs();
  const orphanedRuns = await recoverOrphanedRuns();
  if (recovered || pruned || orphanedRuns) {
    log.info("worker startup cleanup", { recovered, pruned, orphanedRuns });
  }

  log.info("worker started", { pollIntervalMs: POLL_INTERVAL_MS });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("worker stopping", { signal });
    // Let the current poll cycle notice `stopping`; give it a moment.
    await sleep(POLL_INTERVAL_MS + 100);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Housekeeping: prune finished jobs once an hour.
  const pruneTimer = setInterval(() => {
    void pruneOldJobs().catch((err) => log.error("prune failed", { err }));
  }, 60 * 60_000);
  pruneTimer.unref();

  while (!stopping) {
    try {
      const ran = await drainQueue();
      if (ran === 0) {
        // claimNextJob already found nothing due; wait before polling again.
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      log.error("worker loop error", { err });
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

main().catch((err) => {
  log.error("worker fatal", { err });
  process.exit(1);
});
