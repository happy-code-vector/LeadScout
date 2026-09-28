import Link from "next/link";
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const TIERS = ["A", "B", "C", "D"] as const;
const FUNNEL = ["NEW", "QUEUED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "WON"] as const;

export default async function DashboardPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [scores, leadStatuses, businesses, callTasksDue, repliesToday, topLeads] =
    await Promise.all([
      prisma.score.groupBy({ by: ["tier"], _count: { tier: true } }),
      prisma.lead.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.business.count(),
      prisma.callTask.count({ where: { dueAt: { lt: new Date() }, completedAt: null } }),
      prisma.outreachEvent.count({ where: { status: "REPLIED", occurredAt: { gte: startOfDay } } }),
      prisma.business.findMany({
        where: { isChain: false, score: { tier: { not: "D" } } },
        orderBy: [{ score: { total: "desc" } }, { name: "asc" }],
        take: 8,
        include: { category: true, score: true, lead: true },
      }),
    ]);

  const tierCounts = new Map(scores.map((s) => [s.tier, s._count.tier]));
  const scored = [...tierCounts.values()].reduce((a, b) => a + b, 0);
  const statusCounts = new Map(leadStatuses.map((s) => [s.status, s._count.status]));
  const maxTier = Math.max(1, ...TIERS.map((t) => tierCounts.get(t) ?? 0));

  const sentToday = await prisma.outreachEvent.count({
    where: { status: "SENT", occurredAt: { gte: startOfDay } },
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Leads by tier, sends, call tasks, replies, and pipeline."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold tabular-nums">{businesses}</div>
            <p className="text-xs text-muted-foreground">businesses discovered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold tabular-nums">
              {sentToday}
              <span className="text-sm text-muted-foreground"> / limit</span>
            </div>
            <p className="text-xs text-muted-foreground">emails sent today (limits land in phase 5)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold tabular-nums">{callTasksDue}</div>
            <p className="text-xs text-muted-foreground">call tasks due</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold tabular-nums text-primary">{repliesToday}</div>
            <p className="text-xs text-muted-foreground">new replies today</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads by tier ({scored} scored)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {TIERS.map((tier) => {
              const count = tierCounts.get(tier) ?? 0;
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold">
                    {tier}
                  </span>
                  <div className="h-2.5 flex-1 rounded-full bg-muted">
                    <div
                      className="h-2.5 rounded-full bg-primary"
                      style={{ width: `${(count / maxTier) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm tabular-nums">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {FUNNEL.map((status) => {
              const count = statusCounts.get(status) ?? 0;
              const total = Math.max(1, [...statusCounts.values()].reduce((a, b) => a + b, 0));
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {status.replace(/_/g, " ")}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary/70"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm tabular-nums">{count}</span>
                </div>
              );
            })}
            {(statusCounts.get("LOST") ?? 0) + (statusCounts.get("DO_NOT_CONTACT") ?? 0) > 0 && (
              <p className="pt-1 text-xs text-muted-foreground">
                {statusCounts.get("LOST") ?? 0} lost · {statusCounts.get("DO_NOT_CONTACT") ?? 0} do-not-contact
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Top leads</CardTitle>
          <Link href="/leads" className="text-sm text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </CardHeader>
        <CardContent className="py-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Reasons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No leads yet — run discovery first.
                  </TableCell>
                </TableRow>
              ) : (
                topLeads.map((b) => {
                  const score = b.score;
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link href={`/leads/${b.id}`} className="font-medium hover:underline">
                          {b.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.category.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {score ? (
                          <>
                            <Badge className="mr-1.5">{score.tier}</Badge>
                            <span className="tabular-nums">{score.total}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-72 truncate text-sm text-muted-foreground">
                        {score ? fromJsonArray(score.reasons).slice(0, 2).join(" · ") : ""}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
