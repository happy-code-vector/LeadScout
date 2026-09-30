import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/passwords";

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });
  return NextResponse.json({ ok: true });
}
