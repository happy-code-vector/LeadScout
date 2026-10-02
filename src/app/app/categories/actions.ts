"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  textQuery: z.string().min(1).max(80),
  includedType: z
    .string()
    .max(60)
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  propensity: z.coerce.number().int().min(0).max(10),
  active: z.coerce.boolean().default(true),
});

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function saveCategory(formData: FormData): Promise<void> {
  // Unchecked checkboxes are omitted from FormData entirely. An absent
  // "active" means: false on an edit row (checkbox unchecked), true on the
  // create form (which has no checkbox).
  const isActive = formData.has("active")
    ? formData.get("active") === "on" || formData.get("active") === "true"
    : !formData.has("id");

  const parsed = categorySchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    textQuery: formData.get("textQuery"),
    includedType: formData.get("includedType") || undefined,
    propensity: formData.get("propensity"),
    active: isActive,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "invalid category");
  }
  const { id, includedType, ...rest } = parsed.data;

  if (id) {
    await prisma.category.update({ where: { id }, data: { ...rest, includedType } });
  } else {
    const slug = slugify(rest.name);
    const exists = await prisma.category.findUnique({ where: { slug } });
    await prisma.category.create({
      data: {
        ...rest,
        includedType,
        slug: exists ? `${slug}-${Date.now().toString(36)}` : slug,
      },
    });
  }
  revalidatePath("/app/categories");
  revalidatePath("/app/discover");
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const id = z.string().parse(formData.get("id"));
  const inUse = await prisma.business.count({ where: { categoryId: id } });
  if (inUse > 0) {
    throw new Error(
      `Cannot delete: ${inUse} businesses reference this category. Deactivate it instead.`,
    );
  }
  await prisma.category.delete({ where: { id } });
  revalidatePath("/app/categories");
  revalidatePath("/app/discover");
}
