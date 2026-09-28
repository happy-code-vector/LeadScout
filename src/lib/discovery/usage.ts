import type { PrismaClient } from "@prisma/client";
import type { CapProvider, UsageCounter } from "./budget";
import { prisma } from "../db";

/** Production UsageCounter backed by the ApiUsage table. */
export class PrismaUsageCounter implements UsageCounter {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getCount(month: string, sku: string): Promise<number> {
    const row = await this.db.apiUsage.findUnique({
      where: { month_sku: { month, sku } },
      select: { count: true },
    });
    return row?.count ?? 0;
  }

  async increment(month: string, sku: string): Promise<number> {
    const row = await this.db.apiUsage.upsert({
      where: { month_sku: { month, sku } },
      create: { month, sku, count: 1 },
      update: { count: { increment: 1 } },
    });
    return row.count;
  }
}

/** Cap provider reading Settings.placesMonthlyRequestCap. */
export const settingsCapProvider: CapProvider = {
  async getCap() {
    const settings = await prisma.settings.findUnique({
      where: { id: "singleton" },
      select: { placesMonthlyRequestCap: true },
    });
    return settings?.placesMonthlyRequestCap ?? 1000;
  },
};

/** Billed request count for the current month (for UI display). */
export async function monthlyUsage(sku: string): Promise<number> {
  return new PrismaUsageCounter().getCount(
    new Date().toISOString().slice(0, 7),
    sku,
  );
}
