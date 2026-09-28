import * as cheerio from "cheerio";

/**
 * Pure HTML signal extraction for the website audit (spec: Pipeline /
 * Enrichment). Everything here is string/HTML in, data out — fully unit-tested
 * against the fixtures in fixtures/sites/.
 */

export interface PageSignals {
  copyrightYear: number | null;
  hasViewport: boolean;
  hasContactPath: boolean;
  platform: string | null;
  emails: string[];
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Emails that belong to the website builder's platform, not the business. */
const PLATFORM_EMAIL_DOMAINS = new Set([
  "wixpress.com",
  "wix.com",
  "squarespace.com",
  "squarespace.info",
  "mystrikingly.com",
  "weebly.com",
  "godaddy.com",
  "webflow.io",
  "wordpress.com",
  "shopify.com",
]);

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?)(\?|#|$)/i;

/** Extract signals from one page's HTML. */
export function extractPageSignals(html: string): PageSignals {
  const $ = cheerio.load(html);

  // Highest 4-digit year near © or "copyright".
  let copyrightYear: number | null = null;
  const text = $("body").text();
  const yearMatches = text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi);
  for (const m of yearMatches) {
    const year = Number(m[1]);
    if (year >= 1990 && year <= new Date().getFullYear() + 1) {
      if (copyrightYear === null || year > copyrightYear) copyrightYear = year;
    }
  }

  const hasViewport = $('meta[name="viewport"]').length > 0;

  // A contact path: a form with a message/email field, a tel: link, or a mailto: link.
  const hasForm =
    $("form input[type='email'], form textarea, form input[name*='message' i]").length > 0;
  const hasTel = $("a[href^='tel:']").length > 0;
  const hasMailto = $("a[href^='mailto:']").length > 0;
  const hasContactPath = hasForm || hasTel || hasMailto;

  const platform = detectPlatform($, html);

  // Emails: mailto hrefs + regex over visible text (not raw HTML, which
  // would catch image filenames like logo@2x.png inside attributes).
  const emails = new Set<string>();
  $("a[href^='mailto:']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const addr = href.replace(/^mailto:/i, "").split("?")[0].trim();
    if (isPlausibleEmail(addr)) emails.add(addr.toLowerCase());
  });
  for (const m of text.matchAll(EMAIL_RE)) {
    if (isPlausibleEmail(m[0])) emails.add(m[0].toLowerCase());
  }

  return { copyrightYear, hasViewport, hasContactPath, platform, emails: [...emails] };
}

function isPlausibleEmail(addr: string): boolean {
  if (!addr || addr.length > 254) return false;
  if (IMAGE_EXT_RE.test(addr)) return false; // image filename like photo.jpg
  const domain = addr.split("@")[1]?.toLowerCase() ?? "";
  if (PLATFORM_EMAIL_DOMAINS.has(domain)) return false;
  // Drop path-like artifacts (contains / or whitespace).
  if (/[/\s]/.test(addr)) return false;
  return true;
}

function detectPlatform($: cheerio.CheerioAPI, html: string): string | null {
  const generator = $('meta[name="generator"]').attr("content");
  if (generator) return generator.split(/\s+/)[0];
  const lower = html.toLowerCase();
  if (lower.includes("wp-content") || lower.includes("wp-includes")) return "WordPress";
  if (lower.includes("cdn.shopify")) return "Shopify";
  if (lower.includes("wixstatic")) return "Wix";
  if (lower.includes("squarespace")) return "Squarespace";
  if (lower.includes("wsimg.com") || lower.includes("godaddy websites")) return "GoDaddy";
  if (lower.includes("weebly")) return "Weebly";
  if (lower.includes("webflow")) return "Webflow";
  if (lower.includes("squarespace")) return "Squarespace";
  return null;
}

/** Merge signals across pages (homepage + contact/about pages). */
export function mergePageSignals(pages: PageSignals[]): PageSignals {
  const merged: PageSignals = {
    copyrightYear: null,
    hasViewport: false,
    hasContactPath: false,
    platform: null,
    emails: [],
  };
  const emails = new Set<string>();
  for (const p of pages) {
    if (p.copyrightYear !== null) {
      merged.copyrightYear =
        merged.copyrightYear === null
          ? p.copyrightYear
          : Math.max(merged.copyrightYear, p.copyrightYear);
    }
    merged.hasViewport ||= p.hasViewport;
    merged.hasContactPath ||= p.hasContactPath;
    merged.platform ||= p.platform;
    p.emails.forEach((e) => emails.add(e));
  }
  merged.emails = [...emails];
  return merged;
}
