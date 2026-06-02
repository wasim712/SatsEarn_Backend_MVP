-- AlterTable
ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "isNewUserOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "newUserMaxAccountAgeDays" INTEGER;

-- AlterTable
ALTER TABLE "StandaloneTask"
ADD COLUMN IF NOT EXISTS "isNewUserOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "newUserMaxAccountAgeDays" INTEGER,
DROP COLUMN IF EXISTS "requiredPlatform",
ADD COLUMN IF NOT EXISTS "requiredPlatform" "CampaignDevice" NOT NULL DEFAULT 'NONE';

