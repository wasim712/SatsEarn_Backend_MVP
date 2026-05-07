-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "doubleRewardsEndAt" TIMESTAMP(3),
ADD COLUMN     "doubleRewardsStartAt" TIMESTAMP(3),
ADD COLUMN     "xpReward" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DailyQuiz" ADD COLUMN     "xpReward" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "xpRewardOverride" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastClaimedStreakMilestone" INTEGER NOT NULL DEFAULT 0;
