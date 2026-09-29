import type { Bbox } from "./tiler";

/**
 * Google Places API (New) Text Search behind a DiscoveryProvider interface
 * (spec: Hard rules #1) so another provider can be added later.
 *
 * Two field masks (the mask sets the price tier):
 * - "ids":       places.id,nextPageToken — Text Search Essentials (IDs Only), free
 * - "enterprise": the full field list — Text Search Enterprise, billed
 *
 * Requires GOOGLE_PLACES_API_KEY. No key = discovery disabled and flagged —
 * fixture data is never served at runtime (spec: Hard rules #2).
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

/** LocalizedText as returned by the Places API (New). */
export interface LocalizedText {
  text: string;
  languageCode?: string;
}

export interface Place {
  id: string;
  /** LocalizedText object, not a plain string. */
  displayName?: LocalizedText;
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
// Client
// ---------------------------------------------------------------------------

export class PlacesNotConfiguredError extends Error {
  constructor() {
    super("Google Places API key is not configured — set GOOGLE_PLACES_API_KEY to run discovery");
    this.name = "PlacesNotConfiguredError";
  }
}

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

/** Create the live provider. Throws PlacesNotConfiguredError without a key — never fakes data. */
export function createProvider(apiKey: string): DiscoveryProvider {
  if (!apiKey) throw new PlacesNotConfiguredError();
  return new PlacesClient(apiKey);
}
