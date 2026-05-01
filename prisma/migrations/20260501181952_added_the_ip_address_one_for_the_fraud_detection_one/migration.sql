-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "ipAddress" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastIpAddress" TEXT,
ADD COLUMN     "registrationIp" TEXT;
