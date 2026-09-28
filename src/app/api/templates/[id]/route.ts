import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  channel: z.enum(["EMAIL", "POSTAL", "PHONE"]).optional(),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(50_000).optional(),
  variant: z.string().max(60).nullable().optional(),
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
  const inUse = await prisma.sequenceStep.count({ where: { templateId: id } });
  if (inUse > 0 && parsed.data.channel) {
    return NextResponse.json(
      { error: "template is used by a sequence step — channel is fixed" },
      { status: 400 },
    );
  }
  const template = await prisma.template.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ template });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const inUse = await prisma.sequenceStep.count({ where: { templateId: id } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: `used by ${inUse} sequence steps — remove those first` },
      { status: 400 },
    );
  }
  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
