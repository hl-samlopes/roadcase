-- CreateEnum
CREATE TYPE "EquipmentRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'PARTLY_APPROVED', 'DECLINED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "portalDescription" TEXT,
ADD COLUMN     "showInPortal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EquipmentRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "guestGroupId" UUID NOT NULL,
    "status" "EquipmentRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EquipmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRequestLine" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "kindKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantityRequested" INTEGER NOT NULL,
    "quantityApproved" INTEGER,
    "staffNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EquipmentRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentRequest_guestGroupId_key" ON "EquipmentRequest"("guestGroupId");

-- CreateIndex
CREATE INDEX "EquipmentRequest_campusId_status_idx" ON "EquipmentRequest"("campusId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentRequestLine_requestId_categoryId_kindKey_key" ON "EquipmentRequestLine"("requestId", "categoryId", "kindKey");

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_guestGroupId_fkey" FOREIGN KEY ("guestGroupId") REFERENCES "GuestGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequestLine" ADD CONSTRAINT "EquipmentRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EquipmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequestLine" ADD CONSTRAINT "EquipmentRequestLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quantities are whole items: at least one requested, never a negative approval.
ALTER TABLE "EquipmentRequestLine" ADD CONSTRAINT "EquipmentRequestLine_quantities_check"
  CHECK ("quantityRequested" > 0 AND ("quantityApproved" IS NULL OR "quantityApproved" >= 0));
