import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// SQLite: WAL mode lets the web app read while the worker writes. The mode
// persists in the database file, so only set it when it isn't already WAL —
// setting it takes a brief exclusive lock, which fails if another process
// (dev server or worker) has the file open.
async function ensureWal(): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<Array<{ journal_mode: string }>>`PRAGMA journal_mode;`;
    if (rows[0]?.journal_mode !== "wal") {
      await prisma.$queryRaw`PRAGMA journal_mode=WAL;`;
    }
  } catch {
    // Best-effort: another process holds the lock and will have set WAL.
  }
}
void ensureWal();
