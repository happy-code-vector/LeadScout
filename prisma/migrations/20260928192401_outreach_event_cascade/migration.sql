-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OutreachEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "templateId" TEXT,
    "status" TEXT NOT NULL,
    "messageId" TEXT,
    "scheduledFor" DATETIME,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" TEXT,
    CONSTRAINT "OutreachEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutreachEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OutreachEvent" ("campaignId", "channel", "id", "leadId", "messageId", "meta", "occurredAt", "scheduledFor", "status", "templateId") SELECT "campaignId", "channel", "id", "leadId", "messageId", "meta", "occurredAt", "scheduledFor", "status", "templateId" FROM "OutreachEvent";
DROP TABLE "OutreachEvent";
ALTER TABLE "new_OutreachEvent" RENAME TO "OutreachEvent";
CREATE INDEX "OutreachEvent_status_scheduledFor_idx" ON "OutreachEvent"("status", "scheduledFor");
CREATE INDEX "OutreachEvent_campaignId_occurredAt_idx" ON "OutreachEvent"("campaignId", "occurredAt");
CREATE INDEX "OutreachEvent_leadId_occurredAt_idx" ON "OutreachEvent"("leadId", "occurredAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
