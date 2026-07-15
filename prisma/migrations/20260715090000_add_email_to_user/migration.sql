-- Add nullable email column and unique index
ALTER TABLE "User" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User" ("email");

-- Add emailVerified boolean with default false
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE;
