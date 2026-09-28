"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";

const statusSchema = z.object({
  businessId: z.string().min(1),
  status: z.enum([
    "NEW", "QUEUED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "WON", "LOST", "DO_NOT_CONTACT",
  ]),
});

export async function setStatus(formData: FormData): Promise<void> {
  const parsed = statusSchema.safeParse({
    businessId: formData.get("businessId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("invalid status");

  await prisma.lead.upsert({
    where: { businessId: parsed.data.businessId },
    update: { status: parsed.data.status, lastActivityAt: new Date() },
    create: { businessId: parsed.data.businessId, status: parsed.data.status },
  });

  if (parsed.data.status === "DO_NOT_CONTACT") {
    const b = await prisma.business.findUnique({
      where: { id: parsed.data.businessId },
      select: { placeId: true },
    });
    if (b) {
      await prisma.suppression.upsert({
        where: { value: b.placeId },
        update: {},
        create: { value: b.placeId, reason: "do-not-contact" },
      });
    }
    await enqueue("score.sweep", {});
  }

  revalidatePath(`/leads/${parsed.data.businessId}`);
  revalidatePath("/leads");
}

export async function saveNotes(formData: FormData): Promise<void> {
  const businessId = z.string().min(1).parse(formData.get("businessId"));
  const notes = z.string().max(10_000).parse(formData.get("notes") ?? "");
  await prisma.lead.upsert({
    where: { businessId },
    update: { notes, lastActivityAt: new Date() },
    create: { businessId, notes },
  });
  revalidatePath(`/leads/${businessId}`);
}

const contactSchema = z.object({
  businessId: z.string().min(1),
  type: z.enum(["EMAIL", "PHONE", "POSTAL"]),
  value: z.string().min(3).max(300),
});

export async function addContact(formData: FormData): Promise<void> {
  const parsed = contactSchema.safeParse({
    businessId: formData.get("businessId"),
    type: formData.get("type"),
    value: formData.get("value"),
  });
  if (!parsed.success) throw new Error("invalid contact");
  const { businessId, type, value } = parsed.data;

  const normalized = type === "EMAIL" ? value.trim().toLowerCase() : value.trim();

  await prisma.contact.upsert({
    where: { businessId_type_value: { businessId, type, value: normalized } },
    update: {},
    create: { businessId, type, value: normalized, source: "MANUAL", verified: type !== "EMAIL" },
  });

  // A manually added email may change reachability — rescore.
  await enqueue("score.sweep", {});

  revalidatePath(`/leads/${businessId}`);
}
