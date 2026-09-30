import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, passwordSchema } from "@/lib/auth/passwords";

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: passwordSchema,
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  await prisma.user.create({
    data: { email, passwordHash: hashPassword(parsed.data.password), role: "USER", status: "PENDING" },
  });
  return NextResponse.json({ status: "PENDING" }, { status: 201 });
}
