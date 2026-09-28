import type { Job } from "@prisma/client";
import { prisma } from "./db";
import { log } from "./logger";

/**
 * Built-in background job queue on SQLite. The worker process polls the Job
 * table, claims due jobs, and runs registered handlers. Jobs must be
 * idempotent and safe to retry (spec: Conventions).
 */

export type JobHandler = (payload: unknown, job: Job) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export async function enqueue(
  type: string,
  payload: Record<string, unknown> = {},
  options: { runAt?: Date; maxAttempts?: number } = {},
): Promise<Job> {
  return prisma.job.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 3,
    },
  });
}

/** Exponential backoff between retries: 10s, 20s, 40s, capped at 5 min. */
function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 10_000 * 2 ** (attempts - 1));
}

/**
 * Claim the next due PENDING job. The claim is a conditional update, so only
 * one poller can take a given job even with several worker processes.
 */
export async function claimNextJob(): Promise<Job | null> {
  const candidate = await prisma.job.findFirst({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
  });
  if (!candidate) return null;
  const claimed = await prisma.job.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  return prisma.job.findUnique({ where: { id: candidate.id } });
}

/** Run one claimed job; mark DONE, or requeue with backoff until maxAttempts. */
export async function runJob(job: Job): Promise<void> {
  const handler = handlers.get(job.type);
  let payload: unknown = {};
  try {
    payload = JSON.parse(job.payload || "{}");
  } catch {
    // Malformed payload is a programming error; fail without retry.
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", lastError: "malformed payload JSON" },
    });
    log.error("job malformed", { jobId: job.id, type: job.type });
    return;
  }

  try {
    if (!handler) throw new Error(`no handler registered for job type "${job.type}"`);
    await handler(payload, job);
    await prisma.job.update({ where: { id: job.id }, data: { status: "DONE" } });
    log.info("job done", { jobId: job.id, type: job.type, attempts: job.attempts });
  } catch (err) {
    const retry = job.attempts < job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: retry ? "PENDING" : "FAILED",
        runAt: retry ? new Date(Date.now() + backoffMs(job.attempts)) : undefined,
        lastError: err instanceof Error ? err.message : String(err),
      },
    });
    log.warn("job failed", {
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      willRetry: retry,
      err,
    });
  }
}

/** Run due jobs until the queue is empty; returns how many ran. */
export async function drainQueue(): Promise<number> {
  let ran = 0;
  for (;;) {
    const job = await claimNextJob();
    if (!job) return ran;
    await runJob(job);
    ran += 1;
  }
}

/**
 * Recover jobs left RUNNING by a crashed worker: anything RUNNING for over
 * 30 minutes goes back to PENDING (handlers are idempotent, so a re-run is
 * safe). Called once at worker startup.
 */
export async function recoverStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 60_000);
  const res = await prisma.job.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: cutoff } },
    data: { status: "PENDING" },
  });
  return res.count;
}

/** Delete DONE/FAILED jobs older than a day so the table stays small. */
export async function pruneOldJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const res = await prisma.job.deleteMany({
    where: { status: { in: ["DONE", "FAILED"] }, updatedAt: { lt: cutoff } },
  });
  return res.count;
}
