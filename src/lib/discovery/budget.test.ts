import { describe, expect, it } from "vitest";
import {
  BudgetGuard,
  CapReachedError,
  SKU_TEXT_SEARCH_ENTERPRISE,
  estimatedSpend,
} from "./budget";

function makeCounter(start = 0) {
  const counts = new Map<string, number>();
  return {
    counts,
    async getCount(month: string, sku: string) {
      return counts.get(`${month}|${sku}`) ?? start;
    },
    async increment(month: string, sku: string) {
      const key = `${month}|${sku}`;
      const next = (counts.get(key) ?? start) + 1;
      counts.set(key, next);
      return next;
    },
  };
}

describe("BudgetGuard", () => {
  it("allows requests below the cap and records them", async () => {
    const counter = makeCounter();
    const guard = new BudgetGuard(counter, { getCap: async () => 3 });
    await guard.assertAllowed();
    expect(await guard.record()).toBe(1);
    await guard.assertAllowed();
    await guard.record();
    await guard.assertAllowed();
    await guard.record();
    expect(await counter.getCount("x", SKU_TEXT_SEARCH_ENTERPRISE)).toBe(0); // key includes real month
  });

  it("throws CapReachedError when the count reaches the cap", async () => {
    const counter = makeCounter();
    const guard = new BudgetGuard(counter, { getCap: async () => 2 });
    await guard.record();
    await guard.record();
    await expect(guard.assertAllowed()).rejects.toThrow(CapReachedError);
    try {
      await guard.assertAllowed();
    } catch (e) {
      expect(e).toBeInstanceOf(CapReachedError);
      expect((e as CapReachedError).cap).toBe(2);
      expect((e as CapReachedError).used).toBe(2);
    }
  });

  it("never records past the cap when the caller checks first", async () => {
    const counter = makeCounter();
    const guard = new BudgetGuard(counter, { getCap: async () => 1 });
    let stopped = false;
    for (let i = 0; i < 5; i++) {
      try {
        await guard.assertAllowed();
        await guard.record();
      } catch {
        stopped = true;
        break;
      }
    }
    expect(stopped).toBe(true);
    expect([...counter.counts.values()].every((c) => c <= 1)).toBe(true);
  });

  it("uses an injected cap, so Settings changes take effect", async () => {
    let cap = 1;
    const counter = makeCounter();
    const guard = new BudgetGuard(counter, { getCap: async () => cap });
    await guard.record();
    await expect(guard.assertAllowed()).rejects.toThrow();
    cap = 10;
    await guard.assertAllowed(); // now fine
  });
});

describe("estimatedSpend", () => {
  it("is zero inside the free tier", () => {
    expect(estimatedSpend(0)).toBe(0);
    expect(estimatedSpend(1000)).toBe(0);
  });

  it("charges $0.035 per request beyond the free tier", () => {
    expect(estimatedSpend(1001)).toBeCloseTo(0.035, 6);
    expect(estimatedSpend(2000)).toBeCloseTo(35, 6);
  });
});
