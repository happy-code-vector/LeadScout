import { prisma } from "../db";
import { log } from "../logger";
import { toJson } from "../domain";
import { classifyWebsite, isSocialOrDirectoryHost, matchesParkedPage } from "./classify";
import { extractPageSignals, mergePageSignals, type PageSignals } from "./extract";
import {
  SiteUnreachableError,
  fetchPage,
  fetchRobots,
  fetchSitemapLastMod,
  fetchWaybackLastChange,
} from "./fetcher";

/**
 * Website audit orchestration (spec: Pipeline / Enrichment).
 * Re-audit cadence: every 90 days. Concurrency: Settings.auditConcurrency
 * (default 8), 10 s timeout per request, robots.txt respected for pages
 * beyond the homepage.
 */

const RE_AUDIT_DAYS = 90;
const CONTACT_PATHS = ["/contact", "/contact-us", "/about"];

export interface AuditOutcome {
  businessId: string;
  websiteClass: string;
  emails: string[];
}

export async function auditBusiness(businessId: string): Promise<AuditOutcome> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, websiteUri: true },
  });
  if (!business) throw new Error(`business ${businessId} not found`);

  const signals = business.websiteUri ? await auditSite(business.websiteUri) : null;
  const result = classifyWebsite(
    signals
      ? {
          ...signals.pageSignals,
          websiteUri: business.websiteUri,
          httpStatus: signals.httpStatus,
          httpsOk: signals.httpsOk,
          sitemapLastMod: signals.sitemapLastMod,
          waybackLastChange: signals.waybackLastChange,
          parkedPage: signals.parked,
        }
      : {
          copyrightYear: null,
          hasViewport: false,
          hasContactPath: false,
          platform: null,
          emails: [],
          websiteUri: null,
          httpStatus: null,
          httpsOk: false,
          sitemapLastMod: null,
          waybackLastChange: null,
        },
  );

  const auditData = {
    checkedAt: new Date(),
    finalUrl: signals?.finalUrl ?? null,
    httpStatus: signals?.httpStatus ?? null,
    websiteClass: result.websiteClass,
    copyrightYear: signals?.pageSignals.copyrightYear ?? null,
    hasViewport: signals ? signals.pageSignals.hasViewport : null,
    httpsOk: signals ? signals.httpsOk : null,
    sitemapLastMod: signals?.sitemapLastMod ?? null,
    waybackLastChange: signals?.waybackLastChange ?? null,
    hasContactPath: signals ? signals.pageSignals.hasContactPath : null,
    platform: signals?.pageSignals.platform ?? null,
    findings: toJson(result.findings),
    emailsFound: toJson(signals?.pageSignals.emails ?? []),
  };

  await prisma.websiteAudit.upsert({
    where: { businessId },
    update: auditData,
    create: { businessId, ...auditData },
  });

  // Store extracted emails as website-sourced EMAIL contacts.
  for (const email of signals?.pageSignals.emails ?? []) {
    await prisma.contact.upsert({
      where: {
        businessId_type_value: { businessId, type: "EMAIL", value: email },
      },
      update: {},
      create: { businessId, type: "EMAIL", value: email, source: "WEBSITE" },
    });
  }

  return { businessId, websiteClass: result.websiteClass, emails: signals?.pageSignals.emails ?? [] };
}

interface SiteAudit {
  finalUrl: string;
  httpStatus: number | null;
  httpsOk: boolean;
  parked: boolean;
  sitemapLastMod: Date | null;
  waybackLastChange: Date | null;
  pageSignals: PageSignals;
}

