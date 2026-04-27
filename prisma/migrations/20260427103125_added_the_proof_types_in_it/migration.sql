-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('SCREENSHOT', 'URL', 'TEXT_RESPONSE', 'API_VERIFIED');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "proofText" TEXT,
ALTER COLUMN "screenshotUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "proofType" "ProofType" NOT NULL DEFAULT 'SCREENSHOT';
