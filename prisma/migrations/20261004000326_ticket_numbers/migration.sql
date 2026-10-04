-- Per-organization ticket numbers (#1, #2, ...).

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "ticketSequence" INTEGER NOT NULL DEFAULT 0;

-- Number any existing tickets in creation order, then continue each
-- organization's sequence after them.
ALTER TABLE "ServiceTicket" ADD COLUMN "number" INTEGER;

UPDATE "ServiceTicket" t
SET "number" = numbered.n
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", "id") AS n
  FROM "ServiceTicket"
) AS numbered
WHERE numbered."id" = t."id";

UPDATE "Organization" o
SET "ticketSequence" = counts.max_number
FROM (
  SELECT "organizationId", MAX("number") AS max_number FROM "ServiceTicket" GROUP BY "organizationId"
) AS counts
WHERE counts."organizationId" = o."id";

ALTER TABLE "ServiceTicket" ALTER COLUMN "number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_organizationId_number_key" ON "ServiceTicket"("organizationId", "number");
