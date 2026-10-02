import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { PageHeader } from "@/components/page-header";
import { CaseStudiesClient } from "./case-studies-client";

export const dynamic = "force-dynamic";

export default async function CaseStudiesPage() {
  // No Business relation on CaseStudy in the schema (businessId is a plain
  // string), so resolve the optional business name with a separate lookup.
  const studies = await prisma.caseStudy.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
  const businessNames = new Map(
    (
      await prisma.business.findMany({
        where: {
          id: {
            in: studies
              .map((s) => s.businessId)
              .filter((id): id is string => Boolean(id)),
          },
        },
        select: { id: true, name: true },
      })
    ).map((b) => [b.id, b.name]),
  );
  return (
    <>
      <PageHeader
        title="Case studies"
        description="Published wins appear on the public /results page and the landing teaser."
      />
      <CaseStudiesClient
        studies={studies.map((s) => ({
          id: s.id,
          title: s.title,
          summary: s.summary,
          metrics: JSON.stringify(fromJsonArray(s.metrics)),
          published: s.published,
          order: s.order,
          siteUrl: s.siteUrl ?? "",
          businessId: s.businessId,
          businessName: s.businessId ? (businessNames.get(s.businessId) ?? null) : null,
        }))}
      />
    </>
  );
}