async function auditSite(websiteUri: string): Promise<SiteAudit> {
  const httpsUrl = new URL(websiteUri.replace(/^http:\/\//i, "https://"));

  // Social/directory hosts are classified without fetching.
  if (isSocialOrDirectoryHost(httpsUrl.hostname)) {
    return {
      finalUrl: websiteUri,
      httpStatus: 200,
      httpsOk: true,
      parked: false,
      sitemapLastMod: null,
      waybackLastChange: null,
      pageSignals: {
        copyrightYear: null,
        hasViewport: true,
        hasContactPath: true,
        platform: null,
        emails: [],
      },
    };
  }

  // Fetch the homepage over HTTPS; fall back to HTTP.
  let homepage: Awaited<ReturnType<typeof fetchPage>>;
  let httpsOk = true;
  try {
    homepage = await fetchPage(httpsUrl);
  } catch {
    httpsOk = false;
    const httpUrl = new URL(websiteUri.replace(/^https:\/\//i, "http://"));
    try {
      homepage = await fetchPage(httpUrl);
    } catch (err) {
      if (err instanceof SiteUnreachableError || err instanceof Error) {
        return unreachable(websiteUri, err);
      }
      throw err;
    }
  }

  if (homepage.status >= 400) {
    return {
      finalUrl: homepage.finalUrl,
      httpStatus: homepage.status,
      httpsOk,
      parked: false,
      sitemapLastMod: null,
      waybackLastChange: null,
      pageSignals: emptySignals(),
    };
  }

  // Parked-domain pages need no further signals.
  if (matchesParkedPage(homepage.html)) {
    return {
      finalUrl: homepage.finalUrl,
      httpStatus: homepage.status,
      httpsOk,
      parked: true,
      sitemapLastMod: null,
      waybackLastChange: null,
      pageSignals: emptySignals(),
    };
  }

  // Contact/about pages (robots permitting) for emails and contact paths.
  const origin = new URL(homepage.finalUrl);
  const robots = await fetchRobots(origin);
  const pages: PageSignals[] = [extractPageSignals(homepage.html)];
  for (const p of CONTACT_PATHS) {
    if (!robots.allowed(p)) continue;
    try {
      const page = await fetchPage(new URL(p, origin));
      if (page.status < 400 && page.html) {
        pages.push(extractPageSignals(page.html));
      }
    } catch {
      // missing contact page is not an error
    }
  }

  const sitemapLastMod = await fetchSitemapLastMod(origin).catch(() => null);
  const waybackLastChange = await fetchWaybackLastChange(httpsUrl.toString()).catch(() => null);

  return {
    finalUrl: homepage.finalUrl,
    httpStatus: homepage.status,
    httpsOk,
    parked: false,
    sitemapLastMod,
    waybackLastChange,
    pageSignals: mergePageSignals(pages),
  };
}

function emptySignals(): PageSignals {
  return { copyrightYear: null, hasViewport: false, hasContactPath: false, platform: null, emails: [] };
}

function unreachable(websiteUri: string, err: Error): SiteAudit {
  log.debug("site unreachable", { websiteUri, reason: err.message });
  return {
    finalUrl: websiteUri,
    httpStatus: null,
    httpsOk: false,
    parked: false,
    sitemapLastMod: null,
    waybackLastChange: null,
    pageSignals: emptySignals(),
  };
}

/** Businesses whose audit is missing or older than 90 days. */
export async function findDueAuditBusinessIds(limit = 500): Promise<string[]> {
  const cutoff = new Date(Date.now() - RE_AUDIT_DAYS * 24 * 60 * 60_000);
  const due = await prisma.business.findMany({
    where: {
      OR: [{ audit: null }, { audit: { checkedAt: { lt: cutoff } } }],
    },
    select: { id: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  return due.map((b) => b.id);
}

/** Run due audits in batches of Settings.auditConcurrency. Returns audits completed. */
export async function runAuditSweep(): Promise<number> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { auditConcurrency: true },
  });
  const concurrency = Math.max(1, settings?.auditConcurrency ?? 8);
  const ids = await findDueAuditBusinessIds();
  let done = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (id) => ({ id, outcome: await auditBusiness(id) })),
    );
    for (const r of results) {
      if (r.status === "fulfilled") done += 1;
      else {
        failed += 1;
        log.warn("audit failed", { err: r.reason });
      }
    }
  }
  log.info("audit sweep finished", { due: ids.length, done, failed });
  return done;
}
