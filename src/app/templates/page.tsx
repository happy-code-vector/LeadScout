import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { TemplatesClient } from "./templates-client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [templates, leads, stepCounts] = await Promise.all([
    prisma.template.findMany({ orderBy: [{ channel: "asc" }, { name: "asc" }] }),
    prisma.business.findMany({
      where: { audit: { websiteClass: { in: ["NONE", "OUTDATED"] } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 50,
    }),
    prisma.sequenceStep.groupBy({ by: ["templateId"], _count: { templateId: true } }),
  ]);
  const usage = new Map(stepCounts.map((s) => [s.templateId, s._count.templateId]));

  return (
    <>
      <PageHeader
        title="Templates"
        description="Email, postcard, and call script templates with live preview."
      />
      <TemplatesClient
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          channel: t.channel,
          subject: t.subject,
          body: t.body,
          variant: t.variant,
          inSequence: usage.get(t.id) ?? 0,
        }))}
        previewLeads={leads}
      />
    </>
  );
}
