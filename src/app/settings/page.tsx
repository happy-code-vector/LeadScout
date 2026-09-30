import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { SettingsClient } from "./settings-client";
import { AccountCard } from "./account-card";
import { isPlacesConfigured, isPostalEnabled } from "@/lib/env";
import { hasEncryptionKey } from "@/lib/crypto";
import { DEFAULT_WEIGHTS } from "@/lib/scoring/weights";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const mailboxes = await prisma.mailbox.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, label: true, smtpHost: true, smtpPort: true, imapHost: true, imapPort: true,
      user: true, fromName: true, dailyLimit: true, warmupStartDate: true, active: true,
    },
  });

  let weights = DEFAULT_WEIGHTS;
  try {
    if (settings?.scoringWeights && settings.scoringWeights !== "{}") {
      weights = JSON.parse(settings.scoringWeights);
    }
  } catch {
    // keep defaults
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Sender identity, mailboxes, scoring weights, and API limits."
      />
      <SettingsClient
        senderName={settings?.senderName ?? ""}
        senderPostalAddress={settings?.senderPostalAddress ?? ""}
        placesCap={settings?.placesMonthlyRequestCap ?? 1000}
        auditConcurrency={settings?.auditConcurrency ?? 8}
        weights={weights}
        mailboxes={mailboxes.map((m) => ({
          ...m,
          warmupStartDate: m.warmupStartDate?.toISOString() ?? null,
        }))}
        connections={{
          places: isPlacesConfigured
            ? "live — GOOGLE_PLACES_API_KEY is set"
            : "missing — discovery is disabled until GOOGLE_PLACES_API_KEY is set (never faked)",
          encryptionKey: hasEncryptionKey() ? "ok" : "missing — mailbox passwords cannot be saved",
          smtp: mailboxes.length > 0 ? `${mailboxes.length} mailbox(es) configured` : "none configured",
          lob: isPostalEnabled ? "enabled (LOB_API_KEY set)" : "disabled (no key) — postal channel off",
          imap: "polled every 5 minutes per mailbox",
        }}
      />
      {session?.user?.email ? <AccountCard email={session.user.email} /> : null}
    </>
  );
}
