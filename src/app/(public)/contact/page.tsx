import { getBrand } from "@/lib/public/brand";
import { CONTENT } from "@/content/public-site";
import { ContactForm } from "./contact-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const brand = await getBrand();
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Let&apos;s talk</h1>
      <p className="mt-3 text-muted-foreground">{CONTENT.contactBlurb}</p>
      {brand.email ? <p className="mt-1 text-sm text-muted-foreground">Prefer email? <a className="underline underline-offset-4" href={`mailto:${brand.email}`}>{brand.email}</a></p> : null}
      <div className="mt-8"><ContactForm /></div>
    </div>
  );
}
