/*
  Warnings:

  - The `requiredPlatform` column on the `StandaloneTask` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropIndex
DROP INDEX "Submission_status_unlockAt_idx";

-- AlterTable
ALTER TABLE "Ledger" ADD COLUMN     "amountMsats" INTEGER;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "answers" JSONB;

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "explanation" TEXT;

-- AlterTable
ALTER TABLE "StandaloneTask" DROP COLUMN "requiredPlatform",
ADD COLUMN     "requiredPlatform" "CampaignDevice" NOT NULL DEFAULT 'NONE',
ALTER COLUMN "targetCountries" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "queuedPremiumExpiresAt" TIMESTAMP(3),
ADD COLUMN     "queuedPremiumStartsAt" TIMESTAMP(3),
ADD COLUMN     "queuedPremiumTier" "PremiumTier",
ADD COLUMN     "referralPendingMsats" INTEGER NOT NULL DEFAULT 0;
