import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { AddressComponent, Place } from "./places";

/**
 * DB glue for discovery: upsert Businesses from Places results, maintain
 * phone contacts, and refresh chain flags.
 */

const FRESH_WINDOW_DAYS = 30;

export interface AreaFallback {
  name: string;
  city: string;
  state: string;
}

export function parseAddressComponents(
  components: AddressComponent[] | undefined,
  fallback: AreaFallback,
): { borough: string; city: string; state: string; zip: string | null } {
  const byType = (type: string): AddressComponent | undefined =>
    components?.find((c) => c.types.includes(type));

  const sublocality = byType("sublocality_level_1") ?? byType("sublocality");
  const locality = byType("locality");
  const adminArea = byType("administrative_area_level_1");
  const postal = byType("postal_code");
  const neighborhood = byType("neighborhood");

  return {
    borough: sublocality?.longText ?? neighborhood?.longText ?? fallback.name,
    city: locality?.longText ?? fallback.city,
    state: adminArea?.shortText ?? fallback.state,
    zip: postal?.longText ?? null,
  };
}

export type UpsertOutcome = "created" | "updated" | "skipped";

/** Upsert one enterprise place; skips non-operational businesses. */
export async function upsertPlace(
  prisma: PrismaClient,
  place: Place,
  categoryId: string,
  area: AreaFallback,
): Promise<UpsertOutcome> {
  if (place.businessStatus && place.businessStatus !== "OPERATIONAL") return "skipped";
  if (!place.displayName) return "skipped";

  const { borough, city, state, zip } = parseAddressComponents(
    place.addressComponents,
    area,
  );

  const existing = await prisma.business.findUnique({
    where: { placeId: place.id },
    select: { id: true },
  });

  const business = await prisma.business.upsert({
    where: { placeId: place.id },
    update: {
      name: place.displayName,
      categoryId,
      address: place.formattedAddress ?? null,
      borough,
      city,
      state,
      zip,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      phone: place.nationalPhoneNumber ?? null,
      websiteUri: place.websiteUri ?? null,
      googleMapsUri: place.googleMapsUri ?? null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      businessStatus: place.businessStatus ?? null,
      primaryType: place.primaryType ?? null,
      placesFetchedAt: new Date(),
    },
    create: {
      placeId: place.id,
      name: place.displayName,
      categoryId,
      address: place.formattedAddress ?? null,
      borough,
      city,
      state,
      zip,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      phone: place.nationalPhoneNumber ?? null,
      websiteUri: place.websiteUri ?? null,
      googleMapsUri: place.googleMapsUri ?? null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      businessStatus: place.businessStatus ?? null,
      primaryType: place.primaryType ?? null,
      placesFetchedAt: new Date(),
    },
  });

  if (place.nationalPhoneNumber) {
    await prisma.contact.upsert({
      where: {
        businessId_type_value: {
          businessId: business.id,
          type: "PHONE",
          value: place.nationalPhoneNumber,
        },
      },
      update: {},
      create: {
        businessId: business.id,
        type: "PHONE",
        value: place.nationalPhoneNumber,
        source: "PLACES",
      },
    });
  }

  return existing ? "updated" : "created";
}

/** True when every place ID is stored with placesFetchedAt within 30 days. */
export async function isTileFresh(
  prisma: PrismaClient,
  placeIds: string[],
): Promise<boolean> {
  if (placeIds.length === 0) return false;
  const cutoff = new Date(Date.now() - FRESH_WINDOW_DAYS * 24 * 60 * 60_000);
  const fresh = await prisma.business.count({
    where: {
      placeId: { in: placeIds },
      placesFetchedAt: { gte: cutoff },
    },
  });
  return fresh === placeIds.length;
}

// ---------------------------------------------------------------------------
// Chain detection
// ---------------------------------------------------------------------------

/** Normalize a business name: lowercase, strip punctuation, collapse spaces. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Load data/chains.txt (comments with #, one normalized name per line). */
export async function loadChainList(
  file = path.join(process.cwd(), "data", "chains.txt"),
): Promise<Set<string>> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return new Set();
  }
  return new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map(normalizeName),
  );
}

/**
 * Set isChain on businesses whose normalized name appears at 3+ places or
 * matches data/chains.txt. Monotonic: never un-flags.
 * Returns how many businesses were newly flagged.
 */
export async function refreshChainFlags(prisma: PrismaClient): Promise<number> {
  const chainList = await loadChainList();
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, isChain: true },
  });

  const counts = new Map<string, number>();
  for (const b of businesses) {
    const key = normalizeName(b.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const toFlag: string[] = [];
  for (const b of businesses) {
    if (b.isChain) continue;
    const key = normalizeName(b.name);
    if ((counts.get(key) ?? 0) >= 3 || chainList.has(key)) {
      toFlag.push(b.id);
    }
  }

  for (let i = 0; i < toFlag.length; i += 500) {
    const chunk = toFlag.slice(i, i + 500);
    await prisma.business.updateMany({
      where: { id: { in: chunk } },
      data: { isChain: true },
    });
  }
  return toFlag.length;
}
