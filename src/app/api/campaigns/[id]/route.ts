import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/domain";
import {
  CampaignValidationError,
  startCampaign,
  stopSequences,
} from "@/lib/outreach/engine";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  mode: z.enum(["MANUAL", "AUTO"]).optional(),
  channelOrder: z.array(z.enum(["EMAIL", "POSTAL", "PHONE"])).min(1).optional(),
  filters: z
    .object({
      tiers: z.array(z.enum(["A", "B", "C", "D"])).optional(),
      categorySlugs: z.array(z.string()).optional(),
      areas: z.array(z.string()).optional(),
      websiteClasses: z.array(z.string()).optional(),
    })
    .optional(),
  sequenceId: z.string().nullable().optional(),
  mailboxId: z.string().nullable().optional(),
  dailyLimit: z.number().int().min(1).max(500).optional(),
  sendWindow: z
    .object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(1).max(24),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    })
    .optional(),
  control: z.enum(["start", "pause", "resume", "stop"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const d = parsed.data;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Controls --------------------------------------------------------------
  if (d.control === "start") {
    if (campaign.status === "RUNNING") {
      return NextResponse.json({ error: "already running" }, { status: 400 });
    }
    try {
      const scheduled = await startCampaign(id);
      return NextResponse.json({ campaign: await reload(id), scheduled });
    } catch (err) {
      if (err instanceof CampaignValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }
  if (d.control === "pause" || d.control === "stop") {
    await prisma.campaign.update({
      where: { id },
      data: { status: d.control === "pause" ? "PAUSED" : "STOPPED" },
    });
    if (d.control === "stop") {
      const pending = await prisma.outreachEvent.findMany({
        where: { campaignId: id, status: "SCHEDULED" },
        select: { leadId: true },
      });
      for (const leadId of new Set(pending.map((p) => p.leadId))) {
        await stopSequences(leadId, "campaign stopped");
      }
    }
    return NextResponse.json({ campaign: await reload(id) });
  }
  if (d.control === "resume") {
    await prisma.campaign.update({ where: { id }, data: { status: "RUNNING" } });
    return NextResponse.json({ campaign: await reload(id) });
  }

  // Field updates (only while DRAFT/PAUSED — not mid-run).
  if (campaign.status === "RUNNING") {
    return NextResponse.json({ error: "pause the campaign before editing" }, { status: 400 });
  }
  await prisma.campaign.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.mode !== undefined ? { mode: d.mode } : {}),
      ...(d.channelOrder ? { channelOrder: toJson(d.channelOrder) } : {}),
      ...(d.filters ? { filters: toJson(d.filters) } : {}),
      ...(d.sequenceId !== undefined ? { sequenceId: d.sequenceId } : {}),
      ...(d.mailboxId !== undefined ? { mailboxId: d.mailboxId } : {}),
      ...(d.dailyLimit !== undefined ? { dailyLimit: d.dailyLimit } : {}),
      ...(d.sendWindow ? { sendWindow: toJson(d.sendWindow) } : {}),
    },
  });
  return NextResponse.json({ campaign: await reload(id) });
}

async function reload(id: string) {
  return prisma.campaign.findUnique({ where: { id } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (campaign.status === "RUNNING") {
    return NextResponse.json({ error: "stop the campaign first" }, { status: 400 });
  }
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
