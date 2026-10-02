"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/domain";

const caseStudySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1_000),
  metrics: z.string().max(4_000).default("[]"), // JSON: [{label, value}]
  businessId: z.string().optional(),
  siteUrl: z.string().trim().max(300).optional(),
  published: z.coerce.boolean().default(false),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

const metricsSchema = z
  .array(z.object({ label: z.string().max(60), value: z.string().max(60) }))
  .max(12);

function jsonOf(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // fails metricsSchema with the friendly error below
  }
}

export async function saveCaseStudy(formData: FormData): Promise<void> {
  const parsed = caseStudySchema.safeParse({
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    summary: formData.get("summary"),
    metrics: formData.get("metrics") || "[]",
    businessId: formData.get("businessId") || undefined,
    siteUrl: formData.get("siteUrl") || undefined,
    published: formData.get("published") === "on" || formData.get("published") === "true",
    order: formData.get("order") || 0,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid case study");
  // Validate metrics shape (not just JSON-ness) before storing.
  const metricsParsed = metricsSchema.safeParse(jsonOf(parsed.data.metrics));
  if (!metricsParsed.success) {
    throw new Error("metrics must be a JSON array of {label, value} strings (max 12 items, 60 chars each)");
  }
  const { id, businessId, siteUrl, ...rest } = parsed.data;
  const data = { ...rest, metrics: toJson(metricsParsed.data), businessId: businessId ?? null, siteUrl: siteUrl ?? null };
  if (id) {
    await prisma.caseStudy.update({ where: { id }, data });
  } else {
    await prisma.caseStudy.create({ data });
  }
  revalidatePath("/app/case-studies");
  revalidatePath("/results");
  revalidatePath("/");
}

export async function deleteCaseStudy(formData: FormData): Promise<void> {
  const id = z.string().parse(formData.get("id"));
  await prisma.caseStudy.delete({ where: { id } });
  revalidatePath("/app/case-studies");
  revalidatePath("/results");
  revalidatePath("/");
}

/** Draft a case study from a WON lead (button on lead detail). */
export async function createCaseStudyFromLead(formData: FormData): Promise<void> {
  const businessId = z.string().parse(formData.get("businessId"));
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, category: { select: { name: true } } },
  });
  if (!business) throw new Error("business not found");
  await prisma.caseStudy.create({
    data: {
      title: business.name,
      summary: `${business.category.name} — website rebuilt and launched.`,
      metrics: toJson([{ label: "Status", value: "Launched" }]),
      businessId: business.id,
      published: false,
      order: 0,
    },
  });
  revalidatePath("/app/case-studies");
}
