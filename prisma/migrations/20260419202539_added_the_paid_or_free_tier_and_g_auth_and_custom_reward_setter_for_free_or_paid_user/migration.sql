/*
  Warnings:

  - You are about to drop the column `requiredTier` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `rewardSats` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `rewardSatsOverride` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `level` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `tier` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `xp` on the `User` table. All the data in the column will be lost.
  - Added the required column `baseRewardSats` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tierRewardMatrix` to the `Campaign` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FreeTier" AS ENUM ('BASIC', 'COPPER', 'BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "PremiumTier" AS ENUM ('PLATINUM', 'DIAMOND', 'CROWN', 'ELITE', 'FOUNDER');

-- DropIndex
DROP INDEX "Campaign_isActive_requiredTier_idx";

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "requiredTier",
DROP COLUMN "rewardSats",
ADD COLUMN     "baseRewardSats" INTEGER NOT NULL,
ADD COLUMN     "isPremiumOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiredFreeTier" "FreeTier" NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "tierRewardMatrix" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "rewardSatsOverride",
ADD COLUMN     "baseRewardSatsOverride" INTEGER,
ADD COLUMN     "tierRewardMatrixOverride" JSONB;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "level",
DROP COLUMN "tier",
DROP COLUMN "xp",
ADD COLUMN     "authProvider" TEXT NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "premiumExpiresAt" TIMESTAMP(3),
ADD COLUMN     "premiumTier" "PremiumTier",
ADD COLUMN     "totalXp" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "username" DROP NOT NULL;

-- DropEnum
DROP TYPE "Tier";

-- CreateIndex
CREATE INDEX "Campaign_isActive_isPremiumOnly_requiredFreeTier_idx" ON "Campaign"("isActive", "isPremiumOnly", "requiredFreeTier");
