import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";

const bulkSchema = z.object({
  action: z.enum(["set_status", "dnc", "add_to_campaign"]),
  status: z
    .enum(["NEW", "QUEUED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "WON", "LOST", "DO_NOT_CONTACT"])
    .optional(),
  campaignId: z.string().min(1).optional(),
  businessIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { action, status, campaignId, businessIds } = parsed.data;

  if (action === "add_to_campaign") {
    if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
    const leads = await prisma.lead.findMany({
      where: { businessId: { in: businessIds } },
      select: { id: true },
    });
    for (const lead of leads) {
      await prisma.campaignLead.upsert({
        where: { campaignId_leadId: { campaignId, leadId: lead.id } },
        update: {},
        create: { campaignId, leadId: lead.id },
      });
    }
    return NextResponse.json({ updated: leads.length });
  }

  if (action === "set_status") {
    if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });
    const res = await prisma.lead.updateMany({
      where: { business: { id: { in: businessIds } } },
      data: { status, lastActivityAt: new Date() },
    });
    return NextResponse.json({ updated: res.count });
  }

  // dnc: set the lead status and suppress the placeId everywhere.
  const businesses = await prisma.business.findMany({
    where: { id: { in: businessIds } },
    select: { id: true, placeId: true },
  });
  const res = await prisma.lead.updateMany({
    where: { businessId: { in: businesses.map((b) => b.id) } },
    data: { status: "DO_NOT_CONTACT", lastActivityAt: new Date() },
  });
  for (const b of businesses) {
    await prisma.suppression.upsert({
      where: { value: b.placeId },
      update: {},
      create: { value: b.placeId, reason: "do-not-contact" },
    });
  }
  // DNC leads lose their score (excluded) — rescore in the background.
  await enqueue("score.sweep", {});
  return NextResponse.json({ updated: res.count });
}
