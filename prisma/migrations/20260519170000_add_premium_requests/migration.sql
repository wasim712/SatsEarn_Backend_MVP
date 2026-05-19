CREATE TYPE "PremiumRequestIntent" AS ENUM ('NOTIFY_ME', 'UPGRADE');
CREATE TYPE "PremiumRequestStatus" AS ENUM ('OPEN', 'CONTACTED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "PremiumRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "plan" "PremiumTier" NOT NULL,
  "intent" "PremiumRequestIntent" NOT NULL,
  "status" "PremiumRequestStatus" NOT NULL DEFAULT 'OPEN',
  "source" TEXT,
  "userEmail" TEXT NOT NULL,
  "userFullName" TEXT,
  "userActiveTier" TEXT NOT NULL,
  "adminNotes" TEXT,
  "contactedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PremiumRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PremiumRequest_status_createdAt_idx" ON "PremiumRequest"("status", "createdAt");
CREATE UNIQUE INDEX "PremiumRequest_userId_plan_intent_status_key" ON "PremiumRequest"("userId", "plan", "intent", "status");

ALTER TABLE "PremiumRequest" ADD CONSTRAINT "PremiumRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
