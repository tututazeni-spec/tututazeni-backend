-- AlterTable
ALTER TABLE "automation_executions" ADD COLUMN     "payload" TEXT;

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "actionParams" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "maxRetries" INTEGER;
