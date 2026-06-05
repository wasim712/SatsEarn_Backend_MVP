-- AlterTable
ALTER TABLE "QuizAttempt"
ADD COLUMN     "rewardSats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakBonusSats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unlockAt" TIMESTAMP(3),
ADD COLUMN     "rewardUnlockedAt" TIMESTAMP(3);
