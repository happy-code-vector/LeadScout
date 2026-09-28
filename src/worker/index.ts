import "dotenv/config";
import { log } from "../lib/logger";
import { drainQueue, enqueue, pruneOldJobs, recoverStaleJobs } from "../lib/queue";
import { processDueEmails, processDuePostcards } from "../lib/outreach/engine";
import { pollAllMailboxes } from "../lib/outreach/imap";
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

  // Housekeeping: prune finished jobs and kick the 90-day re-audit sweep and
  // the Places 30-day refresh/retention sweep hourly.
  const housekeeping = setInterval(() => {
    void pruneOldJobs().catch((err) => log.error("prune failed", { err }));
    void enqueue("audit.sweep", {}).catch((err) => log.error("audit sweep enqueue failed", { err }));
    void enqueue("places.refresh-sweep", {}).catch((err) => log.error("places refresh enqueue failed", { err }));
  }, 60 * 60_000);
  housekeeping.unref();

  // Outreach tick: send due scheduled emails once a minute. The engine
  // enforces send windows, warmup/daily limits, and 2–6 min spacing itself.
  // Postcards (Lob) ride along on the same cadence.
  const outreachTick = setInterval(() => {
    void processDueEmails().catch((err) => log.error("outreach tick failed", { err }));
    void processDuePostcards().catch((err) => log.error("postcard tick failed", { err }));
  }, 60_000);
  outreachTick.unref();
  // Run one tick shortly after startup so dev restarts don't wait a minute.
  setTimeout(() => {
    void processDueEmails().catch((err) => log.error("outreach tick failed", { err }));
  }, 5_000);

  // IMAP polling for replies and bounces: every 5 minutes per mailbox (spec).
  const imapPoll = setInterval(() => {
    void pollAllMailboxes().catch((err) => log.error("imap poll crashed", { err }));
  }, 5 * 60_000);
  imapPoll.unref();
  setTimeout(() => {
    void pollAllMailboxes().catch((err) => log.error("imap poll crashed", { err }));
  }, 15_000);

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
