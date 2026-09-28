import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { sendTestEmail } from "@/lib/outreach/sender";

const patchSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  smtpHost: z.string().min(1).max(200).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  imapHost: z.string().min(1).max(200).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  user: z.string().min(3).max(200).optional(),
  password: z.string().min(1).max(200).optional(),
  fromName: z.string().max(80).nullable().optional(),
  dailyLimit: z.number().int().min(1).max(200).optional(),
  warmupStartDate: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
  testTo: z.string().email().optional(),
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
  const mailbox = await prisma.mailbox.findUnique({ where: { id } });
  if (!mailbox) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Test send (no field changes required alongside).
  if (d.testTo) {
    const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
    try {
      const result = await sendTestEmail(mailbox, d.testTo, settings?.senderName ?? "LeadScout");
      return NextResponse.json({ sent: true, messageId: result.messageId });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "send failed" },
        { status: 400 },
      );
    }
  }

  const { password, warmupStartDate, ...rest } = d;
  const updated = await prisma.mailbox.update({
    where: { id },
    data: {
      ...rest,
      ...(password ? { passwordEncrypted: encryptSecret(password) } : {}),
      ...(warmupStartDate !== undefined
        ? { warmupStartDate: warmupStartDate ? new Date(warmupStartDate) : null }
        : {}),
    },
    select: { id: true, label: true, user: true, smtpHost: true, dailyLimit: true, warmupStartDate: true, active: true },
  });
  return NextResponse.json({ mailbox: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const inUse = await prisma.campaign.count({ where: { mailboxId: id } });
  if (inUse > 0) {
    return NextResponse.json({ error: `used by ${inUse} campaigns` }, { status: 400 });
  }
  await prisma.mailbox.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
