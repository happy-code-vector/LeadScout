import "dotenv/config";
import PgBoss from "pg-boss";
import { env } from "../lib/env";
import { log } from "../lib/logger";

/**
 * LeadScout background worker. Runs pg-boss on Postgres — no Redis.
 * Jobs are registered per build phase; every job must be idempotent and
 * safe to retry (spec: Conventions).
 */

const boss = new PgBoss({ connectionString: env.DATABASE_URL });

async function main() {
  boss.on("error", (err) => log.error("pg-boss error", { err }));

  await boss.start();
  log.info("worker started", {
    queues: await boss.getQueues().then((qs) => qs.map((q) => q.name)),
  });

  const shutdown = async (signal: string) => {
    log.info("worker stopping", { signal });
    await boss.stop({ graceful: true, timeout: 10_000 });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error("worker fatal", { err });
  process.exit(1);
});
