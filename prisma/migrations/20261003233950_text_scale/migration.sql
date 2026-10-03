-- AlterTable
ALTER TABLE "OrganizationBranding" ADD COLUMN     "textScale" INTEGER;

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "textScale" INTEGER;

-- Text size is a percentage between 100 and 200.
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_textScale_check" CHECK ("textScale" IS NULL OR "textScale" BETWEEN 100 AND 200);
ALTER TABLE "OrganizationBranding" ADD CONSTRAINT "OrganizationBranding_textScale_check" CHECK ("textScale" IS NULL OR "textScale" BETWEEN 100 AND 200);
