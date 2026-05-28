ALTER TABLE "PlatformSettings"
ADD COLUMN IF NOT EXISTS "userSidebarConfig" JSONB;
