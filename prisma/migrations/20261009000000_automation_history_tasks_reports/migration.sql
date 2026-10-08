-- AlterEnum
ALTER TYPE "ExecutionStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "ExecutionStatus" ADD VALUE 'WAITING_APPROVAL';

-- AlterTable
ALTER TABLE "automation_executions" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "currentStep" TEXT,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorStep" TEXT;

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "manualMinutesSaved" INTEGER;

-- CreateTable
CREATE TABLE "automation_tasks" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'APPROVAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ruleId" INTEGER,
    "executionId" TEXT,
    "stepRef" TEXT,
    "module" TEXT,
    "recordType" TEXT,
    "recordId" TEXT,
    "approverId" INTEGER NOT NULL,
    "substituteId" INTEGER,
    "escalateToId" INTEGER,
    "escalateAfterHours" INTEGER,
    "escalatedAt" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedBy" INTEGER,
    "decisionComment" TEXT,
    "historyJson" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_tasks_approverId_status_idx" ON "automation_tasks"("approverId", "status");

-- CreateIndex
CREATE INDEX "automation_tasks_status_dueAt_idx" ON "automation_tasks"("status", "dueAt");

-- CreateIndex
CREATE INDEX "automation_tasks_executionId_idx" ON "automation_tasks"("executionId");

-- CreateIndex
CREATE INDEX "automation_tasks_ruleId_idx" ON "automation_tasks"("ruleId");
