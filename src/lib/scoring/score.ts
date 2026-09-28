import type { ScoringWeights } from "./weights";
import { DEFAULT_WEIGHTS } from "./weights";

/**
 * The scoring model (spec: Pipeline / Scoring) — a pure function.
 *
 *   total = need (0–50) + viability (0–25) + reachability (0–15) + categoryFit (0–10)
 *
 * Every point value comes from Settings.scoringWeights (defaults in
 * weights.ts). Returns null for excluded businesses (no score, no campaigns).
 */

export interface ScoreSignals {
  websiteClass: string | null;
  copyrightYear: number | null;
  hasViewport: boolean | null;
  httpsOk: boolean | null;
  hasContactPath: boolean | null;
  sitemapLastMod: Date | null;
  waybackLastChange: Date | null;
}

export interface ScoreInput {
  operational: boolean;
  isChain: boolean;
  suppressed: boolean;
  leadStatus: string | null;
  /** Human-readable audit findings, e.g. "Not mobile-friendly". */
  websiteFindings: string[];
  signals: ScoreSignals;
  reviewCount: number | null;
  rating: number | null;
  /** A verified or website-sourced email exists (campaign-usable). */
  hasUsableEmail: boolean;
  hasPhone: boolean;
  hasPostalAddress: boolean;
  categoryPropensity: number;
}

export type ScoreTier = "A" | "B" | "C" | "D";

export interface ScoreResult {
  total: number;
  tier: ScoreTier;
  need: number;
  viability: number;
  reachability: number;
  categoryFit: number;
  reasons: string[];
}

export function scoreLead(
  input: ScoreInput,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  now: Date = new Date(),
): ScoreResult | null {
  // Exclusions (spec: no score; excluded from campaigns).
  if (!input.operational) return null;
  if (input.isChain) return null;
  if (input.suppressed) return null;
  if (input.leadStatus === "DO_NOT_CONTACT") return null;

  const need = scoreNeed(input, weights, now);
  const viability = scoreViability(input, weights);
  const reachability = scoreReachability(input, weights);
  const categoryFit = Math.min(10, Math.max(0, input.categoryPropensity));

  const total = need.points + viability.points + reachability.points + categoryFit;
  const tier = total >= weights.tiers.A ? "A" : total >= weights.tiers.B ? "B" : total >= weights.tiers.C ? "C" : "D";

  const reasons = dedupe([
    ...need.reasons,
    ...viability.reasons,
    ...reachability.reasons,
  ]).slice(0, 5);

  return {
    total,
    tier,
    need: need.points,
    viability: viability.points,
    reachability: reachability.points,
    categoryFit,
    reasons,
  };
}

function scoreNeed(
  input: ScoreInput,
  weights: ScoringWeights,
  now: Date,
): { points: number; reasons: string[] } {
  const w = weights.need;
  const cls = input.signals.websiteClass;

  switch (cls) {
    case null:
      // Never audited: treat like NONE (we can't tell yet).
      return { points: w.none, reasons: ["No website on record"] };
    case "NONE":
      return { points: w.none, reasons: ["No website"] };
    case "SOCIAL_OR_DIRECTORY":
      return { points: w.socialOrDirectory, reasons: firstFindingOr(input, "Only a social/directory page — no website of their own") };
    case "DEAD":
      return { points: w.dead, reasons: firstFindingOr(input, "Website is down") };
    case "PARKED":
      return { points: w.parked, reasons: firstFindingOr(input, "Domain is parked/for sale") };
    case "OUTDATED":
    case "OK": {
      const s = w.signals;
      let points = 0;
      const reasons: string[] = [];

      const year = input.signals.copyrightYear;
      if (year !== null && year <= now.getFullYear() - 3) {
        points += s.oldCopyright;
        reasons.push(`Copyright ${year}`);
      }
      if (input.signals.hasViewport === false) {
        points += s.noViewport;
        reasons.push("Not mobile-friendly");
      }
      const lastChange = input.signals.sitemapLastMod && input.signals.waybackLastChange
        ? new Date(Math.max(input.signals.sitemapLastMod.getTime(), input.signals.waybackLastChange.getTime()))
        : (input.signals.sitemapLastMod ?? input.signals.waybackLastChange);
      if (lastChange) {
        const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
        if (lastChange < twoYearsAgo) {
          points += s.staleContent;
          reasons.push(`Site unchanged since ${lastChange.getFullYear()}`);
        }
      }
      if (input.signals.httpsOk === false) {
        points += s.noHttps;
        reasons.push("No working HTTPS");
      }
      if (input.signals.hasContactPath === false) {
        points += s.noContactPath;
        reasons.push("No contact form, phone, or email on the site");
      }

      return { points: Math.min(points, w.withSiteCap), reasons };
    }
    default:
      return { points: 0, reasons: [] };
  }
}

function scoreViability(
  input: ScoreInput,
  weights: ScoringWeights,
): { points: number; reasons: string[] } {
  const w = weights.viability.reviews;
  const reviews = input.reviewCount ?? 0;
  let points: number;
  if (reviews === 0) points = w.zero;
  else if (reviews <= 9) points = w.oneToNine;
  else if (reviews <= 49) points = w.tenToFortyNine;
  else if (reviews <= 199) points = w.fiftyToOneNinetyNine;
  else points = w.twoHundredPlus;

  const reasons: string[] = [];
  if (reviews === 0) reasons.push("No Google reviews yet");
  else if (reviews >= 200) reasons.push(`${reviews} Google reviews — may already have an agency`);
  else reasons.push(`${reviews} Google reviews, active business`);

  if (input.rating !== null && input.rating < 3.0) {
    points += weights.viability.lowRatingPenalty;
    reasons.push(`Rated ${input.rating} on Google`);
  }

  return { points: Math.max(0, Math.min(points, 25)), reasons };
}

function scoreReachability(
  input: ScoreInput,
  weights: ScoringWeights,
): { points: number; reasons: string[] } {
  const w = weights.reachability;
  let points = 0;
  const reasons: string[] = [];
  if (input.hasUsableEmail) {
    points += w.email;
    reasons.push("Email found on site");
  }
  if (input.hasPhone) {
    points += w.phone;
    reasons.push("Phone number on the listing");
  }
  if (input.hasPostalAddress) {
    points += w.postal;
  }
  return { points: Math.min(points, w.cap), reasons };
}

function firstFindingOr(input: ScoreInput, fallback: string): string[] {
  return input.websiteFindings.length > 0 ? [input.websiteFindings[0]] : [fallback];
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
