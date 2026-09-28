import { describe, expect, it } from "vitest";
import {
  SATURATION_LIMIT,
  bboxAreaKm2,
  bboxSizeMeters,
  containsPoint,
  estimateBilledRequests,
  isBelowMinTile,
  isSaturated,
  shouldSplit,
  subdivide,
  type Bbox,
} from "./tiler";

const BROOKLYN: Bbox = {
  south: 40.5505,
  west: -74.0419,
  north: 40.7394,
  east: -73.833,
};

describe("subdivide", () => {
  it("produces exactly 4 subtiles", () => {
    expect(subdivide(BROOKLYN)).toHaveLength(4);
  });

  it("halves each dimension", () => {
    const midLat = (BROOKLYN.south + BROOKLYN.north) / 2;
    const midLng = (BROOKLYN.west + BROOKLYN.east) / 2;
    for (const q of subdivide(BROOKLYN)) {
      const latHalved =
        Math.abs(q.north - q.south - (BROOKLYN.north - BROOKLYN.south) / 2) < 1e-12;
      const lngHalved =
        Math.abs(q.east - q.west - (BROOKLYN.east - BROOKLYN.west) / 2) < 1e-12;
      expect(latHalved && lngHalved).toBe(true);
      expect(q.south).toBeGreaterThanOrEqual(BROOKLYN.south);
      expect(q.north).toBeLessThanOrEqual(BROOKLYN.north);
      expect(q.west).toBeGreaterThanOrEqual(BROOKLYN.west);
      expect(q.east).toBeLessThanOrEqual(BROOKLYN.east);
      expect(midLat).toBeTypeOf("number");
      expect(midLng).toBeTypeOf("number");
    }
  });

  it("covers the parent exactly with no overlap", () => {
    const kids = subdivide(BROOKLYN);
    const parentArea = bboxAreaKm2(BROOKLYN);
    const kidArea = kids.reduce((sum, k) => sum + bboxAreaKm2(k), 0);
    // Area is computed at each box's mid-latitude, so the sum only matches
    // the parent to within that approximation — compare relatively.
    expect(Math.abs(kidArea - parentArea) / parentArea).toBeLessThan(1e-6);
    // A point strictly inside one quadrant is contained in exactly one
    // subtile. (Boundary points may match several — boundaries are inclusive,
    // and discovery dedupes by placeId anyway.)
    const inSW = {
      lat: BROOKLYN.south + (BROOKLYN.north - BROOKLYN.south) * 0.25,
      lng: BROOKLYN.west + (BROOKLYN.east - BROOKLYN.west) * 0.25,
    };
    expect(kids.filter((k) => containsPoint(k, inSW.lat, inSW.lng))).toHaveLength(1);
  });

  it("repeated subdivision reaches the minimum tile size and stops splitting", () => {
    let tile = BROOKLYN;
    let depth = 0;
    while (!isBelowMinTile(tile) && depth < 30) {
      tile = subdivide(tile)[0]; // SW quadrant each time (fastest shrink)
      depth += 1;
    }
    expect(depth).toBeGreaterThan(3); // genuinely several levels for a borough
    expect(isBelowMinTile(tile)).toBe(true);
    const { widthM, heightM } = bboxSizeMeters(tile);
    expect(Math.max(widthM, heightM)).toBeLessThan(300 + 1);
  });
});

describe("saturation rules", () => {
  it("treats exactly 60 as saturated (Text Search cap)", () => {
    expect(isSaturated(59)).toBe(false);
    expect(isSaturated(SATURATION_LIMIT)).toBe(true);
    expect(isSaturated(61)).toBe(true);
  });

  it("splits only when saturated and above the minimum size", () => {
    const big = BROOKLYN;
    let tiny = BROOKLYN;
    // ~7 halvings takes a Brooklyn-sized box below the ~300 m minimum.
    for (let i = 0; i < 7; i++) tiny = subdivide(tiny)[0];
    expect(isBelowMinTile(tiny)).toBe(true);
    expect(shouldSplit(big, 60)).toBe(true);
    expect(shouldSplit(big, 59)).toBe(false);
    expect(shouldSplit(tiny, 60)).toBe(false);
  });
});

describe("estimateBilledRequests", () => {
  it("is positive and scales with area", () => {
    expect(estimateBilledRequests(BROOKLYN)).toBeGreaterThan(0);
    const small = subdivide(BROOKLYN)[0];
    expect(estimateBilledRequests(small)).toBeLessThan(estimateBilledRequests(BROOKLYN));
  });
});
