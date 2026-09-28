import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { stopSequences } from "@/lib/outreach/engine";

const outcomeSchema = z.object({
  outcome: z.enum([
    "NO_ANSWER",
    "VOICEMAIL",
    "INTERESTED",
    "NOT_INTERESTED",
    "CALL_BACK",
    "DO_NOT_CALL",
  ]),
  notes: z.string().max(4_000).optional(),
});

const STATUS_AFTER_OUTCOME: Record<string, string> = {
  NO_ANSWER: "CONTACTED",
  VOICEMAIL: "CONTACTED",
  INTERESTED: "MEETING",
  NOT_INTERESTED: "LOST",
  CALL_BACK: "CONTACTED",
  DO_NOT_CALL: "DO_NOT_CONTACT",
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = outcomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const task = await prisma.callTask.findUnique({
    where: { id },
    include: { lead: { include: { business: { select: { phone: true, placeId: true } } } } },
  });
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (task.completedAt) {
    return NextResponse.json({ error: "task already completed" }, { status: 400 });
  }

  await prisma.callTask.update({
    where: { id },
    data: { outcome: parsed.data.outcome, notes: parsed.data.notes ?? task.notes, completedAt: new Date() },
  });

  // Stop all remaining steps on NOT_INTERESTED / DO_NOT_CALL; DO_NOT_CALL
  // also writes the phone number to the suppression list (spec).
  if (["NOT_INTERESTED", "DO_NOT_CALL"].includes(parsed.data.outcome)) {
    await stopSequences(task.leadId, `call ${parsed.data.outcome}`);
  }
  if (parsed.data.outcome === "DO_NOT_CALL") {
    const lead = await prisma.lead.findUnique({
      where: { id: task.leadId },
      include: { business: { include: { contacts: { where: { type: "PHONE" } } } } },
    });
    const phoneValue =
      lead?.business.contacts.find((c) => c.type === "PHONE")?.value ?? lead?.business.phone;
    if (phoneValue) {
      await prisma.suppression.upsert({
        where: { value: phoneValue },
        update: {},
        create: { value: phoneValue, reason: "do-not-call" },
      });
    }
  }

  await prisma.lead.update({
    where: { id: task.leadId },
    data: { status: STATUS_AFTER_OUTCOME[parsed.data.outcome], lastActivityAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
