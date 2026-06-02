-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "isNewUserOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newUserMaxAccountAgeDays" INTEGER;

-- AlterTable
ALTER TABLE "StandaloneTask" ADD COLUMN     "isNewUserOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newUserMaxAccountAgeDays" INTEGER,
DROP COLUMN "requiredPlatform",
ADD COLUMN     "requiredPlatform" "CampaignDevice" NOT NULL DEFAULT 'NONE';

