-- CreateEnum
CREATE TYPE "BandSetupStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "emailBandSent" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BandPosition" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "inputs" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BandPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandSetup" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "guestGroupId" UUID NOT NULL,
    "status" "BandSetupStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedChannels" INTEGER,
    "inEarMonitors" BOOLEAN NOT NULL DEFAULT false,
    "clickTrack" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BandSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandMember" (
    "id" UUID NOT NULL,
    "setupId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT,

    CONSTRAINT "BandMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputList" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "guestGroupId" UUID NOT NULL,
    "channels" JSONB NOT NULL,
    "basedOnSubmittedAt" TIMESTAMPTZ(3),
    "editedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedById" UUID,
    "sharedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "pdfKey" TEXT,
    "pdfVersion" INTEGER,

    CONSTRAINT "InputList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BandPosition_campusId_name_key" ON "BandPosition"("campusId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BandSetup_guestGroupId_key" ON "BandSetup"("guestGroupId");

-- CreateIndex
CREATE INDEX "BandMember_setupId_idx" ON "BandMember"("setupId");

-- CreateIndex
CREATE UNIQUE INDEX "InputList_guestGroupId_key" ON "InputList"("guestGroupId");

-- AddForeignKey
ALTER TABLE "BandPosition" ADD CONSTRAINT "BandPosition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandPosition" ADD CONSTRAINT "BandPosition_campusId_organizationId_fkey" FOREIGN KEY ("campusId", "organizationId") REFERENCES "Campus"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandSetup" ADD CONSTRAINT "BandSetup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandSetup" ADD CONSTRAINT "BandSetup_guestGroupId_fkey" FOREIGN KEY ("guestGroupId") REFERENCES "GuestGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandMember" ADD CONSTRAINT "BandMember_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "BandSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandMember" ADD CONSTRAINT "BandMember_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "BandPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputList" ADD CONSTRAINT "InputList_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputList" ADD CONSTRAINT "InputList_guestGroupId_fkey" FOREIGN KEY ("guestGroupId") REFERENCES "GuestGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputList" ADD CONSTRAINT "InputList_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Channel counts are positive.
ALTER TABLE "BandSetup" ADD CONSTRAINT "BandSetup_expectedChannels_check"
  CHECK ("expectedChannels" IS NULL OR "expectedChannels" > 0);
