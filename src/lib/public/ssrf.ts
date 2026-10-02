import { lookup } from "node:dns/promises";

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolve: Resolver = async (host) => {
  const result = await lookup(host, { all: true });
  return result.map((r) => r.address);
};

export class PublicUrlError extends Error {
  constructor(public readonly reason: string) {
    super(`URL rejected: ${reason}`);
    this.name = "PublicUrlError";
  }
}

function isIpv4(s: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(s);
}

export function ipIsPrivate(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(":")) {
    if (v === "::1" || v === "::") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipIsPrivate(mapped[1]);
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(v)) return true; // fe80::/10 link-local
    return false;
  }
  const parts = v.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // unparsable = blocked
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export async function assertPublicHttpUrl(raw: string, resolve: Resolver = defaultResolve): Promise<URL> {
  let candidate = raw.trim();
  // Only default the scheme when the input has no scheme at all; a non-http(s)
  // scheme (e.g. ftp://) must survive unprefixed so the protocol check rejects it.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) candidate = `https://${candidate}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new PublicUrlError("that does not look like a website address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicUrlError("only http(s) addresses can be checked");
  }
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    throw new PublicUrlError("only ports 80 and 443 can be checked");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new PublicUrlError("local addresses cannot be checked");
  }
  if ((isIpv4(host) || host.includes(":")) && ipIsPrivate(host)) {
    throw new PublicUrlError("private addresses cannot be checked");
  }
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new PublicUrlError("that domain does not resolve");
  }
  if (addresses.length === 0) throw new PublicUrlError("that domain does not resolve");
  if (addresses.some((a) => ipIsPrivate(a))) {
    throw new PublicUrlError("that domain resolves to a private address");
  }
  return url;
}
