import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import { toJson } from "@/lib/domain";
import { isPlacesConfigured } from "@/lib/env";
import { estimatedSpend, SKU_TEXT_SEARCH_ENTERPRISE } from "@/lib/discovery/budget";
import { monthlyUsage } from "@/lib/discovery/usage";

const startSchema = z.object({
  categoryIds: z.array(z.string().min(1)).min(1),
  areaIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  if (!isPlacesConfigured) {
    return NextResponse.json(
      { error: "Places API key not configured — set GOOGLE_PLACES_API_KEY to run discovery" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "categoryIds and areaIds are required" },
      { status: 400 },
    );
  }

  const categories = await prisma.category.findMany({
    where: { id: { in: parsed.data.categoryIds }, active: true },
  });
  const areas = await prisma.area.findMany({
    where: { id: { in: parsed.data.areaIds } },
  });
  if (categories.length === 0 || areas.length === 0) {
    return NextResponse.json(
      { error: "no active categories or areas matched" },
      { status: 400 },
    );
  }

  const run = await prisma.discoveryRun.create({
    data: {
      categoryIds: toJson(categories.map((c) => c.id)),
      areaIds: toJson(areas.map((a) => a.id)),
      status: "RUNNING",
    },
  });

  // maxAttempts 1: a failed run is re-runnable from the UI (idempotent upserts).
  await enqueue("discovery.run", { runId: run.id }, { maxAttempts: 1 });

  return NextResponse.json({ runId: run.id });
}

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");

  if (runId) {
    const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ run });
  }

  const [runs, used, settings] = await Promise.all([
    prisma.discoveryRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    monthlyUsage(SKU_TEXT_SEARCH_ENTERPRISE),
    prisma.settings.findUnique({
      where: { id: "singleton" },
      select: { placesMonthlyRequestCap: true },
    }),
  ]);
  return NextResponse.json({
    runs,
    usage: {
      used,
      cap: settings?.placesMonthlyRequestCap ?? 1000,
      estimatedSpend: estimatedSpend(used),
    },
  });
}
