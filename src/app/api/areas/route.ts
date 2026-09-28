import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const areaSchema = z.object({
  name: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
  south: z.number().min(-90).max(90),
  west: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
}).refine((a) => a.north > a.south && a.east > a.west, {
  message: "bbox must satisfy north > south and east > west",
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = areaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid area" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const existing = await prisma.area.findFirst({
    where: { name: data.name, city: data.city, state: data.state.toUpperCase() },
  });
  if (existing) {
    return NextResponse.json({ area: existing });
  }

  const area = await prisma.area.create({
    data: { ...data, state: data.state.toUpperCase() },
  });
  return NextResponse.json({ area }, { status: 201 });
}
