import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { PageHeader } from "@/components/page-header";
import { LeadsClient } from "./leads-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export interface LeadRow {
  id: string;
  businessId: string;
  name: string;
  categoryName: string;
  area: string;
  websiteClass: string;
  tier: string;
  total: number;
  topReason: string;
  hasEmail: boolean;
  hasPhone: boolean;
  hasPostal: boolean;
  status: string;
  websiteUri: string | null;
}

interface LeadsFilters {
  q?: string;
  tier?: string;
  category?: string;
  area?: string;
  websiteClass?: string;
  status?: string;
  page: number;
}

function parseFilters(searchParams: Record<string, string | string[] | undefined>): LeadsFilters {
  const get = (k: string) => {
    const v = searchParams[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s !== "ALL" ? s : undefined;
  };
  const pageRaw = get("page");
  return {
    q: get("q"),
    tier: get("tier"),
    category: get("category"),
    area: get("area"),
    websiteClass: get("websiteClass"),
    status: get("status"),
    page: Math.max(1, Number(pageRaw) || 1),
  };
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const where = {
    isChain: false,
    // Tier D is hidden by default (spec).
    score: filters.tier ? { tier: filters.tier } : { tier: { not: "D" } },
    ...(filters.q ? { name: { contains: filters.q } } : {}),
    ...(filters.category ? { category: { slug: filters.category } } : {}),
    ...(filters.area ? { OR: [{ borough: filters.area }, { city: filters.area }] } : {}),
    ...(filters.websiteClass ? { audit: { websiteClass: filters.websiteClass } } : {}),
    ...(filters.status ? { lead: { status: filters.status } } : {}),
  };

  const [businesses, total, categories, areas, campaigns] = await Promise.all([
    prisma.business.findMany({
      where,
      orderBy: [{ score: { total: "desc" } }, { name: "asc" }],
      take: PAGE_SIZE,
      skip: (filters.page - 1) * PAGE_SIZE,
      include: {
        category: true,
        audit: true,
        contacts: { select: { type: true } },
        score: true,
        lead: true,
      },
    }),
    prisma.business.count({ where }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.area.findMany({ orderBy: { name: "asc" } }),
    prisma.campaign.findMany({
      where: { status: { in: ["DRAFT", "RUNNING", "PAUSED"] } },
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rows: LeadRow[] = businesses.map((b) => {
    const score = b.score;
    const reasons = score ? fromJsonArray(score.reasons) : [];
    return {
      id: b.lead?.id ?? b.id,
      businessId: b.id,
      name: b.name,
      categoryName: b.category.name,
      area: b.borough ?? b.city ?? "—",
      websiteClass: b.audit?.websiteClass ?? "—",
      tier: score?.tier ?? "—",
      total: score?.total ?? 0,
      topReason: reasons[0] ?? "",
      hasEmail: b.contacts.some((c) => c.type === "EMAIL"),
      hasPhone: b.contacts.some((c) => c.type === "PHONE"),
      hasPostal: Boolean(b.address),
      status: b.lead?.status ?? "NEW",
      websiteUri: b.websiteUri,
    };
  });

  return (
    <>
      <PageHeader
        title="Leads"
        description={`${total} scored businesses${filters.tier === "D" ? " (showing tier D)" : " (tier D hidden)"}.`}
      />
      <LeadsClient
        rows={rows}
        total={total}
        page={filters.page}
        pageSize={PAGE_SIZE}
        filters={filters}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        areas={areas.map((a) => a.name)}
        campaigns={campaigns}
      />
    </>
  );
}
