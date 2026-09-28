/**
 * Generates deterministic Places fixtures for mock mode (spec: Hard rules #2).
 * Run: npx tsx scripts/generate-place-fixtures.ts
 *
 * Website hosts use the reserved ".test" TLD with a kind prefix
 * (e.g. "old-copyright-2016.name.test") so the phase-3 website auditor can
 * serve matching HTML fixtures without any network access.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Deterministic PRNG (mulberry32).
let seed = 42;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function range(min: number, max: number): number {
  return min + rand() * (max - min);
}

const NAME_PREFIXES = [
  "Ace", "Apex", "Atlas", "Baxter", "Bedford", "Borough", "Bridges", "Carroll",
  "Clinton", "Cobble", "Crown", "Ditmas", "Dumont", "Eastern", "Empire", "Flatbush",
  "Fifth", "Fourth", "Greenwood", "Kensington", "Kings", "Lafayette", "Lexington",
  "Madison", "Manhattan", "Midwood", "Nostrand", "Ocean", "Park", "Prospect",
  "Riverside", "Rogers", "Smith", "Sterling", "Sunset", "Third", "Tillary", "Union",
  "Vanderbilt", "Warren",
] as const;

const SUFFIXES_BY_QUERY: Record<string, readonly string[]> = {
  plumber: ["Plumbing & Heating", "Plumbing Co.", "Plumbing", "Plumbers"],
  electrician: ["Electric", "Electrical Co.", "Electrician Services", "Electricians"],
};

const STREETS = [
  "5th Ave", "7th Ave", "Flatbush Ave", "Atlantic Ave", "Court St", "Smith St",
  "Bedford Ave", "Nostrand Ave", "Kingston Ave", "Utica Ave", "Ralph Ave",
  "Broadway", "Bushwick Ave", "Graham Ave", "Manhattan Ave", "Franklin Ave",
  "Grand St", "Lenox Rd", "Ocean Ave", "Coney Island Ave", "18th Ave", "86th St",
] as const;

const NEIGHBORHOODS = [
  "Park Slope", "Williamsburg", "Bedford-Stuyvesant", "Bay Ridge", "Crown Heights",
  "Bushwick", "Sunset Park", "Kensington", "Flatbush", "Greenpoint",
] as const;

interface FixPlace {
  textQuery: string;
  id: string;
  displayName: string;
  formattedAddress: string;
  addressComponents: { types: string[]; longText: string; shortText: string }[];
  location: { latitude: number; longitude: number };
  types: string[];
  primaryType: string;
  nationalPhoneNumber: string;
  websiteUri: string | null;
  rating: number;
  userRatingCount: number;
  businessStatus: string;
  googleMapsUri: string;
}

function siteHost(displayName: string): string | null {
  const roll = rand();
  if (roll < 0.35) return null; // no website at all
  if (roll < 0.5) {
    // social/directory listing
    return pick([
      "facebook.com",
      "yelp.com",
      "instagram.com",
      "linktr.ee",
      "business.site",
    ]) + "/" + slug(displayName);
  }
  const kind = pick([
    "old-copyright-2016", // outdated: copyright year
    "no-viewport",        // outdated: not mobile friendly
    "no-contact",         // outdated: no contact path
    "plain-old-2014",     // outdated: several signals
    "parked-forsale",     // parked domain
    "dead-tls",           // dead site
    "modern-fresh",       // fine, current site
  ]);
  return `${kind}.${slug(displayName)}.test`;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function makePlace(opts: {
  textQuery: string;
  lat: number;
  lng: number;
  neighborhood: string;
  zip: string;
}): FixPlace {
  const suffix = pick(SUFFIXES_BY_QUERY[opts.textQuery] ?? ["Services"]);
  const displayName = `${pick(NAME_PREFIXES)} ${suffix}`;
  const streetNum = Math.floor(range(10, 2800));
  const phoneSeq = String(Math.floor(range(100, 199)));
  const host = siteHost(displayName);
  return {
    textQuery: opts.textQuery,
    id: `mock_${slug(opts.neighborhood)}_${slug(displayName)}_${Math.floor(rand() * 1e6)}`,
    displayName,
    formattedAddress: `${streetNum} ${pick(STREETS)}, ${opts.neighborhood}, Brooklyn, NY ${opts.zip}`,
    addressComponents: [
      { types: ["sublocality_level_1"], longText: opts.neighborhood, shortText: opts.neighborhood },
      { types: ["locality"], longText: "New York", shortText: "New York" },
      { types: ["administrative_area_level_1"], longText: "New York", shortText: "NY" },
      { types: ["postal_code"], longText: opts.zip, shortText: opts.zip },
    ],
    location: { latitude: opts.lat, longitude: opts.lng },
    types: [opts.textQuery === "plumber" ? "plumber" : "electrician", "point_of_interest", "establishment"],
    primaryType: opts.textQuery === "plumber" ? "plumber" : "electrician",
    nationalPhoneNumber: `+1 ${pick(["718", "347", "929"])} 555 0${phoneSeq.slice(0, 1)}${phoneSeq.slice(1)}`,
    websiteUri: host === null ? null : `https://${host}`,
    rating: Math.round(range(3.2, 4.9) * 10) / 10,
    userRatingCount: Math.floor(range(0, 280)),
    businessStatus: rand() < 0.04 ? "CLOSED_PERMANENTLY" : "OPERATIONAL",
    googleMapsUri: `https://www.google.com/maps/place/?q=place_id:mock_${Math.floor(rand() * 1e9)}`,
  };
}

async function writeFixtures(file: string, places: FixPlace[]): Promise<void> {
  const dir = path.join(process.cwd(), "fixtures", "places");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), JSON.stringify({ places }, null, 2) + "\n", "utf8");
  console.log(`${file}: ${places.length} places`);
}

async function main() {
  // Brooklyn plumbers: 64 in a dense Park Slope cluster (forces tiling
  // subdivision), 16 spread borough-wide.
  const clustered: FixPlace[] = Array.from({ length: 64 }, () =>
    makePlace({
      textQuery: "plumber",
      lat: range(40.665, 40.675),
      lng: range(-73.985, -73.975),
      neighborhood: "Park Slope",
      zip: "11215",
    }),
  );
  const spread: FixPlace[] = Array.from({ length: 16 }, () =>
    makePlace({
      textQuery: "plumber",
      lat: range(40.56, 40.73),
      lng: range(-74.03, -73.84),
      neighborhood: pick(NEIGHBORHOODS),
      zip: `112${Math.floor(range(1, 39))}`,
    }),
  );
  await writeFixtures("brooklyn-plumbers.json", [...clustered, ...spread]);

  const electricians: FixPlace[] = Array.from({ length: 24 }, () =>
    makePlace({
      textQuery: "electrician",
      lat: range(40.56, 40.73),
      lng: range(-74.03, -73.84),
      neighborhood: pick(NEIGHBORHOODS),
      zip: `112${Math.floor(range(1, 39))}`,
    }),
  );
  await writeFixtures("brooklyn-electricians.json", electricians);

  const manhattan: FixPlace[] = Array.from({ length: 18 }, () =>
    makePlace({
      textQuery: "plumber",
      lat: range(40.7, 40.83),
      lng: range(-74.01, -73.94),
      neighborhood: pick(["Harlem", "Upper West Side", "East Village", "Chelsea", "Yorkville"]),
      zip: `100${Math.floor(range(10, 40))}`,
    }),
  );
  await writeFixtures("manhattan-plumbers.json", manhattan);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
