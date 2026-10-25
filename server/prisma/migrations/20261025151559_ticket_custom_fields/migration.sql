-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "assigneeId" TEXT,
    "slaDueAt" DATETIME NOT NULL,
    "firstResponseAt" DATETIME,
    "resolvedAt" DATETIME,
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Ticket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("assigneeId", "channel", "companyId", "contactId", "createdAt", "deletedAt", "description", "firstResponseAt", "id", "number", "orgId", "priority", "resolvedAt", "slaDueAt", "status", "subject", "updatedAt") SELECT "assigneeId", "channel", "companyId", "contactId", "createdAt", "deletedAt", "description", "firstResponseAt", "id", "number", "orgId", "priority", "resolvedAt", "slaDueAt", "status", "subject", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE INDEX "Ticket_orgId_deletedAt_status_idx" ON "Ticket"("orgId", "deletedAt", "status");
CREATE UNIQUE INDEX "Ticket_orgId_number_key" ON "Ticket"("orgId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
