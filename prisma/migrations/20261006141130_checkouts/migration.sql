-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('DRAFT', 'AWAITING_SIGNATURES', 'OUT', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ItemCondition" ADD COLUMN     "availableForCheckout" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "checkoutSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Checkout" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'DRAFT',
    "groupName" TEXT NOT NULL,
    "guestRepName" TEXT NOT NULL,
    "guestRepEmail" TEXT NOT NULL,
    "guestRepPhone" TEXT NOT NULL,
    "staffRepId" UUID,
    "dateOut" DATE NOT NULL,
    "dateDue" DATE NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutLine" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "fee" DECIMAL(12,2),
    "holdsItem" BOOLEAN NOT NULL DEFAULT true,
    "returnedAt" TIMESTAMPTZ(3),
    "returnConditionId" UUID,
    "returnNotes" TEXT,
    "addedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CheckoutLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkout_campusId_status_idx" ON "Checkout"("campusId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_organizationId_number_key" ON "Checkout"("organizationId", "number");

-- CreateIndex
CREATE INDEX "CheckoutLine_itemId_idx" ON "CheckoutLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutLine_checkoutId_itemId_key" ON "CheckoutLine"("checkoutId", "itemId");

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_campusId_organizationId_fkey" FOREIGN KEY ("campusId", "organizationId") REFERENCES "Campus"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_staffRepId_fkey" FOREIGN KEY ("staffRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutLine" ADD CONSTRAINT "CheckoutLine_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutLine" ADD CONSTRAINT "CheckoutLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutLine" ADD CONSTRAINT "CheckoutLine_returnConditionId_fkey" FOREIGN KEY ("returnConditionId") REFERENCES "ItemCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutLine" ADD CONSTRAINT "CheckoutLine_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: an item can be held by one active check-out line at a time.
CREATE UNIQUE INDEX "CheckoutLine_itemId_holds_key" ON "CheckoutLine"("itemId") WHERE "holdsItem";

-- Hand-written: fees are never negative, and items come back on or after they go out.
ALTER TABLE "CheckoutLine" ADD CONSTRAINT "CheckoutLine_fee_check" CHECK ("fee" IS NULL OR "fee" >= 0);
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_dates_check" CHECK ("dateDue" >= "dateOut");

-- Hand-written data migration: the default conditions that can go out on a
-- check-out (Phase 2 plan, "Decisions needed"). Matches the seeded labels once;
-- admins change it per condition in Settings > Item conditions from then on.
UPDATE "ItemCondition" SET "availableForCheckout" = true
WHERE lower("label") IN ('new', 'good', 'fair');
