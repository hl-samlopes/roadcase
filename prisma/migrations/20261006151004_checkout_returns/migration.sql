-- AlterTable
ALTER TABLE "Checkout" ADD COLUMN     "returnedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "CheckoutLine" ADD COLUMN     "returnedById" UUID;

-- AlterTable
ALTER TABLE "ServiceTicket" ADD COLUMN     "checkoutId" UUID;

-- CreateIndex
CREATE INDEX "ServiceTicket_checkoutId_idx" ON "ServiceTicket"("checkoutId");

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutLine" ADD CONSTRAINT "CheckoutLine_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
