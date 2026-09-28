import type { DiscoveryProvider, Place, SearchTextRequest } from "./places";
import { maxPages } from "./places";
import { shouldSplit, subdivide, type Bbox } from "./tiler";

/** Structural budget-guard contract so tests can pass fakes. */
export interface BudgetGuardLike {
  assertAllowed(): Promise<void>;
  record(): Promise<number>;
}

/**
 * Two-pass quadtree discovery (spec: Pipeline / Discovery).
 *
 * Probe pass (free): IDs-only field mask over each tile. A tile that returns
 * the full 60 is saturated and splits into 4 subtiles, down to ~300 m.
 *
 * Fetch pass (billed): Enterprise field mask only on leaf tiles, and a leaf
 * is skipped entirely when every probed ID is already fresh in the database.
 *
 * All persistence goes through the injected hooks so the engine is unit
 * tested without a database.
 */

export interface DiscoveryHooks {
  /** True when every place ID is already stored with placesFetchedAt < 30 days old. */
  isTileFresh(placeIds: string[]): Promise<boolean>;
  /** Persist a page of enterprise places. Returns found/new counts. */
  persistPlaces(places: Place[]): Promise<{ found: number; created: number }>;
  /** Progress callback for live UI updates. */
  onProgress(progress: DiscoveryProgress): Promise<void>;
}

export interface DiscoveryProgress {
  requestsUsed: number;
  placesFound: number;
  newPlaces: number;
  tiles: number;
}

export interface DiscoveryInput {
  textQuery: string;
  includedType?: string | null;
  rectangle: Bbox;
}

export interface DiscoveryStats {
  requestsUsed: number;
  placesFound: number;
  newPlaces: number;
  tiles: number;
  billedRequests: number;
}

export async function discoverCategoryArea(
  provider: DiscoveryProvider,
  guard: BudgetGuardLike,
  input: DiscoveryInput,
  hooks: DiscoveryHooks,
): Promise<DiscoveryStats> {
  const stats: DiscoveryStats = {
    requestsUsed: 0,
    placesFound: 0,
    newPlaces: 0,
    tiles: 0,
    billedRequests: 0,
  };

  async function searchOnce(rectangle: Bbox, fields: SearchTextRequest["fields"], pageToken?: string) {
    return provider.searchText({
      textQuery: input.textQuery,
      includedType: input.includedType ?? undefined,
      rectangle,
      fields,
      pageToken,
    });
  }

  /** Probe a tile with the free IDs-only mask; returns all IDs (max 60). */
  async function probe(rectangle: Bbox): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages(); page++) {
      const res = await searchOnce(rectangle, "ids", pageToken);
      ids.push(...res.places.map((p) => p.id));
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return ids;
  }

  /** Fetch pass on a leaf tile with the billed Enterprise mask. */
  async function fetchLeaf(rectangle: Bbox): Promise<void> {
    stats.tiles += 1;
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages(); page++) {
      await guard.assertAllowed();
      const res = await searchOnce(rectangle, "enterprise", pageToken);
      await guard.record();
      stats.requestsUsed += 1;
      stats.billedRequests += 1;
      const { found, created } = await hooks.persistPlaces(res.places);
      stats.placesFound += found;
      stats.newPlaces += created;
      await hooks.onProgress({ ...stats });
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
  }

  async function walk(rectangle: Bbox): Promise<void> {
    const ids = await probe(rectangle);

    if (ids.length === 0) return;

    if (shouldSplit(rectangle, ids.length)) {
      for (const sub of subdivide(rectangle)) {
        await walk(sub);
      }
      return;
    }

    // Leaf: skip the billed fetch when everything is already fresh.
    if (await hooks.isTileFresh(ids)) return;

    await fetchLeaf(rectangle);
    // Note: saturation at the minimum tile size means truncation is possible —
    // the API cannot return more than 60 per query at that resolution.
  }

  await walk(input.rectangle);
  return stats;
}
