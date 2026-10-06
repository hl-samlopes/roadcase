-- AlterTable
ALTER TABLE "Campus" ADD COLUMN     "defaultContactId" UUID;
-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_defaultContactId_fkey" FOREIGN KEY ("defaultContactId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
