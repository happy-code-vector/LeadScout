import { assertPublicHttpUrl, PublicUrlError, type Resolver } from "./ssrf";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; AppHubSiteCheck/1.0)",
  Accept: "text/html,application/xhtml+xml",
};

export interface GuardedFetchOptions {
  timeoutMs?: number;
  maxHops?: number;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
}

export async function fetchGuarded(
  url: URL,
  opts: GuardedFetchOptions = {},
): Promise<{ finalUrl: string; status: number; html: string }> {
  const { timeoutMs = 10_000, maxHops = 3 } = opts;
  const doFetch = opts.fetchImpl ?? ((u: URL, init: RequestInit) => fetch(u, init));
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    await assertPublicHttpUrl(current.toString(), opts.resolve);
    const res = await doFetch(current, {
      redirect: "manual",
      headers: HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { finalUrl: current.toString(), status: res.status, html: "" };
      current = new URL(location, current);
      continue;
    }
    const html = await res.text().catch(() => "");
    return { finalUrl: current.toString(), status: res.status, html };
  }
  throw new PublicUrlError("too many redirects");
}
