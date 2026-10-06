-- AlterTable
ALTER TABLE "EquipmentRequest" ADD COLUMN     "checkoutId" UUID,
ADD COLUMN     "decidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "decidedById" UUID,
ADD COLUMN     "staffMessage" TEXT;

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "emailRequestSent" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentRequest_checkoutId_key" ON "EquipmentRequest"("checkoutId");

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

