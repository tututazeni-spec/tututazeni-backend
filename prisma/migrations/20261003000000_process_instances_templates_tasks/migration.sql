-- CreateEnum
CREATE TYPE "ProcessPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StepProgressStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "StepProgressStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "StepProgressStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "ProcessStandard" ADD COLUMN     "accessRoles" TEXT[],
ADD COLUMN     "approvalRules" TEXT,
ADD COLUMN     "completionConditions" TEXT,
ADD COLUMN     "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "effectiveFrom" TIMESTAMP(3),
ADD COLUMN     "involvedModules" TEXT[],
ADD COLUMN     "requiredDocuments" TEXT[],
ADD COLUMN     "reviewPolicy" TEXT,
ADD COLUMN     "startConditions" TEXT;

-- AlterTable
ALTER TABLE "ProcessStep" ADD COLUMN     "dependsOnOrders" INTEGER[],
ADD COLUMN     "parallel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewerId" INTEGER;

-- AlterTable
ALTER TABLE "ProcessInstance" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "code" TEXT,
ADD COLUMN     "currentResponsibleId" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "priority" "ProcessPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "sourceEntityId" TEXT,
ADD COLUMN     "sourceEntityType" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "StepProgress" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assigneeId" INTEGER,
ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "checklistDone" TEXT[],
ADD COLUMN     "result" TEXT,
ADD COLUMN     "returnCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "reviewerId" INTEGER;

-- CreateTable
CREATE TABLE "ProcessStepComment" (
    "id" SERIAL NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "mentionIds" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessStepComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessStepComment_instanceId_stepId_idx" ON "ProcessStepComment"("instanceId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessInstance_code_key" ON "ProcessInstance"("code");

-- CreateIndex
CREATE INDEX "ProcessInstance_priority_idx" ON "ProcessInstance"("priority");

-- CreateIndex
CREATE INDEX "ProcessInstance_currentResponsibleId_idx" ON "ProcessInstance"("currentResponsibleId");

-- CreateIndex
CREATE INDEX "StepProgress_assigneeId_idx" ON "StepProgress"("assigneeId");

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_currentResponsibleId_fkey" FOREIGN KEY ("currentResponsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStepComment" ADD CONSTRAINT "ProcessStepComment_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ProcessInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStepComment" ADD CONSTRAINT "ProcessStepComment_instanceId_stepId_fkey" FOREIGN KEY ("instanceId", "stepId") REFERENCES "StepProgress"("instanceId", "stepId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStepComment" ADD CONSTRAINT "ProcessStepComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: código legível para instâncias anteriores (PROC-AAAA-NNNN, por ano de início).
UPDATE "ProcessInstance" pi
SET "code" = 'PROC-' || to_char(r."startedAt", 'YYYY') || '-' || lpad(r.rn::text, 4, '0')
FROM (
  SELECT "id", "startedAt",
         row_number() OVER (PARTITION BY to_char("startedAt", 'YYYY') ORDER BY "id") AS rn
  FROM "ProcessInstance"
) r
WHERE pi."id" = r."id" AND pi."code" IS NULL;
