-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Mailbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "user" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "fromName" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 40,
    "warmupStartDate" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imapLastUid" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Mailbox" ("active", "createdAt", "dailyLimit", "fromName", "id", "imapHost", "imapPort", "label", "passwordEncrypted", "smtpHost", "smtpPort", "user", "warmupStartDate") SELECT "active", "createdAt", "dailyLimit", "fromName", "id", "imapHost", "imapPort", "label", "passwordEncrypted", "smtpHost", "smtpPort", "user", "warmupStartDate" FROM "Mailbox";
DROP TABLE "Mailbox";
ALTER TABLE "new_Mailbox" RENAME TO "Mailbox";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
