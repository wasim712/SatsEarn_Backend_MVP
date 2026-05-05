-- CreateEnum
CREATE TYPE "CampaignDevice" AS ENUM ('NONE', 'DESKTOP', 'ANDROID', 'IOS');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "requiredPlatform" "CampaignDevice" NOT NULL DEFAULT 'NONE';
