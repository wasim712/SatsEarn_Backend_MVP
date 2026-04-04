/*
  Warnings:

  - Made the column `lightningInvoice` on table `Withdrawal` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TASK_REWARD', 'REFERRAL_BONUS', 'WITHDRAWAL', 'WELCOME_BONUS', 'PENALTY');

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "referralBonusPercent" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "requirements" JSONB;

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "paymentProof" TEXT,
ALTER COLUMN "lightningInvoice" SET NOT NULL;

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountSats" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ledger_userId_type_idx" ON "Ledger"("userId", "type");

-- CreateIndex
CREATE INDEX "Campaign_isActive_requiredTier_idx" ON "Campaign"("isActive", "requiredTier");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE INDEX "Submission_imageHash_idx" ON "Submission"("imageHash");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
