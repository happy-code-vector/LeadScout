import Link from "next/link";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/public/brand";
import { CONTENT } from "@/content/public-site";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const brand = await getBrand();
  const teaser = await prisma.caseStudy.findMany({
    where: { published: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: 3,
  });

  return (
    <div>
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        {brand.tagline ? <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{brand.tagline}</p> : null}
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{CONTENT.hero.headline}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{CONTENT.hero.sub}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={CONTENT.hero.primaryCta.href} className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">{CONTENT.hero.primaryCta.label}</Link>
          <Link href={CONTENT.hero.secondaryCta.href} className="rounded-lg border px-5 py-2.5 font-medium hover:bg-muted">{CONTENT.hero.secondaryCta.label}</Link>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">What we do</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {CONTENT.services.map((s) => (
              <div key={s.title} className="rounded-xl border bg-background p-6">
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                  {s.bullets.map((b) => <li key={b}>· {b}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {CONTENT.steps.map((s) => (
            <div key={s.title}>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {teaser.length > 0 && (
        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Recent work</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {teaser.map((c) => (
                <div key={c.id} className="rounded-xl border bg-background p-6">
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{c.summary}</p>
                </div>
              ))}
            </div>
            <Link href="/results" className="mt-6 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">See all results →</Link>
          </div>
        </section>
      )}

      <section className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Work with one person, start to finish</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{CONTENT.founder}</p>
          <Link href="/start" className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">Get in touch</Link>
        </div>
      </section>
    </div>
  );
}
