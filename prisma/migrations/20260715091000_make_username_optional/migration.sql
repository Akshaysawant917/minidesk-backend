-- Make username optional on existing User records.
ALTER TABLE "User" ALTER COLUMN "username" DROP NOT NULL;
