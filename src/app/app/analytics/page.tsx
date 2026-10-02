import { prisma } from "@/lib/db";
import { estimatedSpend, SKU_TEXT_SEARCH_ENTERPRISE } from "@/lib/discovery/budget";
import { monthlyUsage } from "@/lib/discovery/usage";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const REPLIED = ["REPLIED", "MEETING", "PROPOSAL", "WON"];
const MEETING = ["MEETING", "PROPOSAL", "WON"];

interface Row {
  key: string;
  contacted: number;
  replied: number;
  meetings: number;
  won: number;
}

function pct(n: number, d: number): string {
  return d === 0 ? "â€”" : `${Math.round((n / d) * 100)}%`;
}

function RatesTable({ rows, emptyLabel, label }: { rows: Row[]; emptyLabel: string; label: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">Contacted</TableHead>
          <TableHead className="text-right">Reply rate</TableHead>
          <TableHead className="text-right">Meeting rate</TableHead>
          <TableHead className="text-right">Win rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium">{r.key}</TableCell>
            <TableCell className="text-right tabular-nums">{r.contacted}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(r.replied, r.contacted)}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(r.meetings, r.contacted)}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(r.won, r.contacted)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function AnalyticsPage() {
  // Contacted leads with their grouping attributes (small data; JS aggregation).
  const contactedLeads = await prisma.lead.findMany({
    where: { events: { some: { status: "SENT" } } },
    include: {
      business: {
        select: {
          score: { select: { tier: true } },
          category: { select: { name: true } },
          audit: { select: { websiteClass: true } },
        },
      },
    },
  });

  function bucket(keyOf: (l: (typeof contactedLeads)[number]) => string): Row[] {
    const map = new Map<string, Row>();
    for (const l of contactedLeads) {
      const key = keyOf(l);
      const row = map.get(key) ?? { key, contacted: 0, replied: 0, meetings: 0, won: 0 };
      row.contacted += 1;
      if (REPLIED.includes(l.status)) row.replied += 1;
      if (MEETING.includes(l.status)) row.meetings += 1;
      if (l.status === "WON") row.won += 1;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.contacted - a.contacted);
  }

  const byTier = bucket((l) => `Tier ${l.business.score?.tier ?? "â€”"}`);
  const byCategory = bucket((l) => l.business.category.name);
  const byWebsiteClass = bucket((l) => (l.business.audit?.websiteClass ?? "â€”").replace(/_/g, " "));

  // Reply rate per template variant: replies among sends of that variant.
  const [variantEvents, templates] = await Promise.all([
    prisma.outreachEvent.findMany({
      where: { status: { in: ["SENT", "REPLIED"] }, channel: "EMAIL" },
      select: { status: true, templateId: true },
    }),
    prisma.template.findMany({ select: { id: true, variant: true } }),
  ]);
  const variantById = new Map(templates.map((t) => [t.id, t.variant]));
  const variantMap = new Map<string, { sent: number; replies: number }>();
  for (const e of variantEvents) {
    const key = (e.templateId ? variantById.get(e.templateId) : null) ?? "(no variant)";
    const row = variantMap.get(key) ?? { sent: 0, replies: 0 };
    if (e.status === "SENT") row.sent += 1;
    if (e.status === "REPLIED") row.replies += 1;
    variantMap.set(key, row);
  }

  const [used, settings] = await Promise.all([
    monthlyUsage(SKU_TEXT_SEARCH_ENTERPRISE),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);
  const cap = settings?.placesMonthlyRequestCap ?? 1000;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Reply, meeting, and win rates â€” calibrate scoring weights against real outcomes."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
          <Badge variant="outline">Places API this month</Badge>
          <span className="tabular-nums">
            {used} / {cap} billed requests
          </span>
          <span className="text-muted-foreground">
            {used <= 1000
              ? "free tier"
              : `est. $${estimatedSpend(used).toFixed(2)} (${used - 1000} beyond free)`}
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By tier</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <RatesTable rows={byTier} label="Tier" emptyLabel="No contacted leads yet." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By website class</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <RatesTable rows={byWebsiteClass} label="Website class" emptyLabel="No contacted leads yet." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By category</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <RatesTable rows={byCategory} label="Category" emptyLabel="No contacted leads yet." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By template variant</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {variantMap.size === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sends yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Sends</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Reply rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...variantMap.entries()].map(([variant, r]) => (
                    <TableRow key={variant}>
                      <TableCell className="font-medium">{variant}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.sent}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.replies}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(r.replies, r.sent)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
