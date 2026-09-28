import { describe, expect, it } from "vitest";
import type { DiscoveryProvider, SearchTextPage, SearchTextRequest } from "./places";
import { discoverCategoryArea } from "./engine";
import type { BudgetGuardLike } from "./engine";
import { CapReachedError } from "./budget";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Provider with `total` places spread across a small cluster of points. */
class FakeProvider implements DiscoveryProvider {
  callLog: { fields: SearchTextRequest["fields"]; rectangle: SearchTextRequest["rectangle"] }[] = [];
  private readonly points: { lat: number; lng: number }[];

  constructor(total: number) {
    // A ~200 m cluster around (40.67, -73.98): dense enough to force deep
    // subdivision before tiles drop below the ~300 m minimum.
    this.points = Array.from({ length: total }, (_, i) => ({
      lat: 40.67 + (i % 10) * 0.0002,
      lng: -73.98 + Math.floor(i / 10) * 0.0002,
    }));
  }

  async searchText(req: SearchTextRequest): Promise<SearchTextPage> {
    this.callLog.push({ fields: req.fields, rectangle: req.rectangle });
    const { south, west, north, east } = req.rectangle;
    const inside = this.points.filter(
      (p) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east,
    );
    // Mirror the API: pages of 20, hard cap of 60 per query.
    const capped = inside.slice(0, 60);
    const cursor = req.pageToken ? Number(req.pageToken) : 0;
    const page = capped.slice(cursor, cursor + 20);
    const next = cursor + 20;
    return {
      places: page.map((p, i) => ({ id: `p_${cursor + i}`, location: { latitude: p.lat, longitude: p.lng } })),
      nextPageToken: next < capped.length ? String(next) : undefined,
    };
  }
}

function makeGuard(cap: number) {
  let used = 0;
  const guard: BudgetGuardLike = {
    async assertAllowed() {
      if (used >= cap) throw new CapReachedError(used, cap);
    },
    async record() {
      used += 1;
      return used;
    },
  };
  return { guard, getUsed: () => used };
}

function makeHooks(freshIds: Set<string> = new Set()) {
  const state = { found: 0, created: 0, progressCalls: 0 };
  return {
    state,
    hooks: {
      async isTileFresh(ids: string[]) {
        return ids.length > 0 && ids.every((id) => freshIds.has(id));
      },
      async persistPlaces(places: { id: string }[]) {
        const found = places.length;
        const created = places.filter((p) => !freshIds.has(p.id)).length;
        state.found += found;
        state.created += created;
        return { found, created };
      },
      async onProgress() {
        state.progressCalls += 1;
      },
    },
  };
}

const AREA = { south: 40.6, west: -74.05, north: 40.7, east: -73.93 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("discoverCategoryArea", () => {
  it("subdivides saturated tiles and bills only on leaves", async () => {
    const provider = new FakeProvider(70);
    const { guard, getUsed } = makeGuard(1000);
    const { hooks, state } = makeHooks();

    const stats = await discoverCategoryArea(
      provider,
      guard,
      { textQuery: "plumber", rectangle: AREA },
      hooks,
    );

    const probes = provider.callLog.filter((c) => c.fields === "ids");
    const billed = provider.callLog.filter((c) => c.fields === "enterprise");
    expect(probes.length).toBeGreaterThan(1); // subdivision happened
    expect(billed.length).toBeGreaterThan(0); // leaves were fetched
    expect(getUsed()).toBe(billed.length); // every billed call was recorded
    expect(stats.requestsUsed).toBe(billed.length);
    expect(stats.placesFound).toBe(state.found);
    expect(state.progressCalls).toBe(billed.length);
  });

  it("stops subdividing at the minimum tile size even when saturated", async () => {
    const provider = new FakeProvider(70);
    const { guard } = makeGuard(1000);
    const { hooks } = makeHooks();

    await discoverCategoryArea(provider, guard, { textQuery: "x", rectangle: AREA }, hooks);

    // No queried tile may be smaller than half the ~300 m minimum: a split
    // only happens when the PARENT is ≥ 300 m, so children stay ≥ ~150 m.
    for (const call of provider.callLog) {
      const { south, west, north, east } = call.rectangle;
      const widthM = Math.abs(east - west) * 111_320 * Math.cos((40.67 * Math.PI) / 180);
      const heightM = Math.abs(north - south) * 110_574;
      expect(Math.max(widthM, heightM)).toBeGreaterThan(140);
    }
  });

  it("skips the billed fetch when the probed tile is entirely fresh", async () => {
    const { guard, getUsed } = makeGuard(1000);
    const fixed: DiscoveryProvider = {
      async searchText(req) {
        return req.fields === "ids"
          ? { places: [{ id: "known_1" }] }
          : { places: [{ id: "known_1", displayName: "Known" }] };
      },
    };
    const { hooks, state } = makeHooks(new Set(["known_1"]));

    const stats = await discoverCategoryArea(fixed, guard, { textQuery: "x", rectangle: AREA }, hooks);
    expect(stats.requestsUsed).toBe(0);
    expect(stats.tiles).toBe(0);
    expect(state.found).toBe(0);
    expect(getUsed()).toBe(0);
  });

  it("does not subdivide unsaturated tiles", async () => {
    const provider = new FakeProvider(15);
    const { guard } = makeGuard(1000);
    const { hooks } = makeHooks();

    const stats = await discoverCategoryArea(provider, guard, { textQuery: "x", rectangle: AREA }, hooks);
    const probes = provider.callLog.filter((c) => c.fields === "ids");
    expect(probes.length).toBe(1); // just the root tile
    expect(stats.tiles).toBe(1);
    expect(stats.requestsUsed).toBe(1); // one billed page of 15
  });

  it("stops cleanly with CapReachedError at the cap", async () => {
    const provider = new FakeProvider(50); // needs 3 billed pages
    const { guard } = makeGuard(1); // cap allows only 1
    const { hooks } = makeHooks();

    await expect(
      discoverCategoryArea(provider, guard, { textQuery: "x", rectangle: AREA }, hooks),
    ).rejects.toThrow(CapReachedError);
    const billed = provider.callLog.filter((c) => c.fields === "enterprise");
    expect(billed.length).toBe(1); // stopped right after the first
  });

  it("records nothing for empty tiles", async () => {
    const provider = new FakeProvider(0);
    const { guard, getUsed } = makeGuard(1000);
    const { hooks, state } = makeHooks();

    const stats = await discoverCategoryArea(provider, guard, { textQuery: "x", rectangle: AREA }, hooks);
    expect(getUsed()).toBe(0);
    expect(stats.requestsUsed).toBe(0);
    expect(stats.placesFound).toBe(0);
    expect(state.found).toBe(0);
  });
});
