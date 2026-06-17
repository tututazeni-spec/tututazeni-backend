-- CreateEnum
CREATE TYPE "OkrType" AS ENUM ('ANNUAL', 'QUARTERLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "OkrStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ObjectiveType" AS ENUM ('COMPANY', 'TEAM', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "IndicatorFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "EvalCycleType" AS ENUM ('ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'PROBATION');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('DRAFT', 'OPEN', 'SELF_EVAL', 'MANAGER_EVAL', 'CALIBRATION', 'CLOSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "OkrCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OkrType" NOT NULL DEFAULT 'QUARTERLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "OkrStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OkrCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objective" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ObjectiveType" NOT NULL DEFAULT 'INDIVIDUAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyResult" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT,
    "startValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyResultUpdate" (
    "id" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION NOT NULL,
    "newValue" DOUBLE PRECISION NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "updatedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyResultUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringIndicator" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "formula" TEXT,
    "baseline" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "frequency" "IndicatorFrequency" NOT NULL DEFAULT 'MONTHLY',
    "category" TEXT,
    "responsible" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[],
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRecord" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,
    "variancePct" DOUBLE PRECISION,
    "period" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recordedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EvalCycleType" NOT NULL DEFAULT 'ANNUAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "passingScore" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEvaluation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "evaluatorId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MANAGER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "selfScore" DOUBLE PRECISION,
    "managerScore" DOUBLE PRECISION,
    "finalScore" DOUBLE PRECISION,
    "calibratedScore" DOUBLE PRECISION,
    "selfFeedback" TEXT,
    "managerFeedback" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "developmentPlan" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OkrCycle_status_idx" ON "OkrCycle"("status");

-- CreateIndex
CREATE INDEX "OkrCycle_deletedAt_idx" ON "OkrCycle"("deletedAt");

-- CreateIndex
CREATE INDEX "Objective_cycleId_idx" ON "Objective"("cycleId");

-- CreateIndex
CREATE INDEX "Objective_ownerId_idx" ON "Objective"("ownerId");

-- CreateIndex
CREATE INDEX "Objective_type_idx" ON "Objective"("type");

-- CreateIndex
CREATE INDEX "Objective_deletedAt_idx" ON "Objective"("deletedAt");

-- CreateIndex
CREATE INDEX "KeyResult_objectiveId_idx" ON "KeyResult"("objectiveId");

-- CreateIndex
CREATE INDEX "KeyResult_status_idx" ON "KeyResult"("status");

-- CreateIndex
CREATE INDEX "KeyResult_deletedAt_idx" ON "KeyResult"("deletedAt");

-- CreateIndex
CREATE INDEX "KeyResultUpdate_keyResultId_idx" ON "KeyResultUpdate"("keyResultId");

-- CreateIndex
CREATE INDEX "KeyResultUpdate_createdAt_idx" ON "KeyResultUpdate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringIndicator_code_key" ON "MonitoringIndicator"("code");

-- CreateIndex
CREATE INDEX "MonitoringIndicator_category_idx" ON "MonitoringIndicator"("category");

-- CreateIndex
CREATE INDEX "MonitoringIndicator_isActive_idx" ON "MonitoringIndicator"("isActive");

-- CreateIndex
CREATE INDEX "MonitoringIndicator_deletedAt_idx" ON "MonitoringIndicator"("deletedAt");

-- CreateIndex
CREATE INDEX "MonitoringRecord_indicatorId_idx" ON "MonitoringRecord"("indicatorId");

-- CreateIndex
CREATE INDEX "MonitoringRecord_period_idx" ON "MonitoringRecord"("period");

-- CreateIndex
CREATE INDEX "MonitoringRecord_date_idx" ON "MonitoringRecord"("date");

-- CreateIndex
CREATE INDEX "MonitoringRecord_deletedAt_idx" ON "MonitoringRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "EvaluationCycle_status_idx" ON "EvaluationCycle"("status");

-- CreateIndex
CREATE INDEX "EvaluationCycle_deletedAt_idx" ON "EvaluationCycle"("deletedAt");

-- CreateIndex
CREATE INDEX "UserEvaluation_cycleId_idx" ON "UserEvaluation"("cycleId");

-- CreateIndex
CREATE INDEX "UserEvaluation_userId_idx" ON "UserEvaluation"("userId");

-- CreateIndex
CREATE INDEX "UserEvaluation_status_idx" ON "UserEvaluation"("status");

-- CreateIndex
CREATE INDEX "UserEvaluation_deletedAt_idx" ON "UserEvaluation"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserEvaluation_cycleId_userId_evaluatorId_type_key" ON "UserEvaluation"("cycleId", "userId", "evaluatorId", "type");

-- AddForeignKey
ALTER TABLE "OkrCycle" ADD CONSTRAINT "OkrCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "OkrCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResultUpdate" ADD CONSTRAINT "KeyResultUpdate_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResultUpdate" ADD CONSTRAINT "KeyResultUpdate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringIndicator" ADD CONSTRAINT "MonitoringIndicator_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRecord" ADD CONSTRAINT "MonitoringRecord_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "MonitoringIndicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRecord" ADD CONSTRAINT "MonitoringRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCycle" ADD CONSTRAINT "EvaluationCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvaluation" ADD CONSTRAINT "UserEvaluation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "EvaluationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvaluation" ADD CONSTRAINT "UserEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvaluation" ADD CONSTRAINT "UserEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
