import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Bbox } from "./tiler";
import { containsPoint } from "./tiler";

/**
 * Google Places API (New) Text Search behind a DiscoveryProvider interface
 * (spec: Hard rules #1) so another provider can be added later.
 *
 * Two field masks (the mask sets the price tier):
 * - "ids":       places.id,nextPageToken — Text Search Essentials (IDs Only), free
 * - "enterprise": the full field list — Text Search Enterprise, billed
 */

export const FIELD_MASK_IDS = "places.id,nextPageToken";

export const FIELD_MASK_ENTERPRISE = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

export type FieldSet = "ids" | "enterprise";

export interface AddressComponent {
  types: string[];
  longText: string;
  shortText: string;
}

export interface Place {
  id: string;
  displayName?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
}

export interface SearchTextRequest {
  textQuery: string;
  includedType?: string;
  rectangle: Bbox;
  pageToken?: string;
  fields: FieldSet;
}

export interface SearchTextPage {
  places: Place[];
  nextPageToken?: string;
}

export interface DiscoveryProvider {
  searchText(req: SearchTextRequest): Promise<SearchTextPage>;
  /** Place Details for refreshes (spec hard rule 5). */
  placeDetails(placeId: string): Promise<Place | null>;
}

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PAGE_SIZE = 20;
const MAX_PAGES = 3;
const REQUEST_TIMEOUT_MS = 10_000;

/** The API caps Text Search at 3 pages per query. */
export function maxPages(): number {
  return MAX_PAGES;
}

/** Place Details refresh (Enterprise field set, billed as Place Details). */
export const SKU_PLACE_DETAILS = "place-details-enterprise";

// ---------------------------------------------------------------------------
// Real client
// ---------------------------------------------------------------------------

export class PlacesClient implements DiscoveryProvider {
  constructor(private readonly apiKey: string) {}

  async searchText(req: SearchTextRequest): Promise<SearchTextPage> {
    const body: Record<string, unknown> = {
      textQuery: req.textQuery,
      pageSize: PAGE_SIZE,
      locationRestriction: {
        rectangle: {
          low: { latitude: req.rectangle.south, longitude: req.rectangle.west },
          high: { latitude: req.rectangle.north, longitude: req.rectangle.east },
        },
      },
    };
    if (req.includedType) body.includedType = req.includedType;
    if (req.pageToken) body.pageToken = req.pageToken;

    const res = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": req.fields === "ids" ? FIELD_MASK_IDS : FIELD_MASK_ENTERPRISE,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Places searchText failed (${res.status}): ${text.slice(0, 500)}`);
    }
    return (await res.json()) as SearchTextPage;
  }

  async placeDetails(placeId: string): Promise<Place | null> {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": FIELD_MASK_ENTERPRISE,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Place Details failed (${res.status}): ${text.slice(0, 500)}`);
    }
    return (await res.json()) as Place;
  }
}

// ---------------------------------------------------------------------------
// Mock client — serves fixtures/places/*.json when no API key is set.
// The whole app must work end to end with no paid keys (spec: Hard rules #2).
// ---------------------------------------------------------------------------

interface FixturePlace extends Place {
  /** Which category textQuery this fixture place answers to. */
  textQuery: string;
}

interface FixtureFile {
  places: FixturePlace[];
}

export class MockPlacesClient implements DiscoveryProvider {
  private cache: FixturePlace[] | null = null;

  constructor(private readonly fixturesDir = path.join(process.cwd(), "fixtures", "places")) {}

  private async all(): Promise<FixturePlace[]> {
    if (this.cache) return this.cache;
    let files: string[] = [];
    try {
      files = (await readdir(this.fixturesDir)).filter((f) => f.endsWith(".json"));
    } catch {
      this.cache = [];
      return this.cache;
    }
    const places: FixturePlace[] = [];
    for (const file of files) {
      const raw = JSON.parse(await readFile(path.join(this.fixturesDir, file), "utf8")) as FixtureFile;
      places.push(...(raw.places ?? []));
    }
    this.cache = places;
    return this.cache;
  }

  async searchText(req: SearchTextRequest): Promise<SearchTextPage> {
    const all = await this.all();
    const q = req.textQuery.toLowerCase();
    // Match on category text query, optional type, and bbox containment.
    // Closed businesses are returned too — the caller skips non-OPERATIONAL.
    const matched = all.filter((p) => {
      if ((p.textQuery ?? "").toLowerCase() !== q) return false;
      if (req.includedType && p.primaryType !== req.includedType && !(p.types ?? []).includes(req.includedType)) {
        return false;
      }
      if (!p.location || !containsPoint(req.rectangle, p.location.latitude, p.location.longitude)) {
        return false;
      }
      return true;
    });

    // Mirror the API: pages of 20, capped at 60 per query.
    const capped = matched.slice(0, MAX_PAGES * PAGE_SIZE);
    const cursor = req.pageToken ? Number(req.pageToken) : 0;
    const page = capped.slice(cursor, cursor + PAGE_SIZE);
    const next = cursor + PAGE_SIZE;
    return {
      places: page.map((p) => (req.fields === "ids" ? { id: p.id } : toPlaceShape(p))),
      nextPageToken: next < capped.length ? String(next) : undefined,
    };
  }

  async placeDetails(placeId: string): Promise<Place | null> {
    const all = await this.all();
    const hit = all.find((p) => p.id === placeId);
    return hit ? toPlaceShape(hit) : null;
  }
}

function toPlaceShape(p: FixturePlace): Place {
  // Strip the fixture-only textQuery tag before handing the place back.
  const rest = { ...p } as Partial<FixturePlace>;
  delete rest.textQuery;
  return rest as Place;
}

/** Pick the provider from the environment: real when a key is set, else mock. */
export function createProvider(apiKey: string): DiscoveryProvider {
  return apiKey ? new PlacesClient(apiKey) : new MockPlacesClient();
}
