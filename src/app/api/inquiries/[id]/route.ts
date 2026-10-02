import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "DISMISSED"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inquiry.status === "CONVERTED") {
    return NextResponse.json({ error: "already converted" }, { status: 400 });
  }
  await prisma.inquiry.update({ where: { id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ok: true });
}
