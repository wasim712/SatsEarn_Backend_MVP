ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "isNewUserOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "newUserMaxAccountAgeDays" INTEGER;

ALTER TABLE "StandaloneTask"
  ADD COLUMN IF NOT EXISTS "isNewUserOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "newUserMaxAccountAgeDays" INTEGER;

ALTER TABLE "StandaloneTask"
  DROP COLUMN IF EXISTS "requiredPlatform";

ALTER TABLE "StandaloneTask"
  ADD COLUMN IF NOT EXISTS "requiredPlatform" "CampaignDevice" NOT NULL DEFAULT 'NONE';