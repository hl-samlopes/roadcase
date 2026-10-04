-- CreateTable
CREATE TABLE "SignInThrottle" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "lockedUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SignInThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SignInThrottle_updatedAt_idx" ON "SignInThrottle"("updatedAt");
