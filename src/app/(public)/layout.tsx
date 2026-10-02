import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { getBrand } from "@/lib/public/brand";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: brand.tagline || "Websites that bring local customers to your door.",
    openGraph: { title: brand.name, description: brand.tagline, type: "website" },
  };
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
