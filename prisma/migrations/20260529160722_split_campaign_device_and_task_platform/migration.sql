/*
  Warnings:

  - The `requiredPlatform` column on the `Campaign` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "requiredPlatform",
ADD COLUMN     "requiredPlatform" "CampaignDevice" NOT NULL DEFAULT 'NONE';
