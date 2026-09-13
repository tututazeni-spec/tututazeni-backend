-- CreateEnum
CREATE TYPE "PdiOrigin" AS ENUM ('PERFORMANCE_REVIEW', 'EVALUATION_360', 'COMPETENCY_MAP', 'COMPETENCY_GAP', 'CAREER_PLAN', 'SUCCESSION', 'LEADERSHIP_PROGRAM', 'MANAGER_REQUEST', 'EMPLOYEE_REQUEST', 'ONBOARDING', 'ROLE_CHANGE', 'PROMOTION', 'OPERATIONAL_NEED', 'STRATEGIC_NEED', 'OTHER');

-- CreateEnum
CREATE TYPE "PdiCompetencyPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PdiFinalResult" AS ENUM ('GOAL_ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED');

-- CreateEnum
CREATE TYPE "PdiOverallResult" AS ENUM ('EXCEEDED', 'MET', 'PARTIALLY_MET', 'NOT_MET');

-- CreateEnum
CREATE TYPE "PdiNextSteps" AS ENUM ('NEW_PDI', 'CONTINUE_PDI', 'NEW_COMPETENCY_ASSESSMENT', 'LEARNING_PATH', 'LEADERSHIP_PROGRAM', 'ROLE_PREPARATION', 'SUCCESSION_PLAN', 'NONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlanStatus" ADD VALUE 'AT_RISK';
ALTER TYPE "PlanStatus" ADD VALUE 'PARTIALLY_COMPLETED';

-- AlterTable
ALTER TABLE "DevelopmentPlan" ADD COLUMN     "careerPlanId" INTEGER,
ADD COLUMN     "careerReadinessPercent" INTEGER,
ADD COLUMN     "developmentNeeds" TEXT,
ADD COLUMN     "employeeAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "employeeComment" TEXT,
ADD COLUMN     "finalResult" "PdiFinalResult",
ADD COLUMN     "managerComment" TEXT,
ADD COLUMN     "nextSteps" "PdiNextSteps",
ADD COLUMN     "origin" "PdiOrigin",
ADD COLUMN     "originJustification" TEXT,
ADD COLUMN     "overallResult" "PdiOverallResult",
ADD COLUMN     "rhComment" TEXT,
ADD COLUMN     "sourceReviewId" INTEGER,
ADD COLUMN     "strengths" TEXT;

-- CreateTable
CREATE TABLE "PdiCompetencyGap" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "currentLevel" INTEGER,
    "targetLevel" INTEGER,
    "priority" "PdiCompetencyPriority" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdiCompetencyGap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdiCompetencyGap_planId_idx" ON "PdiCompetencyGap"("planId");

-- CreateIndex
CREATE INDEX "PdiCompetencyGap_competencyId_idx" ON "PdiCompetencyGap"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "PdiCompetencyGap_planId_competencyId_key" ON "PdiCompetencyGap"("planId", "competencyId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_sourceReviewId_idx" ON "DevelopmentPlan"("sourceReviewId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_careerPlanId_idx" ON "DevelopmentPlan"("careerPlanId");

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_sourceReviewId_fkey" FOREIGN KEY ("sourceReviewId") REFERENCES "PerformanceReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_careerPlanId_fkey" FOREIGN KEY ("careerPlanId") REFERENCES "UserCareerPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiCompetencyGap" ADD CONSTRAINT "PdiCompetencyGap_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiCompetencyGap" ADD CONSTRAINT "PdiCompetencyGap_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
