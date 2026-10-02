import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { InquiriesClient } from "./inquiries-client";

export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  const inquiries = await prisma.inquiry.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { auditReport: { select: { id: true, websiteClass: true, url: true } } },
  });
  return (
    <>
      <PageHeader title="Inquiries" description="Inbound leads from the public site — contact form and free site checks." />
      <InquiriesClient
        inquiries={inquiries.map((i) => ({
          id: i.id, name: i.name, email: i.email, phone: i.phone ?? "", company: i.company ?? "",
          website: i.website ?? i.auditReport?.url ?? "", message: i.message ?? "",
          businessType: i.businessType ?? "",
          source: i.source, status: i.status,
          auditClass: i.auditReport?.websiteClass ?? null, auditId: i.auditReport?.id ?? null,
          businessId: i.businessId ?? null,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
