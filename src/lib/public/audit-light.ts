import { classifyWebsite, matchesParkedPage, type AuditClass } from "../audit/classify";
import { extractPageSignals } from "../audit/extract";
import { fetchGuarded } from "./guarded-fetch";

export interface LightAuditDeps {
  fetchPage: typeof fetchGuarded;
  fetchSitemapLastMod: (origin: URL) => Promise<Date | null>;
}

async function sitemapLastModGuarded(origin: URL): Promise<Date | null> {
  try {
    const res = await fetchGuarded(new URL("sitemap.xml", origin), { timeoutMs: 6_000, maxHops: 1 });
    if (res.status !== 200 || !res.html) return null;
    const dates = [...res.html.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)]
      .map((m) => new Date(m[1]))
      .filter((d) => !Number.isNaN(d.getTime()));
    return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  } catch {
    return null;
  }
}

const REAL_DEPS: LightAuditDeps = { fetchPage: fetchGuarded, fetchSitemapLastMod: sitemapLastModGuarded };

export interface LightAuditResult {
  finalUrl: string | null;
  websiteClass: AuditClass;
  findings: string[];
}

/** Homepage + sitemap only — the polite, fast path used by the public tool. */
export async function runLightAudit(url: URL, deps: LightAuditDeps = REAL_DEPS): Promise<LightAuditResult> {
  let page: Awaited<ReturnType<typeof fetchGuarded>>;
  try {
    page = await deps.fetchPage(url);
  } catch {
    return { finalUrl: null, websiteClass: "DEAD", findings: ["The site could not be reached"] };
  }
  if (page.status >= 400) {
    return { finalUrl: page.finalUrl, websiteClass: "DEAD", findings: [`The site responded with HTTP ${page.status}`] };
  }
  if (matchesParkedPage(page.html)) {
    return { finalUrl: page.finalUrl, websiteClass: "PARKED", findings: ["The domain is parked or listed for sale"] };
  }
  const signals = extractPageSignals(page.html);
  const sitemapLastMod = await deps.fetchSitemapLastMod(new URL(page.finalUrl)).catch(() => null);
  const result = classifyWebsite({
    copyrightYear: signals.copyrightYear,
    hasViewport: signals.hasViewport,
    hasContactPath: signals.hasContactPath,
    platform: null, // platform is internal signal noise; never shown publicly
    emails: [], // never surface emails in public results
    websiteUri: url.toString(),
    httpStatus: page.status,
    httpsOk: page.finalUrl.startsWith("https:"),
    sitemapLastMod,
    waybackLastChange: null,
    parkedPage: false,
  });
  return { finalUrl: page.finalUrl, websiteClass: result.websiteClass, findings: result.findings };
}
