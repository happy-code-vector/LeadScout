import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";

/**
 * CSV export with every contact field and the score reasons (spec: Leads /
 * manual-mode output). Applies the current table filters, or an explicit
 * businessIds selection from the bulk action bar.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const get = (k: string) => {
    const v = params.get(k);
    return v && v !== "ALL" ? v : undefined;
  };

  const businessIdsParam = params.get("businessIds");
  const businessIds = businessIdsParam ? businessIdsParam.split(",").filter(Boolean) : undefined;

  const where = {
    isChain: false,
    // Tier D is hidden by default (spec), same as the table.
    score: get("tier") ? { tier: get("tier")! } : { tier: { not: "D" } },
    ...(businessIds ? { id: { in: businessIds } } : {}),
    ...(get("q") ? { name: { contains: get("q")! } } : {}),
    ...(get("category") ? { category: { slug: get("category")! } } : {}),
    ...(get("area")
      ? { OR: [{ borough: get("area")! }, { city: get("area")! }] }
      : {}),
    ...(get("websiteClass") ? { audit: { websiteClass: get("websiteClass")! } } : {}),
    ...(get("status") ? { lead: { status: get("status")! } } : {}),
  };

  const businesses = await prisma.business.findMany({
    where,
    orderBy: [{ score: { total: "desc" } }, { name: "asc" }],
    include: {
      category: true,
      audit: true,
      score: true,
      contacts: true,
      lead: true,
    },
  });

  const header = [
    "name", "category", "area", "address", "phone", "emails", "website", "website_class",
    "tier", "total", "need", "viability", "reachability", "category_fit",
    "reasons", "status", "google_maps",
  ];
  const lines = [header.join(",")];
  for (const b of businesses) {
    const emails = b.contacts.filter((c) => c.type === "EMAIL").map((c) => c.value).join("; ");
    const phone = b.contacts.find((c) => c.type === "PHONE")?.value ?? b.phone ?? "";
    const score = b.score;
    const reasons = score ? fromJsonArray(score.reasons).join("; ") : "";
    lines.push(
      [
        b.name,
        b.category.name,
        b.borough ?? b.city ?? "",
        b.address ?? "",
        phone,
        emails,
        b.websiteUri ?? "",
        b.audit?.websiteClass ?? "",
        score?.tier ?? "",
        score?.total ?? "",
        score?.need ?? "",
        score?.viability ?? "",
        score?.reachability ?? "",
        score?.categoryFit ?? "",
        reasons,
        b.lead?.status ?? "",
        b.googleMapsUri ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = "﻿" + lines.join("\r\n"); // BOM so Excel opens UTF-8 correctly
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leadscout-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
