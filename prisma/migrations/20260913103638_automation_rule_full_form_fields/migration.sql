-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "entity" TEXT,
ADD COLUMN     "environment" TEXT DEFAULT 'production',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "notifyOnError" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ownerId" TEXT;
