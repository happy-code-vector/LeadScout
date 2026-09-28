import { describe, expect, it } from "vitest";
import { scoreLead, type ScoreInput, type ScoreSignals } from "./score";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "./weights";

const NOW = new Date("2026-06-15T12:00:00Z");

function signals(overrides: Partial<ScoreSignals> = {}): ScoreSignals {
  return {
    websiteClass: "NONE",
    copyrightYear: null,
    hasViewport: null,
    httpsOk: null,
    hasContactPath: null,
    sitemapLastMod: null,
    waybackLastChange: null,
    ...overrides,
  };
}

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    operational: true,
    isChain: false,
    suppressed: false,
    leadStatus: "NEW",
    websiteFindings: [],
    signals: signals(),
    reviewCount: 25,
    rating: 4.4,
    hasUsableEmail: false,
    hasPhone: true,
    hasPostalAddress: true,
    categoryPropensity: 9,
    ...overrides,
  };
}

describe("exclusions — no score", () => {
  it.each([
    ["not operational", { operational: false }],
    ["chain", { isChain: true }],
    ["suppressed", { suppressed: true }],
    ["do not contact", { leadStatus: "DO_NOT_CONTACT" }],
  ])("returns null when %s", (_name, overrides) => {
    expect(scoreLead(input(overrides as Partial<ScoreInput>), DEFAULT_WEIGHTS, NOW)).toBeNull();
  });
});

