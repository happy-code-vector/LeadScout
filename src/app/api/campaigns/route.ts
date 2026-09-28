import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/domain";
import { countCampaignPool, type CampaignFilters } from "@/lib/outreach/engine";

const filtersSchema = z.object({
  tiers: z.array(z.enum(["A", "B", "C", "D"])).optional(),
  categorySlugs: z.array(z.string()).optional(),
  areas: z.array(z.string()).optional(),
  websiteClasses: z.array(z.string()).optional(),
});

const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  mode: z.enum(["MANUAL", "AUTO"]),
  channelOrder: z.array(z.enum(["EMAIL", "POSTAL", "PHONE"])).min(1),
  filters: filtersSchema.default({}),
  sequenceId: z.string().nullable().optional(),
  mailboxId: z.string().nullable().optional(),
  dailyLimit: z.number().int().min(1).max(500).default(50),
  sendWindow: z
    .object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(1).max(24),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    })
    .default({ startHour: 9, endHour: 16, daysOfWeek: [1, 2, 3, 4, 5] }),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = campaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const d = parsed.data;
  const campaign = await prisma.campaign.create({
    data: {
      name: d.name,
      mode: d.mode,
      channelOrder: toJson(d.channelOrder),
      filters: toJson(d.filters),
      sequenceId: d.sequenceId ?? null,
      mailboxId: d.mailboxId ?? null,
      dailyLimit: d.dailyLimit,
      sendWindow: toJson(d.sendWindow),
      status: "DRAFT",
    },
  });
  return NextResponse.json({ campaign }, { status: 201 });
}

/** Live pool count for the editor's filters. */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = filtersSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid filters" }, { status: 400 });
  }
  const count = await countCampaignPool(parsed.data as CampaignFilters);
  return NextResponse.json({ count });
}
