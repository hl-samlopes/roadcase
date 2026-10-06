-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "emailTicketAssigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailTicketComment" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailTicketCompleted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailTicketOpened" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SlackWebhook" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campusId" UUID,
    "departmentId" UUID,
    "label" TEXT NOT NULL,
    "encryptedUrl" TEXT NOT NULL,
    "urlHint" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SlackWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlackWebhook_organizationId_idx" ON "SlackWebhook"("organizationId");

-- AddForeignKey
ALTER TABLE "SlackWebhook" ADD CONSTRAINT "SlackWebhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackWebhook" ADD CONSTRAINT "SlackWebhook_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackWebhook" ADD CONSTRAINT "SlackWebhook_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackWebhook" ADD CONSTRAINT "SlackWebhook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: a webhook covers exactly one campus or one department.
ALTER TABLE "SlackWebhook" ADD CONSTRAINT "SlackWebhook_one_scope_check"
  CHECK (num_nonnulls("campusId", "departmentId") = 1);

-- Hand-written: one webhook per campus and one per department.
CREATE UNIQUE INDEX "SlackWebhook_campusId_key" ON "SlackWebhook"("campusId") WHERE "campusId" IS NOT NULL;
CREATE UNIQUE INDEX "SlackWebhook_departmentId_key" ON "SlackWebhook"("departmentId") WHERE "departmentId" IS NOT NULL;
