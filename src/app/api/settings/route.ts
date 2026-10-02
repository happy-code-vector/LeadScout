import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import { publicBrandSchema } from "@/lib/public/brand";
import { scoringWeightsSchema } from "@/lib/scoring/weights";

const patchSchema = z.object({
  senderName: z.string().max(120).nullable().optional(),
  senderPostalAddress: z.string().max(400).nullable().optional(),
  placesMonthlyRequestCap: z.number().int().min(0).max(100_000).optional(),
  auditConcurrency: z.number().int().min(1).max(32).optional(),
  scoringWeights: scoringWeightsSchema.optional(),
  publicBrand: publicBrandSchema.optional(),
});

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const d = parsed.data;
  const { scoringWeights, publicBrand, ...rest } = d;

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {
      ...rest,
      ...(scoringWeights ? { scoringWeights: JSON.stringify(scoringWeights) } : {}),
      ...(publicBrand ? { publicBrand: JSON.stringify(publicBrand) } : {}),
    },
    create: {
      id: "singleton",
      ...rest,
      ...(scoringWeights ? { scoringWeights: JSON.stringify(scoringWeights) } : {}),
      scoringWeights: scoringWeights ? JSON.stringify(scoringWeights) : "{}",
      ...(publicBrand ? { publicBrand: JSON.stringify(publicBrand) } : {}),
    },
  });

  // Rescore everything whenever the weights change (spec).
  if (scoringWeights) {
    await enqueue("score.sweep", {});
  }

  return NextResponse.json({ ok: true });
}
