import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { DiscoverClient, type DiscoverData } from "./discover-client";
import { isPlacesConfigured } from "@/lib/env";
import { estimatedSpend, SKU_TEXT_SEARCH_ENTERPRISE } from "@/lib/discovery/budget";
import { monthlyUsage } from "@/lib/discovery/usage";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const [categories, areas, used, settings, runs] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.area.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }] }),
    monthlyUsage(SKU_TEXT_SEARCH_ENTERPRISE),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.discoveryRun.findMany({ orderBy: { startedAt: "desc" }, take: 8 }),
  ]);

  const data: DiscoverData = {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      textQuery: c.textQuery,
      propensity: c.propensity,
    })),
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      city: a.city,
      state: a.state,
      south: a.south,
      west: a.west,
      north: a.north,
      east: a.east,
    })),
    usage: {
      used,
      cap: settings?.placesMonthlyRequestCap ?? 1000,
      estimatedSpend: estimatedSpend(used),
    },
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      requestsUsed: r.requestsUsed,
      placesFound: r.placesFound,
      newPlaces: r.newPlaces,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
    placesConfigured: isPlacesConfigured,
  };

  return (
    <>
      <PageHeader
        title="Discover"
        description="Find businesses by category and area with the Google Places API."
      />
      <DiscoverClient data={data} />
    </>
  );
}
