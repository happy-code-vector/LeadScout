import Link from "next/link";
import { Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CallTaskClient } from "./call-task-client";

export const dynamic = "force-dynamic";

export default async function CallQueuePage() {
  const tasks = await prisma.callTask.findMany({
    where: { completedAt: null, dueAt: { lte: endOfToday() } },
    orderBy: { dueAt: "asc" },
    include: {
      lead: {
        include: {
          business: {
            include: { contacts: { where: { type: "PHONE" } }, category: true, score: true },
          },
        },
      },
    },
  });

  const doneToday = await prisma.callTask.findMany({
    where: { completedAt: { gte: startOfToday() } },
    orderBy: { completedAt: "desc" },
    include: { lead: { include: { business: true } } },
    take: 20,
  });

  return (
    <>
      <PageHeader
        title="Call Queue"
        description="You dial — nothing is auto-dialed or prerecorded (TCPA). Log the outcome when done."
      />
      <div className="space-y-4">
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No calls due today. Campaigns create call tasks for businesses with no email.
            </CardContent>
          </Card>
        ) : (
          tasks.map((t) => {
            const b = t.lead.business;
            const phone = b.contacts[0]?.value ?? b.phone ?? "";
            return (
              <Card key={t.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link href={`/leads/${b.id}`} className="font-medium hover:underline">
                        {b.name}
                      </Link>
                      <span className="ml-2 text-sm text-muted-foreground">{b.category.name}</span>
                      {b.score && (
                        <Badge className="ml-2" variant="outline">
                          {b.score.tier} · {b.score.total}
                        </Badge>
                      )}
                    </div>
                    {phone && (
                      <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
                        <Badge variant="secondary" className="gap-1 py-1 text-sm">
                          <Phone className="size-3.5" />
                          {phone}
                        </Badge>
                      </a>
                    )}
                  </div>
                  {t.script && (
                    <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 font-sans text-sm">
                      {t.script}
                    </pre>
                  )}
                  <CallTaskClient taskId={t.id} />
                </CardContent>
              </Card>
            );
          })
        )}

        {doneToday.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Completed today</h2>
            <div className="space-y-1">
              {doneToday.map((t) => (
                <p key={t.id} className="text-sm text-muted-foreground">
                  <Badge variant="outline" className="mr-2 text-xs">
                    {t.outcome?.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                  {t.lead.business.name}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
