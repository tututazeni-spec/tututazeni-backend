-- CreateEnum
CREATE TYPE "EvalCampaignModel" AS ENUM ('DEG_90', 'DEG_180', 'DEG_270', 'DEG_360', 'CONTINUOUS', 'PROJECT');

-- CreateEnum
CREATE TYPE "EvalCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PENDING', 'COMPLETED', 'CLOSED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EvalCampaignEvaluatorType" AS ENUM ('SELF', 'MANAGER', 'PEER', 'SUBORDINATE', 'CLIENT');

-- CreateEnum
CREATE TYPE "EvalQuestionType" AS ENUM ('SCALE', 'TEXT', 'NPS', 'BOOLEAN', 'NA_ALLOWED');

-- CreateEnum
CREATE TYPE "EvalAssignmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'CALIBRATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "EvaluationCampaign" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "model" "EvalCampaignModel" NOT NULL DEFAULT 'DEG_360',
    "status" "EvalCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "templateId" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "formId" INTEGER,
    "targetDeptIds" INTEGER[],
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "selfEvalIncludedInScore" BOOLEAN NOT NULL DEFAULT false,
    "weights" TEXT,
    "minScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "requireComments" BOOLEAN NOT NULL DEFAULT false,
    "requireEvidence" BOOLEAN NOT NULL DEFAULT false,
    "allowEdit" BOOLEAN NOT NULL DEFAULT false,
    "allowContest" BOOLEAN NOT NULL DEFAULT false,
    "allowCalibration" BOOLEAN NOT NULL DEFAULT true,
    "resultsVisibility" TEXT,
    "linkPdi" BOOLEAN NOT NULL DEFAULT false,
    "linkCompetencies" BOOLEAN NOT NULL DEFAULT false,
    "linkCareer" BOOLEAN NOT NULL DEFAULT false,
    "linkSuccession" BOOLEAN NOT NULL DEFAULT false,
    "link9Box" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCampaignForm" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationCampaignForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCampaignQuestion" (
    "id" SERIAL NOT NULL,
    "formId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" "EvalQuestionType" NOT NULL DEFAULT 'SCALE',
    "order" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "scaleMax" INTEGER,
    "competencyId" INTEGER,
    "weight" DOUBLE PRECISION,

    CONSTRAINT "EvaluationCampaignQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationAssignment" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "evaluatedId" INTEGER NOT NULL,
    "evaluatorId" INTEGER NOT NULL,
    "type" "EvalCampaignEvaluatorType" NOT NULL,
    "status" "EvalAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "answers" TEXT,
    "score" DOUBLE PRECISION,
    "calibratedScore" DOUBLE PRECISION,
    "calibrationNote" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "recommendations" TEXT,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationScale" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minValue" INTEGER NOT NULL DEFAULT 1,
    "maxValue" INTEGER NOT NULL DEFAULT 5,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationScaleLevel" (
    "id" SERIAL NOT NULL,
    "scaleId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "EvaluationScaleLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCriteria" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleId" INTEGER,
    "competencyId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'GENERIC',
    "scaleId" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationTemplateCriteria" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "criteriaId" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvaluationTemplateCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationCampaign_code_key" ON "EvaluationCampaign"("code");

-- CreateIndex
CREATE INDEX "EvaluationCampaign_status_idx" ON "EvaluationCampaign"("status");

-- CreateIndex
CREATE INDEX "EvaluationCampaign_deletedAt_idx" ON "EvaluationCampaign"("deletedAt");

-- CreateIndex
CREATE INDEX "EvaluationCampaignForm_deletedAt_idx" ON "EvaluationCampaignForm"("deletedAt");

-- CreateIndex
CREATE INDEX "EvaluationCampaignQuestion_formId_idx" ON "EvaluationCampaignQuestion"("formId");

-- CreateIndex
CREATE INDEX "EvaluationAssignment_campaignId_idx" ON "EvaluationAssignment"("campaignId");

-- CreateIndex
CREATE INDEX "EvaluationAssignment_evaluatedId_idx" ON "EvaluationAssignment"("evaluatedId");

-- CreateIndex
CREATE INDEX "EvaluationAssignment_evaluatorId_idx" ON "EvaluationAssignment"("evaluatorId");

-- CreateIndex
CREATE INDEX "EvaluationAssignment_status_idx" ON "EvaluationAssignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationAssignment_campaignId_evaluatedId_evaluatorId_typ_key" ON "EvaluationAssignment"("campaignId", "evaluatedId", "evaluatorId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationScaleLevel_scaleId_value_key" ON "EvaluationScaleLevel"("scaleId", "value");

-- CreateIndex
CREATE INDEX "EvaluationCriteria_deletedAt_idx" ON "EvaluationCriteria"("deletedAt");

-- CreateIndex
CREATE INDEX "EvaluationTemplate_deletedAt_idx" ON "EvaluationTemplate"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationTemplateCriteria_templateId_criteriaId_key" ON "EvaluationTemplateCriteria"("templateId", "criteriaId");

-- AddForeignKey
ALTER TABLE "EvaluationCampaign" ADD CONSTRAINT "EvaluationCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCampaign" ADD CONSTRAINT "EvaluationCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCampaign" ADD CONSTRAINT "EvaluationCampaign_formId_fkey" FOREIGN KEY ("formId") REFERENCES "EvaluationCampaignForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCampaignForm" ADD CONSTRAINT "EvaluationCampaignForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCampaignQuestion" ADD CONSTRAINT "EvaluationCampaignQuestion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "EvaluationCampaignForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCampaignQuestion" ADD CONSTRAINT "EvaluationCampaignQuestion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAssignment" ADD CONSTRAINT "EvaluationAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EvaluationCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAssignment" ADD CONSTRAINT "EvaluationAssignment_evaluatedId_fkey" FOREIGN KEY ("evaluatedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAssignment" ADD CONSTRAINT "EvaluationAssignment_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScaleLevel" ADD CONSTRAINT "EvaluationScaleLevel_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "EvaluationScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriteria" ADD CONSTRAINT "EvaluationCriteria_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "EvaluationScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriteria" ADD CONSTRAINT "EvaluationCriteria_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCriteria" ADD CONSTRAINT "EvaluationCriteria_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTemplate" ADD CONSTRAINT "EvaluationTemplate_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "EvaluationScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTemplate" ADD CONSTRAINT "EvaluationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTemplateCriteria" ADD CONSTRAINT "EvaluationTemplateCriteria_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationTemplateCriteria" ADD CONSTRAINT "EvaluationTemplateCriteria_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "EvaluationCriteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

