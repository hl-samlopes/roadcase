-- Replace the fixed ItemCondition enum with organization-defined conditions,
-- keeping every existing item's condition.

-- The new table's row type would clash with the enum's name, so move the enum aside.
ALTER TYPE "ItemCondition" RENAME TO "ItemCondition_old";

-- CreateTable
CREATE TABLE "ItemCondition" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "startsRepairTicket" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ItemCondition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemCondition_organizationId_label_key" ON "ItemCondition"("organizationId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCondition_id_organizationId_key" ON "ItemCondition"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "ItemCondition" ADD CONSTRAINT "ItemCondition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Give every existing organization the former fixed list.
INSERT INTO "ItemCondition" ("id", "organizationId", "label", "position", "isDefault", "startsRepairTicket", "updatedAt")
SELECT gen_random_uuid(), o."id", d."label", d."position", d."isDefault", d."startsRepairTicket", CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
    ('New', 0, false, false),
    ('Good', 1, true, false),
    ('Fair', 2, false, false),
    ('Poor', 3, false, false),
    ('Needs repair', 4, false, true),
    ('Out of service', 5, false, false),
    ('Retired', 6, false, false)
) AS d("label", "position", "isDefault", "startsRepairTicket");

-- Point items at their organization's matching condition.
ALTER TABLE "Item" ADD COLUMN "conditionId" UUID;

UPDATE "Item" i
SET "conditionId" = c."id"
FROM "ItemCondition" c
WHERE c."organizationId" = i."organizationId"
  AND c."label" = CASE i."condition"
    WHEN 'NEW' THEN 'New'
    WHEN 'GOOD' THEN 'Good'
    WHEN 'FAIR' THEN 'Fair'
    WHEN 'POOR' THEN 'Poor'
    WHEN 'NEEDS_REPAIR' THEN 'Needs repair'
    WHEN 'OUT_OF_SERVICE' THEN 'Out of service'
    WHEN 'RETIRED' THEN 'Retired'
  END;

ALTER TABLE "Item" ALTER COLUMN "conditionId" SET NOT NULL;

-- Remove the old column and enum.
DROP INDEX "Item_condition_idx";
ALTER TABLE "Item" DROP COLUMN "condition";
DROP TYPE "ItemCondition_old";

-- CreateIndex
CREATE INDEX "Item_conditionId_idx" ON "Item"("conditionId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_conditionId_organizationId_fkey" FOREIGN KEY ("conditionId", "organizationId") REFERENCES "ItemCondition"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
