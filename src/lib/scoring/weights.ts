import { z } from "zod";

/**
 * The shape of Settings.scoringWeights. Every point value in the scoring
 * model lives here — never hardcoded in the scorer — so the owner can tune
 * weights in Settings and rescore.
 */

export const scoringWeightsSchema = z.object({
  need: z.object({
    // No websiteUri at all.
    none: z.number().int().min(0),
    // Social/directory listing, dead, or parked site.
    socialOrDirectory: z.number().int().min(0),
    dead: z.number().int().min(0),
    parked: z.number().int().min(0),
    // OUTDATED/OK: sum of signal points, capped here.
    withSiteCap: z.number().int().min(0),
    signals: z.object({
      // Copyright year <= current - 3.
      oldCopyright: z.number().int().min(0),
      // No <meta name="viewport">.
      noViewport: z.number().int().min(0),
      // Sitemap/Wayback last change more than 24 months ago.
      staleContent: z.number().int().min(0),
      // No working HTTPS.
      noHttps: z.number().int().min(0),
      // No contact form, tel: or mailto: link.
      noContactPath: z.number().int().min(0),
    }),
  }),
  viability: z.object({
    // Review-count bands (busy, established business = can pay).
    reviews: z.object({
      zero: z.number().int(),
      oneToNine: z.number().int(),
      tenToFortyNine: z.number().int(),
      fiftyToOneNinetyNine: z.number().int(),
      twoHundredPlus: z.number().int(),
    }),
    // Rating below 3.0 penalty (may be negative).
    lowRatingPenalty: z.number().int(),
  }),
  reachability: z.object({
    email: z.number().int().min(0),
    phone: z.number().int().min(0),
    postal: z.number().int().min(0),
    cap: z.number().int().min(0),
  }),
  tiers: z.object({
    A: z.number().int(),
    B: z.number().int(),
    C: z.number().int(),
  }),
});

export type ScoringWeights = z.infer<typeof scoringWeightsSchema>;

/** Defaults transcribed from spec.md "Scoring". */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  need: {
    none: 50,
    socialOrDirectory: 45,
    dead: 45,
    parked: 45,
    withSiteCap: 40,
    signals: {
      oldCopyright: 15,
      noViewport: 10,
      staleContent: 10,
      noHttps: 8,
      noContactPath: 5,
    },
  },
  viability: {
    reviews: {
      zero: 4,
      oneToNine: 12,
      tenToFortyNine: 20,
      fiftyToOneNinetyNine: 25,
      twoHundredPlus: 18,
    },
    lowRatingPenalty: -5,
  },
  reachability: {
    email: 8,
    phone: 6,
    postal: 1,
    cap: 15,
  },
  tiers: {
    A: 75,
    B: 60,
    C: 45,
  },
};

/** Parse arbitrary JSON (e.g. from the DB or the Settings form) into weights. */
export function parseWeights(input: unknown): ScoringWeights {
  return scoringWeightsSchema.parse(input);
}
