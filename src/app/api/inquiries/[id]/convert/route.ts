import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { auditReport: true },
  });
  if (!inquiry) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inquiry.status === "CONVERTED") {
    return NextResponse.json({ error: "already converted" }, { status: 400 });
  }

  const website = inquiry.website ?? inquiry.auditReport?.url ?? null;
  const findings = inquiry.auditReport ? fromJsonArray(inquiry.auditReport.findings) : [];

  // Bucket category for inbound businesses (inactive: never in Discover).
  const category = await prisma.category.upsert({
    where: { slug: "inbound" },
    update: {},
    create: { slug: "inbound", name: "Inbound", textQuery: "", propensity: 0, active: false },
  });

  // All four writes in one transaction. The final claim is conditional
  // (`status != CONVERTED`), so a concurrent convert of the same inquiry
  // rolls back everything it created.
  try {
    const { leadId, businessId } = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          placeId: `inbound_${randomUUID()}`,
          name: inquiry.company || inquiry.name,
          categoryId: category.id,
          websiteUri: website,
        },
      });
      await tx.contact.create({
        data: {
          businessId: business.id,
          type: "EMAIL",
          value: inquiry.email,
          source: "INBOUND",
          verified: true, // they gave it to us voluntarily
        },
      });
      const lead = await tx.lead.create({
        data: {
          businessId: business.id,
          status: "QUEUED",
          notes: [
            `Inbound ${inquiry.source === "AUDIT_CTA" ? "via free site check" : "via contact form"}`,
            inquiry.auditReport ? `${inquiry.auditReport.websiteClass}: ${findings[0] ?? ""}` : "",
            inquiry.message ?? "",
          ].filter(Boolean).join(" — "),
        },
      });
      const claimed = await tx.inquiry.updateMany({
        where: { id, status: { not: "CONVERTED" } },
        data: { status: "CONVERTED", convertedAt: new Date(), businessId: business.id },
      });
      if (claimed.count === 0) throw new Error("already converted");
      return { leadId: lead.id, businessId: business.id };
    });
    return NextResponse.json({ leadId, businessId });
  } catch (err) {
    if (err instanceof Error && err.message === "already converted") {
      return NextResponse.json({ error: "already converted" }, { status: 400 });
    }
    throw err;
  }
}
