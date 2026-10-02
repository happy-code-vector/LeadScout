import { prisma } from "../db";

export function normalizeWebsiteHost(raw: string): string | null {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Link an inbound submission to a known Business by website host. */
export async function matchBusinessByWebsiteUrl(raw: string): Promise<string | null> {
  const host = normalizeWebsiteHost(raw);
  if (!host) return null;
  const rows = await prisma.business.findMany({
    where: { websiteUri: { not: null } },
    select: { id: true, websiteUri: true },
  });
  return rows.find((r) => normalizeWebsiteHost(r.websiteUri!) === host)?.id ?? null;
}
