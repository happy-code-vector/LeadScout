import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, parseWeights, scoringWeightsSchema } from "./weights";

describe("scoring weights", () => {
  it("defaults satisfy the schema", () => {
    expect(scoringWeightsSchema.parse(DEFAULT_WEIGHTS)).toEqual(DEFAULT_WEIGHTS);
  });

  it("round-trips through parseWeights", () => {
    expect(parseWeights(DEFAULT_WEIGHTS)).toEqual(DEFAULT_WEIGHTS);
  });

  it("rejects weights missing a section", () => {
    const broken = { ...DEFAULT_WEIGHTS, reachability: undefined };
    expect(() => parseWeights(broken)).toThrow();
  });

  it("rejects non-numeric point values", () => {
    const broken = structuredClone(DEFAULT_WEIGHTS);
    (broken.need as { none: unknown }).none = "fifty";
    expect(() => parseWeights(broken)).toThrow();
  });

  it("keeps spec point values", () => {
    expect(DEFAULT_WEIGHTS.need.none).toBe(50);
    expect(DEFAULT_WEIGHTS.need.signals.oldCopyright).toBe(15);
    expect(DEFAULT_WEIGHTS.viability.reviews.fiftyToOneNinetyNine).toBe(25);
    expect(DEFAULT_WEIGHTS.reachability.email).toBe(8);
    expect(DEFAULT_WEIGHTS.tiers.A).toBe(75);
  });
});
