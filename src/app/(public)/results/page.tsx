import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results" };

export default async function ResultsPage() {
  const studies = await prisma.caseStudy.findMany({
    where: { published: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  if (studies.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Results</h1>
        <p className="mt-4 text-muted-foreground">
          The first projects are in flight. Check back soon — or be one of them:{" "}
          <a href="/audit" className="underline underline-offset-4">start with a free site check</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Results</h1>
      <div className="mt-10 space-y-6">
        {studies.map((s) => {
          const metrics = JSON.parse(s.metrics) as { label: string; value: string }[];
          return (
            <article key={s.id} className="rounded-xl border p-6">
              <h2 className="text-xl font-semibold">{s.title}</h2>
              <p className="mt-2 text-muted-foreground">{s.summary}</p>
              <div className="mt-4 flex flex-wrap gap-6">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <div className="text-2xl font-semibold tabular-nums">{m.value}</div>
                    <div className="text-xs text-muted-foreground">{m.label}</div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
