/**
 * Quadtree tiling for Places Text Search coverage — pure geometry, fully
 * unit-tested. Text Search caps at 60 results per query (3 pages × 20), so a
 * saturated tile must be split into 4 subtiles and re-queried, down to a
 * minimum tile size of about 300 m.
 */

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Text Search never returns more than 60 places per query. */
export const SATURATION_LIMIT = 60;

/** Stop subdividing below ~300 m — beyond this, accept truncation. */
export const MIN_TILE_M = 300;

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG_AT_EQUATOR = 111_320;

export function subdivide(b: Bbox): Bbox[] {
  const midLat = (b.south + b.north) / 2;
  const midLng = (b.west + b.east) / 2;
  return [
    { south: b.south, west: b.west, north: midLat, east: midLng }, // SW
    { south: b.south, west: midLng, north: midLat, east: b.east }, // SE
    { south: midLat, west: b.west, north: b.north, east: midLng }, // NW
    { south: midLat, west: midLng, north: b.north, east: b.east }, // NE
  ];
}

export function bboxSizeMeters(b: Bbox): { widthM: number; heightM: number } {
  const lat = (b.south + b.north) / 2;
  const widthM = Math.abs(b.east - b.west) * M_PER_DEG_LNG_AT_EQUATOR * Math.cos((lat * Math.PI) / 180);
  const heightM = Math.abs(b.north - b.south) * M_PER_DEG_LAT;
  return { widthM, heightM };
}

/** A tile is too small to subdivide when both dimensions are under the minimum. */
export function isBelowMinTile(b: Bbox): boolean {
  const { widthM, heightM } = bboxSizeMeters(b);
  return Math.max(widthM, heightM) < MIN_TILE_M;
}

/** A probe that returns the full 60 is saturated and needs subdivision. */
export function isSaturated(matchedCount: number): boolean {
  return matchedCount >= SATURATION_LIMIT;
}

/** Whether to split: saturated AND still large enough to split. */
export function shouldSplit(b: Bbox, matchedCount: number): boolean {
  return isSaturated(matchedCount) && !isBelowMinTile(b);
}

export function containsPoint(b: Bbox, lat: number, lng: number): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

export function bboxAreaKm2(b: Bbox): number {
  const { widthM, heightM } = bboxSizeMeters(b);
  return (widthM * heightM) / 1_000_000;
}

/**
 * Rough billed-request estimate shown before a run (leaf tiles × ~2 pages).
 * The probe pass is free, so this is a UI hint only — the cap is the real guard.
 */
export function estimateBilledRequests(b: Bbox): number {
  // Assume an average leaf tile around 4 km × 4 km (≈ 16 km²) plus pagination.
  return Math.max(2, Math.ceil(bboxAreaKm2(b) / 16) * 2);
}