describe("need (0–50)", () => {
  it("NONE scores the full 50", () => {
    const r = scoreLead(input(), DEFAULT_WEIGHTS, NOW)!;
    expect(r.need).toBe(50);
    expect(r.reasons).toContain("No website");
  });

  it("never-audited is treated like NONE", () => {
    const r = scoreLead(input({ signals: signals({ websiteClass: null }) }), DEFAULT_WEIGHTS, NOW)!;
    expect(r.need).toBe(50);
  });

  it.each([
    ["SOCIAL_OR_DIRECTORY", 45],
    ["DEAD", 45],
    ["PARKED", 45],
  ])("%s scores 45 and uses the audit finding", (cls, points) => {
    const r = scoreLead(
      input({
        signals: signals({ websiteClass: cls }),
        websiteFindings: [`finding for ${cls}`],
      }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.need).toBe(points);
    expect(r.reasons[0]).toBe(`finding for ${cls}`);
  });

  it("OUTDATED sums signals, capped at 40", () => {
    // All signals present: 15 + 10 + 10 + 8 + 5 = 48 → capped at 40.
    const r = scoreLead(
      input({
        signals: signals({
          websiteClass: "OUTDATED",
          copyrightYear: 2015,
          hasViewport: false,
          httpsOk: false,
          hasContactPath: false,
          sitemapLastMod: new Date("2019-01-01"),
        }),
      }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.need).toBe(40);
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        "Copyright 2015",
        "Not mobile-friendly",
        "Site unchanged since 2019",
        "No working HTTPS",
        "No contact form, phone, or email on the site",
      ]),
    );
  });

  it("OK with a single weak signal stays under the cap", () => {
    const r = scoreLead(
      input({
        signals: signals({ websiteClass: "OK", copyrightYear: NOW.getFullYear(), hasViewport: true, httpsOk: true, hasContactPath: false }),
      }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.need).toBe(5);
  });

  it.each([
    ["copyright exactly current-3 counts as old", { copyrightYear: NOW.getFullYear() - 3 }, 15],
    ["copyright current-2 is fine", { copyrightYear: NOW.getFullYear() - 2 }, 0],
    ["no viewport", { hasViewport: false }, 10],
    ["stale sitemap (24+ months)", { sitemapLastMod: new Date("2023-06-14") }, 10],
    ["sitemap 23 months old is fine", { sitemapLastMod: new Date("2024-07-15") }, 0],
    ["no https", { httpsOk: false }, 8],
    ["no contact path", { hasContactPath: false }, 5],
  ])("%s", (_name, signalOverrides, expectedPoints) => {
    const r = scoreLead(
      input({
        signals: signals({
          websiteClass: "OK",
          copyrightYear: NOW.getFullYear(),
          hasViewport: true,
          httpsOk: true,
          hasContactPath: true,
          ...(signalOverrides as Partial<ScoreSignals>),
        }),
      }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.need).toBe(expectedPoints);
  });

  it("takes the fresher of sitemap vs wayback for staleness", () => {
    const r = scoreLead(
      input({
        signals: signals({
          websiteClass: "OK",
          copyrightYear: NOW.getFullYear(),
          hasViewport: true,
          httpsOk: true,
          hasContactPath: true,
          sitemapLastMod: new Date("2019-01-01"), // stale
          waybackLastChange: new Date("2026-01-01"), // fresh — wins
        }),
      }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.need).toBe(0);
  });

  it("null signal fields (unknown) never add points", () => {
    const r = scoreLead(
      input({ signals: signals({ websiteClass: "OK" }) }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.need).toBe(0);
  });
});

describe("viability (0–25)", () => {
  it.each([
    [0, 4],
    [1, 12],
    [9, 12],
    [10, 20],
    [49, 20],
    [50, 25],
    [199, 25],
    [200, 18],
    [null, 4],
  ])("%p reviews → %p points", (reviews, expected) => {
    const r = scoreLead(input({ reviewCount: reviews }), DEFAULT_WEIGHTS, NOW)!;
    expect(r.viability).toBe(expected);
  });

  it("rating below 3.0 applies the −5 penalty", () => {
    const r = scoreLead(input({ rating: 2.7, reviewCount: 50 }), DEFAULT_WEIGHTS, NOW)!;
    expect(r.viability).toBe(20);
    expect(r.reasons).toContain("Rated 2.7 on Google");
  });

  it("penalty floors viability at 0", () => {
    const r = scoreLead(input({ rating: 1.5, reviewCount: 0 }), DEFAULT_WEIGHTS, NOW)!;
    expect(r.viability).toBe(0);
  });

  it("neutral rating adds nothing", () => {
    const r = scoreLead(input({ rating: 4.0 }), DEFAULT_WEIGHTS, NOW)!;
    expect(r.viability).toBe(20);
  });

  it("null rating never triggers the penalty", () => {
    const r = scoreLead(input({ rating: null }), DEFAULT_WEIGHTS, NOW)!;
    expect(r.viability).toBe(20);
  });
});

describe("reachability (0–15)", () => {
  it("email + phone + postal = 8 + 6 + 1, capped at 15", () => {
    const r = scoreLead(input({ hasUsableEmail: true }), DEFAULT_WEIGHTS, NOW)!;
    expect(r.reachability).toBe(15);
    expect(r.reasons).toContain("Email found on site");
  });

  it("phone + postal caps at 7", () => {
    const r = scoreLead(input({ hasUsableEmail: false }), DEFAULT_WEIGHTS, NOW)!;
    expect(r.reachability).toBe(7);
  });

  it("nothing reachable is 0", () => {
    const r = scoreLead(
      input({ hasUsableEmail: false, hasPhone: false, hasPostalAddress: false }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.reachability).toBe(0);
  });
});

describe("category fit", () => {
  it("uses the category propensity", () => {
    expect(scoreLead(input({ categoryPropensity: 7 }), DEFAULT_WEIGHTS, NOW)!.categoryFit).toBe(7);
  });

  it("clamps to 0–10", () => {
    expect(scoreLead(input({ categoryPropensity: 13 }), DEFAULT_WEIGHTS, NOW)!.categoryFit).toBe(10);
    expect(scoreLead(input({ categoryPropensity: -2 }), DEFAULT_WEIGHTS, NOW)!.categoryFit).toBe(0);
  });
});

describe("tiers", () => {
  // Reachability sums are discrete (email 8, phone 6, postal 1 — cap 15) and
  // need is a signal sum, so each boundary is built from an explicit input
  // whose total is asserted first.
  const cases: Array<{ total: number; tier: string; overrides: Partial<ScoreInput> }> = [
    // 25 (copyright+stale) + 25 (50–199 reviews) + 15 + 10 = 75 → A
    {
      total: 75,
      tier: "A",
      overrides: {
        signals: signals({ websiteClass: "OUTDATED", copyrightYear: 2015, sitemapLastMod: new Date("2019-01-01"), hasViewport: true, httpsOk: true, hasContactPath: true }),
        reviewCount: 50,
        hasUsableEmail: true,
        categoryPropensity: 10,
      },
    },
    // 25 + 25 + 14 (email+phone, no postal) + 10 = 74 → B
    {
      total: 74,
      tier: "B",
      overrides: {
        signals: signals({ websiteClass: "OUTDATED", copyrightYear: 2015, sitemapLastMod: new Date("2019-01-01"), hasViewport: true, httpsOk: true, hasContactPath: true }),
        reviewCount: 50,
        hasUsableEmail: true,
        hasPostalAddress: false,
        categoryPropensity: 10,
      },
    },
    // 20 (copyright+no-contact) + 25 + 15 + 0 = 60 → B
    {
      total: 60,
      tier: "B",
      overrides: {
        signals: signals({ websiteClass: "OK", copyrightYear: 2015, hasViewport: true, httpsOk: true, hasContactPath: false }),
        reviewCount: 50,
        hasUsableEmail: true,
        categoryPropensity: 0,
      },
    },
    // 25 + 25 + 9 (email+postal, no phone) + 0 = 59 → C
    {
      total: 59,
      tier: "C",
      overrides: {
        signals: signals({ websiteClass: "OUTDATED", copyrightYear: 2015, sitemapLastMod: new Date("2019-01-01"), hasViewport: true, httpsOk: true, hasContactPath: true }),
        reviewCount: 50,
        hasUsableEmail: true,
        hasPhone: false,
        categoryPropensity: 0,
      },
    },
    // 10 (no viewport) + 20 (10–49 reviews) + 15 + 0 = 45 → C
    {
      total: 45,
      tier: "C",
      overrides: {
        signals: signals({ websiteClass: "OK", copyrightYear: NOW.getFullYear(), hasViewport: false, httpsOk: true, hasContactPath: true }),
        reviewCount: 10,
        hasUsableEmail: true,
        categoryPropensity: 0,
      },
    },
    // 20 + 18 (200+ reviews) + 6 (phone only) + 0 = 44 → D
    {
      total: 44,
      tier: "D",
      overrides: {
        signals: signals({ websiteClass: "OK", copyrightYear: 2015, hasViewport: true, httpsOk: true, hasContactPath: false }),
        reviewCount: 250,
        hasUsableEmail: false,
        hasPostalAddress: false,
        categoryPropensity: 0,
      },
    },
  ];

  it.each(cases)("total $total maps to tier $tier", ({ total, tier, overrides }) => {
    const r = scoreLead(input(overrides), DEFAULT_WEIGHTS, NOW)!;
    expect(r.total).toBe(total);
    expect(r.tier).toBe(tier);
  });

  it("a perfect lead scores 100 and lands in A", () => {
    const r = scoreLead(
      input({
        signals: signals({ websiteClass: "NONE" }),
        reviewCount: 50,
        rating: 4.8,
        hasUsableEmail: true,
        categoryPropensity: 10,
      }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.total).toBe(100);
    expect(r.tier).toBe("A");
  });
});

describe("custom weights", () => {
  it("uses weights from Settings instead of defaults", () => {
    const custom: ScoringWeights = structuredClone(DEFAULT_WEIGHTS);
    custom.need.none = 30;
    custom.tiers.A = 90;
    const r = scoreLead(input(), custom, NOW)!;
    expect(r.need).toBe(30);
    expect(r.tier).toBe("B"); // 30 + 20 + 15 + 9 = 74 < 90
  });
});

describe("reasons", () => {
  it("reads naturally and dedupes", () => {
    const r = scoreLead(
      input({
        signals: signals({ websiteClass: "NONE" }),
        reviewCount: 38,
        rating: 4.6,
        hasUsableEmail: true,
        categoryPropensity: 9,
      }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.reasons).toEqual([
      "No website",
      "38 Google reviews, active business",
      "Email found on site",
      "Phone number on the listing",
    ]);
  });

  it("caps at 5 reasons", () => {
    const r = scoreLead(
      input({
        signals: signals({
          websiteClass: "OUTDATED",
          copyrightYear: 2014,
          hasViewport: false,
          httpsOk: false,
          hasContactPath: false,
          sitemapLastMod: new Date("2018-01-01"),
        }),
        rating: 2.4,
        hasUsableEmail: true,
      }),
      DEFAULT_WEIGHTS,
      NOW,
    )!;
    expect(r.reasons.length).toBeLessThanOrEqual(5);
  });
});
