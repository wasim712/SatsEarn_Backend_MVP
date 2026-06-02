ALTER TABLE "User"
ADD COLUMN "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN "hasSkippedOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "onboardingSkippedAt" TIMESTAMP(3);
