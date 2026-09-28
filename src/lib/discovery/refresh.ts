import { prisma } from "../db";
import { log } from "../logger";
import { env } from "../env";
import { BudgetGuard, CapReachedError, SKU_TEXT_SEARCH_ENTERPRISE, currentMonth } from "./budget";
import { PrismaUsageCounter, settingsCapProvider } from "./usage";
import { createProvider } from "./places";
import { upsertPlace, type AreaFallback } from "./upsert";

/**
 * Places 30-day refresh and retention (spec hard rule 5):
 *
 * - Businesses whose lead is between QUEUED and PROPOSAL get their
 *   Places-sourced fields refreshed through Place Details (billed) when
 *   older than 30 days.
 * - Every other business's Places-sourced fields are cleared after 30 days;
 *   only placeId, the audit, and the score remain. The next discovery run
 *   refills them.
 */

const STALE_DAYS = 30;

/** Lead statuses between QUEUED and PROPOSAL (the active pipeline). */
export const PIPELINE_STATUSES = ["QUEUED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL"];

/** The Places-sourced fields cleared by retention (placeId/audit/score stay). */
export const CLEARED_PLACES_FIELDS = [
  "name",
  "address",
  "borough",
  "city",
  "state",
  "zip",
  "lat",
  "lng",
  "phone",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "reviewCount",
  "businessStatus",
  "primaryType",
] as const;

export async function runPlacesRefreshSweep(): Promise<{ refreshed: number; cleared: number }> {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60_000);

  // 1. Refresh active-pipeline businesses with stale data (billed).
  const stalePipeline = await prisma.business.findMany({
    where: {
      placesFetchedAt: { lt: cutoff },
      lead: { status: { in: PIPELINE_STATUSES } },
    },
    select: { id: true, placeId: true, categoryId: true },
  });

  let refreshed = 0;
  if (stalePipeline.length > 0) {
    const provider = createProvider(env.GOOGLE_PLACES_API_KEY);
    const guard = new BudgetGuard(new PrismaUsageCounter(), settingsCapProvider);
    try {
      for (const b of stalePipeline) {
        await guard.assertAllowed(SKU_TEXT_SEARCH_ENTERPRISE); // one Places cap for all SKUs
        const place = await provider.placeDetails(b.placeId);
        await guard.record(SKU_TEXT_SEARCH_ENTERPRISE);
        if (place) {
          // Refresh keeps the pipeline lead usable. upsertPlace re-parses the
          // address components; the fallback below only fills gaps.
          const byType = (type: string) =>
            place.addressComponents?.find((c) => c.types.includes(type));
          const area: AreaFallback = {
            name: byType("sublocality_level_1")?.longText ?? "",
            city: byType("locality")?.longText ?? "",
            state: byType("administrative_area_level_1")?.shortText ?? "",
          };
          await upsertPlace(prisma, place, b.categoryId, area);
          refreshed += 1;
        }
      }
    } catch (err) {
      if (err instanceof CapReachedError) {
        log.warn("places refresh stopped at cap", { refreshed });
      } else {
        throw err;
      }
    }
  }

  // 2. Clear Places fields for everyone else older than 30 days. Capture the
  //    ids first — Places-sourced phone contacts are cleared too.
  const staleOthers = await prisma.business.findMany({
    where: {
      placesFetchedAt: { lt: cutoff },
      OR: [{ lead: null }, { lead: { status: { notIn: PIPELINE_STATUSES } } }],
    },
    select: { id: true },
  });
  if (staleOthers.length > 0) {
    const ids = staleOthers.map((b) => b.id);
    await prisma.business.updateMany({
      where: { id: { in: ids } },
      data: {
        name: "",
        address: null,
        borough: null,
        city: null,
        state: null,
        zip: null,
        lat: null,
        lng: null,
        phone: null,
        websiteUri: null,
        googleMapsUri: null,
        rating: null,
        reviewCount: null,
        businessStatus: null,
        primaryType: null,
        placesFetchedAt: null,
      },
    });
    await prisma.contact.deleteMany({
      where: { businessId: { in: ids }, source: "PLACES" },
    });
  }
  const cleared = staleOthers.length;

  log.info("places refresh sweep done", {
    refreshed,
    cleared,
    month: currentMonth(),
  });
  return { refreshed, cleared };
}
