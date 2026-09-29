/**
 * Network layer for the website audit. Plain fetch with a 10 s timeout and
 * redirect following — real sites only, no fixture serving at runtime
 * (fixtures/sites is used exclusively by unit tests).
 */

export const REQUEST_TIMEOUT_MS = 10_000;

export interface FetchedPage {
  finalUrl: string;
  status: number;
  html: string;
}

export class SiteUnreachableError extends Error {
  constructor(reason: string) {
    super(`site unreachable: ${reason}`);
    this.name = "SiteUnreachableError";
  }
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; LeadScoutAudit/1.0)",
  Accept: "text/html,application/xhtml+xml",
};

export async function fetchPage(url: URL): Promise<FetchedPage> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const html = await res.text().catch(() => "");
  return { finalUrl: res.url || url.toString(), status: res.status, html };
}

/** Returns null when the sitemap is missing or unparsable. */
export async function fetchSitemapLastMod(origin: URL): Promise<Date | null> {
  const url = new URL("sitemap.xml", origin);
  let xml: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    xml = await res.text();
  } catch {
    return null;
  }
  const dates = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)]
    .map((m) => new Date(m[1]))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

/**
 * Wayback CDX: the latest capture where content changed (collapse=digest).
 * Returns null on any failure — it's a bonus signal, never critical.
 */
export async function fetchWaybackLastChange(targetUrl: string): Promise<Date | null> {
  const cdx = `https://web.archive.org/cdx?url=${encodeURIComponent(targetUrl)}&collapse=digest&output=json&filter=statuscode:200&limit=50`;
  try {
    const res = await fetch(cdx, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    const rows = (await res.json()) as string[][];
    // rows[0] is the header; timestamps are YYYYMMDDhhmmss in column 1.
    const stamps = rows
      .slice(1)
      .map((r) => r[1])
      .filter(Boolean)
      .map((s) => {
        const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
        return new Date(iso);
      })
      .filter((d) => !Number.isNaN(d.getTime()));
    if (stamps.length === 0) return null;
    return stamps.reduce((a, b) => (a > b ? a : b));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minimal robots.txt support (for pages beyond the homepage).
// ---------------------------------------------------------------------------

export interface Robots {
  allowed(path: string): boolean;
}

class AllowAll implements Robots {
  allowed(): boolean {
    return true;
  }
}

export async function fetchRobots(origin: URL): Promise<Robots> {
  let text: string | null;
  try {
    const res = await fetch(new URL("robots.txt", origin), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    text = res.ok ? await res.text() : null;
  } catch {
    text = null;
  }
  if (!text) return new AllowAll();

  // Parse "User-agent: *" groups and collect their Disallow prefixes.
  const disallow: string[] = [];
  let inStarGroup = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [keyRaw, ...rest] = line.split(":");
    const key = keyRaw.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inStarGroup = value === "*";
    } else if (key === "disallow" && inStarGroup && value) {
      disallow.push(value);
    }
  }
  if (disallow.length === 0) return new AllowAll();
  return {
    allowed: (p: string) => !disallow.some((prefix) => p.startsWith(prefix)),
  };
}
