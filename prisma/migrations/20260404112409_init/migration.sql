-- CreateEnum
CREATE TYPE "EvalType" AS ENUM ('SELF', 'MANAGER', 'PEER', 'SUBORDINATE');

-- CreateEnum
CREATE TYPE "DocCategory" AS ENUM ('POLITICA', 'MANUAL', 'PROCEDIMENTO', 'FORMULARIO', 'CONTRATO', 'REGULAMENTO', 'COMUNICADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocAccess" AS ENUM ('PUBLIC', 'DEPARTMENT', 'RESTRICTED');

-- CreateTable
CREATE TABLE "UserCareerPlan" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "mentorId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetPosition" TEXT,
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCareerPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerGoal" (
    "id" SERIAL NOT NULL,
    "careerPlanId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceEvaluation" (
    "id" SERIAL NOT NULL,
    "evaluatorId" INTEGER NOT NULL,
    "evaluatedId" INTEGER NOT NULL,
    "type" "EvalType" NOT NULL,
    "period" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "generalComment" TEXT,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRequest" (
    "id" SERIAL NOT NULL,
    "evaluatorId" INTEGER NOT NULL,
    "evaluatedId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementSurvey" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" SERIAL NOT NULL,
    "surveyId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" SERIAL NOT NULL,
    "surveyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyAnswer" (
    "id" SERIAL NOT NULL,
    "responseId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "comment" TEXT,

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyMap" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "currentLevel" INTEGER NOT NULL,
    "targetLevel" INTEGER NOT NULL,
    "assessedById" INTEGER,
    "notes" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetencyMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAttendance" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "clockIn" TEXT,
    "clockOut" TEXT,
    "workMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "bonuses" DOUBLE PRECISION,
    "allowances" DOUBLE PRECISION,
    "overtime" DOUBLE PRECISION,
    "incomeTax" DOUBLE PRECISION,
    "socialSecurity" DOUBLE PRECISION,
    "otherDeductions" DOUBLE PRECISION,
    "grossSalary" DOUBLE PRECISION NOT NULL,
    "totalDeductions" DOUBLE PRECISION NOT NULL,
    "netSalary" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessInstance" (
    "id" SERIAL NOT NULL,
    "processId" INTEGER NOT NULL,
    "initiatedById" INTEGER NOT NULL,
    "targetUserId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepProgress" (
    "id" SERIAL NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedById" INTEGER,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "StepProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDeclaration" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT,
    "addressedTo" TEXT,
    "content" TEXT,
    "referenceNumber" TEXT,
    "generatedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DocCategory" NOT NULL,
    "access" "DocAccess" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "version" TEXT,
    "tags" TEXT[],
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "departmentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentDownload" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserCareerPlan_userId_idx" ON "UserCareerPlan"("userId");

-- CreateIndex
CREATE INDEX "UserCareerPlan_status_idx" ON "UserCareerPlan"("status");

-- CreateIndex
CREATE INDEX "CareerGoal_careerPlanId_idx" ON "CareerGoal"("careerPlanId");

-- CreateIndex
CREATE INDEX "PerformanceEvaluation_evaluatedId_idx" ON "PerformanceEvaluation"("evaluatedId");

-- CreateIndex
CREATE INDEX "PerformanceEvaluation_evaluatorId_idx" ON "PerformanceEvaluation"("evaluatorId");

-- CreateIndex
CREATE INDEX "PerformanceEvaluation_period_idx" ON "PerformanceEvaluation"("period");

-- CreateIndex
CREATE INDEX "EvaluationRequest_evaluatorId_idx" ON "EvaluationRequest"("evaluatorId");

-- CreateIndex
CREATE INDEX "EvaluationRequest_evaluatedId_idx" ON "EvaluationRequest"("evaluatedId");

-- CreateIndex
CREATE INDEX "EngagementSurvey_status_idx" ON "EngagementSurvey"("status");

-- CreateIndex
CREATE INDEX "SurveyQuestion_surveyId_idx" ON "SurveyQuestion"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyResponse_userId_idx" ON "SurveyResponse"("userId");

-- CreateIndex
CREATE INDEX "SurveyAnswer_responseId_idx" ON "SurveyAnswer"("responseId");

-- CreateIndex
CREATE INDEX "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- CreateIndex
CREATE INDEX "CompetencyMap_userId_idx" ON "CompetencyMap"("userId");

-- CreateIndex
CREATE INDEX "CompetencyMap_competencyId_idx" ON "CompetencyMap"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyMap_userId_competencyId_key" ON "CompetencyMap"("userId", "competencyId");

-- CreateIndex
CREATE INDEX "UserAttendance_userId_idx" ON "UserAttendance"("userId");

-- CreateIndex
CREATE INDEX "UserAttendance_date_idx" ON "UserAttendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "UserAttendance_userId_date_key" ON "UserAttendance"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_userId_period_key" ON "Payslip"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "StepProgress_instanceId_stepId_key" ON "StepProgress"("instanceId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkDeclaration_referenceNumber_key" ON "WorkDeclaration"("referenceNumber");

-- CreateIndex
CREATE INDEX "CompanyDocument_category_idx" ON "CompanyDocument"("category");

-- CreateIndex
CREATE INDEX "CompanyDocument_access_idx" ON "CompanyDocument"("access");

-- CreateIndex
CREATE INDEX "CompanyDocument_createdById_idx" ON "CompanyDocument"("createdById");

-- CreateIndex
CREATE INDEX "CompanyDocument_departmentId_idx" ON "CompanyDocument"("departmentId");

-- CreateIndex
CREATE INDEX "DocumentDownload_documentId_idx" ON "DocumentDownload"("documentId");

-- CreateIndex
CREATE INDEX "DocumentDownload_userId_idx" ON "DocumentDownload"("userId");

-- AddForeignKey
ALTER TABLE "UserCareerPlan" ADD CONSTRAINT "UserCareerPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCareerPlan" ADD CONSTRAINT "UserCareerPlan_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerGoal" ADD CONSTRAINT "CareerGoal_careerPlanId_fkey" FOREIGN KEY ("careerPlanId") REFERENCES "UserCareerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_evaluatedId_fkey" FOREIGN KEY ("evaluatedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRequest" ADD CONSTRAINT "EvaluationRequest_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRequest" ADD CONSTRAINT "EvaluationRequest_evaluatedId_fkey" FOREIGN KEY ("evaluatedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "EngagementSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "EngagementSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyMap" ADD CONSTRAINT "CompetencyMap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyMap" ADD CONSTRAINT "CompetencyMap_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyMap" ADD CONSTRAINT "CompetencyMap_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAttendance" ADD CONSTRAINT "UserAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProcessStandard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ProcessInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepProgress" ADD CONSTRAINT "StepProgress_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclaration" ADD CONSTRAINT "WorkDeclaration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CompanyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
