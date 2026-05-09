CREATE TYPE "BugReportStatus" AS ENUM ('OPEN', 'REWARDED', 'REJECTED');

CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "status" "BugReportStatus" NOT NULL DEFAULT 'OPEN',
    "rewardSats" INTEGER NOT NULL DEFAULT 0,
    "adminNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BugReport_userId_status_idx" ON "BugReport"("userId", "status");
CREATE INDEX "BugReport_status_createdAt_idx" ON "BugReport"("status", "createdAt");
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
