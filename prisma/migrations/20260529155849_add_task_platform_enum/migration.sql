/*
  Warnings:

  - The `requiredPlatform` column on the `Campaign` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `requiredPlatform` column on the `StandaloneTask` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "TaskPlatform" AS ENUM ('TWITTER', 'YOUTUBE', 'INSTAGRAM', 'TELEGRAM', 'FACEBOOK', 'LINKEDIN', 'APP_STORE', 'PLAY_STORE', 'WEBSITE');

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "requiredPlatform",
ADD COLUMN     "requiredPlatform" "TaskPlatform";

-- AlterTable
ALTER TABLE "StandaloneTask" DROP COLUMN "requiredPlatform",
ADD COLUMN     "requiredPlatform" "TaskPlatform" NOT NULL DEFAULT 'WEBSITE';
