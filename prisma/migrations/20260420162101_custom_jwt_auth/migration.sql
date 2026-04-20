/*
  Warnings:

  - You are about to drop the column `supabaseAuthId` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_supabaseAuthId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "supabaseAuthId",
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;
