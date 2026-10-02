import { z } from "zod";
import { prisma } from "../db";

/** Brand facts shown on the public site. Lives in Settings.publicBrand. */
export const publicBrandSchema = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().max(160).default(""),
  email: z.string().max(160).default(""),
  phone: z.string().max(40).default(""),
  address: z.string().max(200).default(""),
});
export type PublicBrand = z.infer<typeof publicBrandSchema>;

export const DEFAULT_BRAND: PublicBrand = {
  name: "AppHub LLC",
  tagline: "Websites that bring local customers to your door.",
  email: "",
  phone: "",
  address: "",
};

export function parseBrand(raw: string | null | undefined): PublicBrand {
  if (!raw) return DEFAULT_BRAND;
  try {
    const parsed = publicBrandSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND;
  }
}

export async function getBrand(): Promise<PublicBrand> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { publicBrand: true },
  });
  return parseBrand(settings?.publicBrand);
}
