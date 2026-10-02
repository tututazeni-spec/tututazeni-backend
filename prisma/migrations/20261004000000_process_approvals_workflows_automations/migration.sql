-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StepType" ADD VALUE 'FORM';
ALTER TYPE "StepType" ADD VALUE 'PARALLEL';
ALTER TYPE "StepType" ADD VALUE 'WAIT_EVENT';
ALTER TYPE "StepType" ADD VALUE 'TIMER';
ALTER TYPE "StepType" ADD VALUE 'INTEGRATION';
ALTER TYPE "StepType" ADD VALUE 'AUTO_ACTION';
ALTER TYPE "StepType" ADD VALUE 'NOTIFICATION';
ALTER TYPE "StepType" ADD VALUE 'DOCUMENT';

-- AlterTable
ALTER TABLE "ProcessStep" ADD COLUMN     "allowDelegation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "approvalMode" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
ADD COLUMN     "approverIds" INTEGER[],
ADD COLUMN     "calendarMode" TEXT NOT NULL DEFAULT 'CALENDAR',
ADD COLUMN     "config" TEXT,
ADD COLUMN     "entryConditions" TEXT,
ADD COLUMN     "escalationAfterHours" DOUBLE PRECISION,
ADD COLUMN     "escalationToId" INTEGER,
ADD COLUMN     "escalationToRole" TEXT,
ADD COLUMN     "failureActions" TEXT,
ADD COLUMN     "maxReturns" INTEGER,
ADD COLUMN     "onReject" TEXT NOT NULL DEFAULT 'HOLD',
ADD COLUMN     "posX" DOUBLE PRECISION,
ADD COLUMN     "posY" DOUBLE PRECISION,
ADD COLUMN     "requiredData" TEXT[],
ADD COLUMN     "successActions" TEXT;

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "activeFrom" TIMESTAMP(3),
ADD COLUMN     "activeUntil" TIMESTAMP(3),
ADD COLUMN     "code" TEXT,
ADD COLUMN     "errorHandling" TEXT,
ADD COLUMN     "module" TEXT,
ADD COLUMN     "retryDelayMinutes" INTEGER,
ADD COLUMN     "retryPolicy" TEXT;

-- AlterTable
ALTER TABLE "automation_executions" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProcessApproval" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requesterId" INTEGER NOT NULL,
    "approverId" INTEGER,
    "approverRole" TEXT,
    "level" TEXT,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "previousApproverId" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "requesterComment" TEXT,
    "decision" TEXT,
    "justification" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" INTEGER,
    "dataSnapshot" TEXT,
    "dataVersion" TEXT,
    "decidedVersion" TEXT,
    "documentIds" INTEGER[],
    "nextStepOrders" INTEGER[],
    "executorId" INTEGER,

    CONSTRAINT "ProcessApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessApproval_code_key" ON "ProcessApproval"("code");

-- CreateIndex
CREATE INDEX "ProcessApproval_instanceId_stepId_idx" ON "ProcessApproval"("instanceId", "stepId");

-- CreateIndex
CREATE INDEX "ProcessApproval_approverId_status_idx" ON "ProcessApproval"("approverId", "status");

-- CreateIndex
CREATE INDEX "ProcessApproval_status_idx" ON "ProcessApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "automation_rules_code_key" ON "automation_rules"("code");

-- CreateIndex
CREATE INDEX "automation_rules_module_idx" ON "automation_rules"("module");

-- CreateIndex
CREATE INDEX "automation_executions_ruleId_dedupeKey_idx" ON "automation_executions"("ruleId", "dedupeKey");

-- CreateIndex
CREATE INDEX "automation_executions_status_nextRetryAt_idx" ON "automation_executions"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "ProcessApproval" ADD CONSTRAINT "ProcessApproval_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ProcessInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessApproval" ADD CONSTRAINT "ProcessApproval_instanceId_stepId_fkey" FOREIGN KEY ("instanceId", "stepId") REFERENCES "StepProgress"("instanceId", "stepId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessApproval" ADD CONSTRAINT "ProcessApproval_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessApproval" ADD CONSTRAINT "ProcessApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

