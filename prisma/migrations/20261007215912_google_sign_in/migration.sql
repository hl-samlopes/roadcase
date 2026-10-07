-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "adminPasswordSignIn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "googleAllowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "passwordSignIn" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleEmail" TEXT,
ADD COLUMN     "googleLastSignInAt" TIMESTAMPTZ(3),
ADD COLUMN     "googleSubject" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_googleSubject_key" ON "User"("organizationId", "googleSubject");

