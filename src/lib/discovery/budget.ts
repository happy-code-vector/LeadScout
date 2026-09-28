/**
 * Budget guard for billed Places requests. Counts billed requests per
 * calendar month in ApiUsage and stops a run cleanly at the cap
 * (spec: Pipeline / Discovery / Budget guard).
 */

export const SKU_TEXT_SEARCH_ENTERPRISE = "text-search-enterprise";
export const SKU_TEXT_SEARCH_IDS = "text-search-essentials-ids";

/** Billed price beyond the 1,000 free requests/month, in dollars per request. */
export const PRICE_PER_REQUEST = 0.035;
export const FREE_TIER_REQUESTS = 1000;

/** Calendar month key, e.g. "2026-09". */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export class CapReachedError extends Error {
  constructor(
    public readonly used: number,
    public readonly cap: number,
  ) {
    super(`Places monthly request cap reached (${used}/${cap})`);
    this.name = "CapReachedError";
  }
}

export interface UsageCounter {
  getCount(month: string, sku: string): Promise<number>;
  increment(month: string, sku: string): Promise<number>;
}

export interface CapProvider {
  getCap(): Promise<number>;
}

export class BudgetGuard {
  constructor(
    private readonly counter: UsageCounter,
    private readonly capProvider: CapProvider,
  ) {}

  /** Throws CapReachedError when the next billed request would exceed the cap. */
  async assertAllowed(sku: string = SKU_TEXT_SEARCH_ENTERPRISE): Promise<void> {
    const month = currentMonth();
    const [used, cap] = await Promise.all([
      this.counter.getCount(month, sku),
      this.capProvider.getCap(),
    ]);
    if (used >= cap) throw new CapReachedError(used, cap);
  }

  /** Record one billed request; returns the new count. */
  async record(sku: string = SKU_TEXT_SEARCH_ENTERPRISE): Promise<number> {
    return this.counter.increment(currentMonth(), sku);
  }
}

/** Estimated spend this month: max(0, used − free) × $0.035. */
export function estimatedSpend(used: number): number {
  return Math.max(0, used - FREE_TIER_REQUESTS) * PRICE_PER_REQUEST;
}
