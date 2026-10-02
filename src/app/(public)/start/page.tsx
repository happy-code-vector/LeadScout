import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { getBrand } from "@/lib/public/brand";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start a project" };

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; report?: string }>;
}) {
  const params = await searchParams;
  const brand = await getBrand();
  const prefill: { url?: string; report?: string; reportClass?: string; reportFinding?: string } = {};
  if (params.url) prefill.url = params.url;
  if (params.report) {
    const report = await prisma.auditReport.findUnique({
      where: { id: params.report },
      select: { id: true, url: true, websiteClass: true, findings: true },
    });
    if (report) {
      prefill.report = report.id;
      prefill.url = prefill.url ?? report.url;
      prefill.reportClass = report.websiteClass;
      prefill.reportFinding = fromJsonArray(report.findings)[0] ?? undefined;
    }
  }
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Wizard
        prefill={prefill}
        reviews={
          brand.googleRating && brand.googleMapsUrl
            ? { rating: brand.googleRating, count: brand.googleReviewCount, url: brand.googleMapsUrl }
            : null
        }
      />
    </div>
  );
}
