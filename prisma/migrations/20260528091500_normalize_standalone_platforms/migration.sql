UPDATE "StandaloneTask"
SET "requiredPlatform" = 'NONE'
WHERE UPPER(COALESCE("requiredPlatform", 'NONE')) NOT IN ('NONE', 'DESKTOP', 'ANDROID', 'IOS');
