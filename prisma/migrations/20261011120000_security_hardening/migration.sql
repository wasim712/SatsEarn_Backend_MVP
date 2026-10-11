-- Security hardening (see SECURITY_FIX_PLAN.md)

-- H-1: purpose-bound OTPs with a wrong-guess counter
ALTER TABLE "User" ADD COLUMN "otpPurpose" TEXT;
ALTER TABLE "User" ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0;

-- M-5: session revocation on password change/reset
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- C-1: one-time daily quiz payout marker
ALTER TABLE "QuizAttempt" ADD COLUMN "rewardedAt" TIMESTAMP(3);

-- Every attempt already marked passed has been paid at least once; lock it.
UPDATE "QuizAttempt" SET "rewardedAt" = "createdAt" WHERE "passed" = true;
