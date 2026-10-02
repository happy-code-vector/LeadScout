import Link from "next/link";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/public/brand";
import { ReviewsBadge } from "@/components/public/reviews-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results" };

/** Display host for a case-study link; the raw string when it isn't a parseable URL. */
function siteHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default async function ResultsPage() {
  const [brand, studies] = await Promise.all([
    getBrand(),
    prisma.caseStudy.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  if (studies.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Results</h1>
        <p className="mt-4 text-muted-foreground">
          The first projects are in flight. Check back soon — or be one of them:{" "}
          <Link href="/audit" className="underline underline-offset-4">start with a free site check</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Results</h1>
      <ReviewsBadge brand={brand} className="mt-3" />
      <div className="mt-10 space-y-6">
        {studies.map((s) => {
          const parsed = (() => {
            try {
              const v = JSON.parse(s.metrics);
              return Array.isArray(v) ? v : [];
            } catch {
              return [];
            }
          })();
          const metrics = parsed.filter(
            (m): m is { label: string; value: string } =>
              typeof m === "object" && m !== null &&
              typeof (m as { label?: unknown }).label === "string" &&
              typeof (m as { value?: unknown }).value === "string",
          );
          const host = s.siteUrl ? siteHost(s.siteUrl) : null;
          const body = (
            <>
              <h2 className="text-xl font-semibold">{s.title}</h2>
              {host ? <p className="mt-1 text-xs text-muted-foreground">{host}</p> : null}
              <p className="mt-2 text-muted-foreground">{s.summary}</p>
              <div className="mt-4 flex flex-wrap gap-6">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <div className="text-2xl font-semibold tabular-nums">{m.value}</div>
                    <div className="text-xs text-muted-foreground">{m.label}</div>
                  </div>
                ))}
              </div>
            </>
          );
          return s.siteUrl ? (
            <a key={s.id} href={s.siteUrl} target="_blank" rel="noreferrer" className="block rounded-xl border p-6 transition-colors hover:bg-muted/40">
              {body}
            </a>
          ) : (
            <article key={s.id} className="rounded-xl border p-6">
              {body}
            </article>
          );
        })}
      </div>
    </div>
  );
}
