import type { PageSignals } from "./extract";

/**
 * Pure website classification (spec: Pipeline / Enrichment).
 *
 * NONE               no websiteUri
 * SOCIAL_OR_DIRECTORY  facebook/yelp/linktr.ee/business.site/… host
 * DEAD               DNS/connection error, 4xx/5xx, or invalid TLS with no HTTP fallback
 * PARKED             parked-domain / for-sale page
 * OUTDATED / OK      by outdated-signal points: OUTDATED at 15+
 */

export type AuditClass =
  | "NONE"
  | "SOCIAL_OR_DIRECTORY"
  | "DEAD"
  | "PARKED"
  | "OUTDATED"
  | "OK";

/** Hosts that mean "no website of their own". */
export const SOCIAL_OR_DIRECTORY_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "yelp.com",
  "linktr.ee",
  "nextdoor.com",
  "business.site",
  "sites.google.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "yellowpages.com",
  "thumbtack.com",
  "angi.com",
  "houzz.com",
  "opentable.com",
  "grubhub.com",
  "doordash.com",
  "seamless.com",
  "ubereats.com",
  "booking.com",
  "tripadvisor.com",
]);

const PARKED_PATTERNS = [
  /this domain is for sale/i,
  /buy this domain/i,
  /domain (is )?for sale/i,
  /is for sale by its owner/i,
  /parked domain/i,
  /domain (has been )?parked/i,
  /future home of something quite cool/i, // Squarespace parking page
  /godaddy\.com\/domainsearch/i,
  /sedoparking\.com/i,
  /afternic\.com/i,
  /hugedomains\.com/i,
];

export function isSocialOrDirectoryHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  for (const social of SOCIAL_OR_DIRECTORY_HOSTS) {
    if (host === social || host.endsWith(`.${social}`)) return true;
  }
  return false;
}

export function matchesParkedPage(html: string): boolean {
  return PARKED_PATTERNS.some((re) => re.test(html));
}

export interface ClassifyInput extends PageSignals {
  /** Signal points come from Settings normally; defaults mirror the spec. */
  websiteUri: string | null;
  httpStatus: number | null;
  /** HTTPS reachable at all (false when only HTTP worked). */
  httpsOk: boolean;
  sitemapLastMod: Date | null;
  waybackLastChange: Date | null;
  /** The served page matched parked-domain patterns. */
  parkedPage?: boolean;
}

export interface ClassifyResult {
  websiteClass: AuditClass;
  findings: string[];
  outdatedPoints: number;
}

const DEFAULT_SIGNAL_POINTS = {
  oldCopyright: 15,
  noViewport: 10,
  staleContent: 10,
  noHttps: 8,
  noContactPath: 5,
} as const;

/** OUTDATED when outdated-signal points reach 15 or more. */
export const OUTDATED_THRESHOLD = 15;

export function classifyWebsite(input: ClassifyInput): ClassifyResult {
  if (!input.websiteUri) {
    return { websiteClass: "NONE", findings: ["No website"], outdatedPoints: 0 };
  }

  try {
    const host = new URL(input.websiteUri).hostname;
    if (isSocialOrDirectoryHost(host)) {
      return {
        websiteClass: "SOCIAL_OR_DIRECTORY",
        findings: [`Only a ${host.replace(/^www\./, "")} page — no website of their own`],
        outdatedPoints: 0,
      };
    }
  } catch {
    // Unparseable URI: treat as dead.
    return { websiteClass: "DEAD", findings: ["Website URL is broken"], outdatedPoints: 0 };
  }

  if (input.httpStatus === null || input.httpStatus >= 400) {
    return {
      websiteClass: "DEAD",
      findings: [
        input.httpStatus === null
          ? "Website is unreachable (connection or DNS failure)"
          : `Website returns HTTP ${input.httpStatus}`,
      ],
      outdatedPoints: 0,
    };
  }

  if (input.parkedPage) {
    return {
      websiteClass: "PARKED",
      findings: ["Domain is parked or listed for sale"],
      outdatedPoints: 0,
    };
  }

  // Signals and points (spec: Scoring / Need).
  const findings: string[] = [];
  let points = 0;
  const now = new Date();
  const currentYear = now.getFullYear();

  if (input.copyrightYear !== null && input.copyrightYear <= currentYear - 3) {
    points += DEFAULT_SIGNAL_POINTS.oldCopyright;
    findings.push(`Copyright ${input.copyrightYear}`);
  }
  if (!input.hasViewport) {
    points += DEFAULT_SIGNAL_POINTS.noViewport;
    findings.push("Not mobile-friendly");
  }
  const lastChange = latestDate(input.sitemapLastMod, input.waybackLastChange);
  if (lastChange && lastChange < new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())) {
    points += DEFAULT_SIGNAL_POINTS.staleContent;
    findings.push(`Last updated ${lastChange.toISOString().slice(0, 10)} — content is stale`);
  }
  if (!input.httpsOk) {
    points += DEFAULT_SIGNAL_POINTS.noHttps;
    findings.push("No working HTTPS");
  }
  if (!input.hasContactPath) {
    points += DEFAULT_SIGNAL_POINTS.noContactPath;
    findings.push("No contact form, phone, or email on the site");
  }

  return {
    websiteClass: points >= OUTDATED_THRESHOLD ? "OUTDATED" : "OK",
    findings,
    outdatedPoints: points,
  };
}

function latestDate(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a > b ? a : b;
  return a ?? b;
}
