import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { getBrand } from "@/lib/public/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your site check", robots: { index: false, follow: false } };

const VERDICT: Record<string, { title: string; tone: "bad" | "warn" | "good"; blurb: string }> = {
  DEAD: { title: "Your website is unreachable", tone: "bad", blurb: "Customers typing your address get nothing. Every visit, and every Google search, is a lost call." },
  PARKED: { title: "Your domain is parked", tone: "bad", blurb: "The address exists but shows an ad page. Anyone who finds it leaves immediately." },
  SOCIAL_OR_DIRECTORY: { title: "That's a social page, not your website", tone: "warn", blurb: "A listing you don't own isn't a website: it ranks for its own brand, not yours, and you can't control it." },
  OUTDATED: { title: "Your website needs updating", tone: "warn", blurb: "The issues below are exactly what customers notice — and what Google penalizes." },
  OK: { title: "Your website is in good shape", tone: "good", blurb: "No significant issues found. If you want more from it — speed, leads, content — that's the next conversation." },
};

export default async function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await prisma.auditReport.findUnique({ where: { id } });
  if (!report) notFound();
  const brand = await getBrand();
  const verdict = VERDICT[report.websiteClass] ?? VERDICT.OK;
  const findings = fromJsonArray(report.findings);
  const tone = verdict.tone === "bad" ? "border-destructive/40 bg-destructive/10" : verdict.tone === "warn" ? "border-yellow-600/40 bg-yellow-500/10" : "border-emerald-600/40 bg-emerald-500/10";

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm text-muted-foreground">Site check · {new URL(report.url).hostname}</p>
      <div className={`mt-3 rounded-xl border p-6 ${tone}`}>
        <h1 className="text-2xl font-semibold tracking-tight">{verdict.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{verdict.blurb}</p>
      </div>
      {findings.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold">What we found</h2>
          <ul className="mt-3 space-y-2">
            {findings.map((f) => (
              <li key={f} className="rounded-lg border px-4 py-3 text-sm">· {f}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-10 rounded-xl border bg-muted/30 p-6">
        <h2 className="font-semibold">Want this fixed?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {brand.name} rebuilds sites like this for a simple fixed quote, agreed on a free call before any work starts.
        </p>
        <a
          href={`/start?url=${encodeURIComponent(report.url)}&report=${report.id}`}
          className="mt-4 inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Start a project →
        </a>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Checked {report.checkedAt.toLocaleString()} · Shareable link · {brand.name}</p>
    </div>
  );
}
