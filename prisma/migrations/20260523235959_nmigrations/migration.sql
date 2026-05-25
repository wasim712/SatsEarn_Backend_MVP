CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "BillingSource" AS ENUM ('MANUAL_PAYMENT', 'SATS_BALANCE', 'ADMIN_OVERRIDE');

ALTER TABLE "PlatformSettings"
ADD COLUMN IF NOT EXISTS "premiumMonthlySatsMatrix" JSONB,
ADD COLUMN IF NOT EXISTS "premiumYearlySatsMatrix" JSONB;

CREATE TABLE IF NOT EXISTS "BillingRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "premiumTier" "PremiumTier" NOT NULL,
  "billingCycle" "BillingCycle" NOT NULL,
  "billingSource" "BillingSource" NOT NULL,
  "amountUsd" DOUBLE PRECISION,
  "amountSats" INTEGER,
  "adminNotes" TEXT,
  "premiumExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BillingRecord_userId_createdAt_idx" ON "BillingRecord"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'BillingRecord_userId_fkey'
      AND table_name = 'BillingRecord'
  ) THEN
    ALTER TABLE "BillingRecord"
    ADD CONSTRAINT "BillingRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
