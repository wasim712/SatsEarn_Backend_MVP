CREATE TABLE IF NOT EXISTS "StandaloneTask" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "targetUrl" TEXT,
  "proofType" "ProofType" NOT NULL DEFAULT 'SCREENSHOT',
  "requiredPlatform" TEXT NOT NULL DEFAULT 'NONE',
  "xpReward" INTEGER NOT NULL DEFAULT 0,
  "tierRewardMatrix" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandaloneTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StandaloneSubmission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "standaloneTaskId" TEXT NOT NULL,
  "ipAddress" TEXT,
  "screenshotUrl" TEXT,
  "proofText" TEXT,
  "imageHash" TEXT,
  "ocrExtractedText" TEXT,
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING_24H',
  "rejectionReason" TEXT,
  "reviewedById" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reverifyAt" TIMESTAMP(3),
  "unlockAt" TIMESTAMP(3),
  CONSTRAINT "StandaloneSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StandaloneTask_isActive_createdAt_idx" ON "StandaloneTask"("isActive", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "StandaloneSubmission_userId_standaloneTaskId_key" ON "StandaloneSubmission"("userId", "standaloneTaskId");
CREATE INDEX IF NOT EXISTS "StandaloneSubmission_status_idx" ON "StandaloneSubmission"("status");
CREATE INDEX IF NOT EXISTS "StandaloneSubmission_imageHash_idx" ON "StandaloneSubmission"("imageHash");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'StandaloneSubmission_userId_fkey'
      AND table_name = 'StandaloneSubmission'
  ) THEN
    ALTER TABLE "StandaloneSubmission"
    ADD CONSTRAINT "StandaloneSubmission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'StandaloneSubmission_standaloneTaskId_fkey'
      AND table_name = 'StandaloneSubmission'
  ) THEN
    ALTER TABLE "StandaloneSubmission"
    ADD CONSTRAINT "StandaloneSubmission_standaloneTaskId_fkey"
    FOREIGN KEY ("standaloneTaskId") REFERENCES "StandaloneTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
