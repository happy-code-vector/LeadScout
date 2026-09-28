import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";

const mailboxSchema = z.object({
  label: z.string().min(1).max(80),
  smtpHost: z.string().min(1).max(200),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  imapHost: z.string().min(1).max(200),
  imapPort: z.number().int().min(1).max(65535).default(993),
  user: z.string().min(3).max(200),
  password: z.string().min(1).max(200),
  fromName: z.string().max(80).nullable().optional(),
  dailyLimit: z.number().int().min(1).max(200).default(40),
  warmupStartDate: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = mailboxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const d = parsed.data;
  const mailbox = await prisma.mailbox.create({
    data: {
      label: d.label,
      smtpHost: d.smtpHost,
      smtpPort: d.smtpPort,
      imapHost: d.imapHost,
      imapPort: d.imapPort,
      user: d.user,
      passwordEncrypted: encryptSecret(d.password),
      fromName: d.fromName ?? null,
      dailyLimit: d.dailyLimit,
      warmupStartDate: d.warmupStartDate ? new Date(d.warmupStartDate) : new Date(),
      active: true,
    },
    select: { id: true, label: true, user: true, smtpHost: true, dailyLimit: true, warmupStartDate: true, active: true },
  });
  return NextResponse.json({ mailbox }, { status: 201 });
}
