/**
 * True when two web addresses name the same site: exact match, or equal
 * hostnames ignoring scheme and path (a bare "example.com" is read as
 * https://example.com). An inquiry may cite an audit report only for the
 * site that report actually checked.
 */
export function sameSiteHost(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const hostX = hostOf(x);
  return hostX !== null && hostX === hostOf(y);
}

function hostOf(raw: string): string | null {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).hostname;
  } catch {
    return null;
  }
}
