
-- CreateEnum
CREATE TYPE "TrainingPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TrainingPlanPeriod" AS ENUM ('ANNUAL', 'QUARTERLY', 'EXTRAORDINARY');

-- CreateEnum
CREATE TYPE "TrainingPlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrainingStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "TrainingStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "Training" ADD COLUMN     "courseId" INTEGER,
ADD COLUMN     "learningPathId" INTEGER,
ADD COLUMN     "plannedBudget" DOUBLE PRECISION,
ADD COLUMN     "priority" "TrainingPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "responsibleId" INTEGER,
ADD COLUMN     "targetDeptIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "targetPositionIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "targetUnitIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "trainingPlanId" INTEGER;

-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "year" INTEGER NOT NULL,
    "period" "TrainingPlanPeriod" NOT NULL DEFAULT 'ANNUAL',
    "description" TEXT,
    "objectives" TEXT,
    "identifiedNeeds" TEXT,
    "strategicPriorities" TEXT,
    "targetDeptIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "targetUnitIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "targetPositionIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "targetAudience" TEXT,
    "expectedParticipants" INTEGER,
    "expectedHours" DOUBLE PRECISION,
    "modality" "TrainingType",
    "plannedBudget" DOUBLE PRECISION,
    "priority" "TrainingPriority" NOT NULL DEFAULT 'MEDIUM',
    "responsibleId" INTEGER,
    "approverId" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "TrainingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlanCompetency" (
    "id" SERIAL NOT NULL,
    "trainingPlanId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,

    CONSTRAINT "TrainingPlanCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlan_code_key" ON "TrainingPlan"("code");

-- CreateIndex
CREATE INDEX "TrainingPlan_status_idx" ON "TrainingPlan"("status");

-- CreateIndex
CREATE INDEX "TrainingPlan_year_idx" ON "TrainingPlan"("year");

-- CreateIndex
CREATE INDEX "TrainingPlan_createdById_idx" ON "TrainingPlan"("createdById");

-- CreateIndex
CREATE INDEX "TrainingPlanCompetency_competencyId_idx" ON "TrainingPlanCompetency"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlanCompetency_trainingPlanId_competencyId_key" ON "TrainingPlanCompetency"("trainingPlanId", "competencyId");

-- CreateIndex
CREATE INDEX "Training_trainingPlanId_idx" ON "Training"("trainingPlanId");

-- CreateIndex
CREATE INDEX "Training_responsibleId_idx" ON "Training"("responsibleId");

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_trainingPlanId_fkey" FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlanCompetency" ADD CONSTRAINT "TrainingPlanCompetency_trainingPlanId_fkey" FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlanCompetency" ADD CONSTRAINT "TrainingPlanCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

