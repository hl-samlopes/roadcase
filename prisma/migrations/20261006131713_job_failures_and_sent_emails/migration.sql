-- CreateTable
CREATE TABLE "JobFailure" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "queue" TEXT NOT NULL,
    "jobId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "willRetry" BOOLEAN NOT NULL,
    "error" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentEmail" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobFailure_organizationId_createdAt_idx" ON "JobFailure"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SentEmail_idempotencyKey_key" ON "SentEmail"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SentEmail_organizationId_sentAt_idx" ON "SentEmail"("organizationId", "sentAt");

-- AddForeignKey
ALTER TABLE "JobFailure" ADD CONSTRAINT "JobFailure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentEmail" ADD CONSTRAINT "SentEmail_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
