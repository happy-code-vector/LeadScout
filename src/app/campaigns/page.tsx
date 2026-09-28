import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { PageHeader } from "@/components/page-header";
import { CampaignsClient, type CampaignRow } from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sequence: { select: { name: true } },
      mailbox: { select: { label: true } },
      _count: { select: { campaignLeads: true } },
    },
  });

  const stats = await prisma.outreachEvent.groupBy({
    by: ["campaignId", "status"],
    _count: { status: true },
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
  });
  const statMap = new Map<string, Record<string, number>>();
  for (const s of stats) {
    const entry = statMap.get(s.campaignId) ?? {};
    entry[s.status] = s._count.status;
    statMap.set(s.campaignId, entry);
  }

  const [sequences, mailboxes, categories, areas, settings] = await Promise.all([
    prisma.sequence.findMany({ include: { steps: { orderBy: { order: "asc" } } } }),
    prisma.mailbox.findMany({ select: { id: true, label: true } }),
    prisma.category.findMany({ where: { active: true }, select: { slug: true, name: true } }),
    prisma.area.findMany({ select: { name: true } }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);

  const rows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    mode: c.mode,
    channelOrder: fromJsonArray(c.channelOrder),
    filters: JSON.parse(c.filters || "{}"),
    sequenceId: c.sequenceId,
    sequenceName: c.sequence?.name ?? null,
    mailboxId: c.mailboxId,
    mailboxLabel: c.mailbox?.label ?? null,
    dailyLimit: c.dailyLimit,
    sendWindow: JSON.parse(c.sendWindow),
    status: c.status,
    addedLeads: c._count.campaignLeads,
    stats: statMap.get(c.id) ?? {},
  }));

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Manual exports and automatic sequences over email, post, and phone tasks."
      />
      <CampaignsClient
        campaigns={rows}
        sequences={sequences.map((s) => ({
          id: s.id,
          name: s.name,
          steps: s.steps.map((st) => ({ order: st.order, channel: st.channel, delayDays: st.delayDays })),
        }))}
        mailboxes={mailboxes}
        categories={categories}
        areas={areas.map((a) => a.name)}
        senderReady={Boolean(settings?.senderName && settings?.senderPostalAddress)}
      />
    </>
  );
}
