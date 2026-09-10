-- CreateEnum
CREATE TYPE "LeadershipProgramType" AS ENUM ('DEVELOPMENT', 'SUCCESSION', 'HIGH_POTENTIAL', 'ONBOARDING_LEADERSHIP', 'EXECUTIVE', 'TECHNICAL_LEADERSHIP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LeadershipCorporateLevel" AS ENUM ('SUPERVISOR', 'COORDINATOR', 'MANAGER', 'SENIOR_MANAGER', 'DIRECTOR', 'EXECUTIVE', 'C_LEVEL');

-- CreateEnum
CREATE TYPE "LeadershipSessionFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'INTENSIVE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LeadershipTargetingScope" AS ENUM ('ROLE', 'POSITION', 'POSITION_LEVEL', 'DEPARTMENT', 'UNIT', 'JOB_FAMILY', 'SENIORITY', 'PERFORMANCE', 'POTENTIAL', 'AGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LeadershipCriterionSource" AS ENUM ('PERFORMANCE_REVIEW', 'NINE_BOX_POTENTIAL', 'COMPETENCY_ASSESSMENT', 'FEEDBACK_360', 'LEADERSHIP_SCORE', 'TENURE', 'CAREER_HISTORY', 'TRAINING_HISTORY', 'MANUAL');

-- CreateEnum
CREATE TYPE "LeadershipObjectiveType" AS ENUM ('STRATEGIC', 'BUSINESS', 'BEHAVIORAL', 'TECHNICAL', 'CULTURAL');

-- CreateEnum
CREATE TYPE "LeadershipContentType" AS ENUM ('COURSE', 'LEARNING_PATH', 'MICRO_LEARNING', 'ASSESSMENT', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "LeadershipMethodologyType" AS ENUM ('TRAINING', 'WORKSHOP', 'COACHING', 'MENTORING', 'PROJECT', 'SIMULATION', 'JOB_ROTATION', 'SHADOWING', 'SELF_STUDY', 'PEER_LEARNING', 'ACTION_LEARNING', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadershipAdvisorRole" AS ENUM ('MENTOR', 'COACH', 'SPECIALIST', 'INSTRUCTOR', 'SPONSOR', 'PROGRAM_MANAGER');

-- CreateEnum
CREATE TYPE "LeadershipAssessmentStage" AS ENUM ('INITIAL', 'MIDPOINT', 'FINAL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "LeadershipAssessmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadershipProjectStatus" AS ENUM ('PROPOSED', 'APPROVED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadershipCostCategory" AS ENUM ('INSTRUCTOR', 'MATERIAL', 'VENUE', 'TRAVEL', 'ACCOMMODATION', 'PLATFORM', 'CERTIFICATION', 'CONSULTING', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadershipDocumentKind" AS ENUM ('SYLLABUS', 'MATERIAL', 'EVIDENCE', 'CONTRACT', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadershipCommunicationEvent" AS ENUM ('INVITATION', 'SELECTION_RESULT', 'ENROLLMENT_CONFIRMED', 'SESSION_REMINDER', 'DEADLINE_REMINDER', 'ASSESSMENT_DUE', 'PROJECT_DUE', 'COMPLETION', 'CERTIFICATE_ISSUED', 'CANCELLATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LeadershipCommunicationChannel" AS ENUM ('IN_APP', 'EMAIL', 'BOTH');

-- CreateEnum
CREATE TYPE "LeadershipCommunicationStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "ParticipantStatus" ADD VALUE 'CANDIDATE';
ALTER TYPE "ParticipantStatus" ADD VALUE 'INVITED';
ALTER TYPE "ParticipantStatus" ADD VALUE 'SELECTED';
ALTER TYPE "ParticipantStatus" ADD VALUE 'REJECTED';
ALTER TYPE "ParticipantStatus" ADD VALUE 'FAILED';
ALTER TYPE "ParticipantStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "ProgramStatus" ADD VALUE 'PLANNED';
ALTER TYPE "ProgramStatus" ADD VALUE 'OPEN_FOR_SELECTION';
ALTER TYPE "ProgramStatus" ADD VALUE 'SELECTION_CLOSED';
ALTER TYPE "ProgramStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "ProgramStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "ProgramStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "LeadershipProgram" ADD COLUMN     "calendarNotes" TEXT,
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "certificateTemplateId" TEXT,
ADD COLUMN     "certificateTitle" TEXT,
ADD COLUMN     "certificateValidityDays" INTEGER,
ADD COLUMN     "certificationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completionCriteria" TEXT,
ADD COLUMN     "corporateLevel" "LeadershipCorporateLevel",
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "departmentId" INTEGER,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "minAttendanceRate" INTEGER,
ADD COLUMN     "minFinalScore" INTEGER,
ADD COLUMN     "minParticipants" INTEGER,
ADD COLUMN     "modality" "SessionModality" NOT NULL DEFAULT 'PRESENTIAL',
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "requireAllContents" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireFinalProject" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsibleId" INTEGER,
ADD COLUMN     "schedule" TEXT,
ADD COLUMN     "selectionEndDate" TIMESTAMP(3),
ADD COLUMN     "selectionStartDate" TIMESTAMP(3),
ADD COLUMN     "sessionFrequency" "LeadershipSessionFrequency",
ADD COLUMN     "totalSessions" INTEGER,
ADD COLUMN     "type" "LeadershipProgramType" NOT NULL DEFAULT 'DEVELOPMENT',
ADD COLUMN     "workloadHours" INTEGER;

-- AlterTable — LeadershipProgram.code
-- Adicionado nullable, preenchido para os programas legados e só depois
-- promovido a NOT NULL. Um ADD COLUMN NOT NULL directo rebentaria numa BD
-- com registos.
ALTER TABLE "LeadershipProgram" ADD COLUMN "code" TEXT;
UPDATE "LeadershipProgram" SET "code" = 'LDR-' || lpad("id"::text, 6, '0') WHERE "code" IS NULL;
ALTER TABLE "LeadershipProgram" ALTER COLUMN "code" SET NOT NULL;

-- CreateTable
CREATE TABLE "LeadershipProgramTargeting" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "scope" "LeadershipTargetingScope" NOT NULL,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "roleId" INTEGER,
    "positionId" INTEGER,
    "departmentId" INTEGER,
    "unitId" INTEGER,
    "positionLevel" "PositionLevel",
    "seniorityLevel" "SeniorityLevel",
    "jobFamily" TEXT,
    "minValue" DECIMAL(10,2),
    "maxValue" DECIMAL(10,2),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramTargeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipSelectionCriterion" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "LeadershipCriterionSource" NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "minScore" DECIMAL(5,2),
    "competencyId" INTEGER,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipSelectionCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProgramCompetency" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "baselineLevel" INTEGER,
    "targetLevel" INTEGER NOT NULL,
    "weight" DECIMAL(5,2),
    "behavioralIndicators" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProgramObjective" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "LeadershipObjectiveType" NOT NULL DEFAULT 'BEHAVIORAL',
    "indicator" TEXT,
    "targetValue" TEXT,
    "unit" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProgramContent" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "contentType" "LeadershipContentType" NOT NULL,
    "courseId" INTEGER,
    "learningPathId" INTEGER,
    "microLearningId" INTEGER,
    "assessmentId" INTEGER,
    "externalUrl" TEXT,
    "title" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "weight" DECIMAL(5,2),
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProgramMethodology" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "type" "LeadershipMethodologyType" NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "weight" DECIMAL(5,2),
    "hours" INTEGER,
    "sessions" INTEGER,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramMethodology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProgramAdvisor" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "LeadershipAdvisorRole" NOT NULL,
    "focusArea" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramAdvisor_pkey" PRIMARY KEY ("id")
);

-- RenameTable — LeadershipParticipant → LeadershipProgramParticipant
-- A tabela tem registos e é referenciada por Certificate/User; é renomeada,
-- nunca recriada. O PostgreSQL não renomeia índices/constraints com a tabela,
-- por isso são renomeados explicitamente para os nomes que o Prisma espera —
-- sem isto o próximo `migrate diff` acusaria drift.
ALTER TABLE "LeadershipParticipant" RENAME TO "LeadershipProgramParticipant";
ALTER SEQUENCE "LeadershipParticipant_id_seq" RENAME TO "LeadershipProgramParticipant_id_seq";
ALTER INDEX "LeadershipParticipant_pkey" RENAME TO "LeadershipProgramParticipant_pkey";
ALTER INDEX "LeadershipParticipant_userId_programId_key" RENAME TO "LeadershipProgramParticipant_userId_programId_key";
ALTER INDEX "LeadershipParticipant_userId_idx" RENAME TO "LeadershipProgramParticipant_userId_idx";
ALTER TABLE "LeadershipProgramParticipant" RENAME CONSTRAINT "LeadershipParticipant_userId_fkey" TO "LeadershipProgramParticipant_userId_fkey";
ALTER TABLE "LeadershipProgramParticipant" RENAME CONSTRAINT "LeadershipParticipant_programId_fkey" TO "LeadershipProgramParticipant_programId_fkey";

-- AlterTable — novas colunas do participante. Todas nullable ou com default,
-- excepto updatedAt, que é preenchido a partir de enrolledAt antes de passar
-- a NOT NULL (o Prisma gere-o via @updatedAt, sem default na BD).
ALTER TABLE "LeadershipProgramParticipant"
ADD COLUMN     "eligibilityScore" DECIMAL(5,2),
ADD COLUMN     "eligibilityBreakdown" TEXT,
ADD COLUMN     "eligibilityMissingData" TEXT,
ADD COLUMN     "eligibilityComputedAt" TIMESTAMP(3),
ADD COLUMN     "baselineScore" DECIMAL(5,2),
ADD COLUMN     "baselineNotes" TEXT,
ADD COLUMN     "baselineCapturedAt" TIMESTAMP(3),
ADD COLUMN     "readinessLevel" "ReadinessLevel",
ADD COLUMN     "finalScore" DECIMAL(5,2),
ADD COLUMN     "attendanceRate" DECIMAL(5,2),
ADD COLUMN     "certifiedAt" TIMESTAMP(3),
ADD COLUMN     "mentorId" INTEGER,
ADD COLUMN     "coachId" INTEGER,
ADD COLUMN     "mentoringId" INTEGER,
ADD COLUMN     "successionPlanId" INTEGER,
ADD COLUMN     "selectedById" INTEGER,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "selectedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawReason" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

UPDATE "LeadershipProgramParticipant" SET "createdAt" = "enrolledAt";
UPDATE "LeadershipProgramParticipant" SET "updatedAt" = COALESCE("completedAt", "enrolledAt", CURRENT_TIMESTAMP) WHERE "updatedAt" IS NULL;
ALTER TABLE "LeadershipProgramParticipant" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "LeadershipParticipantPlan" (
    "id" SERIAL NOT NULL,
    "participantId" INTEGER NOT NULL,
    "developmentPlanId" INTEGER,
    "title" TEXT,
    "summary" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipParticipantPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipParticipantPlanAction" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "developmentPlanActionId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ActionType" NOT NULL DEFAULT 'OTHER',
    "status" "ActionStatus" NOT NULL DEFAULT 'TODO',
    "courseId" INTEGER,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipParticipantPlanAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipParticipantAssessment" (
    "id" SERIAL NOT NULL,
    "participantId" INTEGER NOT NULL,
    "stage" "LeadershipAssessmentStage" NOT NULL,
    "status" "LeadershipAssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "assessorId" INTEGER,
    "assessmentId" INTEGER,
    "score" DECIMAL(5,2),
    "maxScore" DECIMAL(5,2),
    "readinessLevel" "ReadinessLevel",
    "feedback" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "assessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipParticipantAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProject" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "participantId" INTEGER,
    "title" TEXT NOT NULL,
    "challenge" TEXT,
    "description" TEXT,
    "status" "LeadershipProjectStatus" NOT NULL DEFAULT 'PROPOSED',
    "kpiName" TEXT,
    "kpiTarget" TEXT,
    "kpiResult" TEXT,
    "sponsorId" INTEGER,
    "mentorId" INTEGER,
    "evaluatedById" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),
    "score" DECIMAL(5,2),
    "outcome" TEXT,
    "evaluationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProgramCost" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "participantId" INTEGER,
    "category" "LeadershipCostCategory" NOT NULL,
    "description" TEXT,
    "plannedAmount" DECIMAL(14,2),
    "actualAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "incurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProgramDocument" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "participantId" INTEGER,
    "projectId" INTEGER,
    "documentId" INTEGER NOT NULL,
    "kind" "LeadershipDocumentKind" NOT NULL DEFAULT 'MATERIAL',
    "uploadedById" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipProgramCommunication" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "participantId" INTEGER,
    "event" "LeadershipCommunicationEvent" NOT NULL,
    "channel" "LeadershipCommunicationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "LeadershipCommunicationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "subject" TEXT,
    "body" TEXT,
    "daysOffset" INTEGER,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "notificationLogId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipProgramCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadershipProgramTargeting_programId_idx" ON "LeadershipProgramTargeting"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramTargeting_scope_idx" ON "LeadershipProgramTargeting"("scope");

-- CreateIndex
CREATE INDEX "LeadershipProgramTargeting_roleId_idx" ON "LeadershipProgramTargeting"("roleId");

-- CreateIndex
CREATE INDEX "LeadershipProgramTargeting_positionId_idx" ON "LeadershipProgramTargeting"("positionId");

-- CreateIndex
CREATE INDEX "LeadershipProgramTargeting_departmentId_idx" ON "LeadershipProgramTargeting"("departmentId");

-- CreateIndex
CREATE INDEX "LeadershipProgramTargeting_unitId_idx" ON "LeadershipProgramTargeting"("unitId");

-- CreateIndex
CREATE INDEX "LeadershipProgramTargeting_positionLevel_idx" ON "LeadershipProgramTargeting"("positionLevel");

-- CreateIndex
CREATE INDEX "LeadershipSelectionCriterion_programId_idx" ON "LeadershipSelectionCriterion"("programId");

-- CreateIndex
CREATE INDEX "LeadershipSelectionCriterion_competencyId_idx" ON "LeadershipSelectionCriterion"("competencyId");

-- CreateIndex
CREATE INDEX "LeadershipSelectionCriterion_source_idx" ON "LeadershipSelectionCriterion"("source");

-- CreateIndex
CREATE INDEX "LeadershipSelectionCriterion_active_idx" ON "LeadershipSelectionCriterion"("active");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipSelectionCriterion_programId_name_key" ON "LeadershipSelectionCriterion"("programId", "name");

-- CreateIndex
CREATE INDEX "LeadershipProgramCompetency_programId_idx" ON "LeadershipProgramCompetency"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramCompetency_competencyId_idx" ON "LeadershipProgramCompetency"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipProgramCompetency_programId_competencyId_key" ON "LeadershipProgramCompetency"("programId", "competencyId");

-- CreateIndex
CREATE INDEX "LeadershipProgramObjective_programId_idx" ON "LeadershipProgramObjective"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramObjective_type_idx" ON "LeadershipProgramObjective"("type");

-- CreateIndex
CREATE INDEX "LeadershipProgramContent_programId_idx" ON "LeadershipProgramContent"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramContent_contentType_idx" ON "LeadershipProgramContent"("contentType");

-- CreateIndex
CREATE INDEX "LeadershipProgramContent_courseId_idx" ON "LeadershipProgramContent"("courseId");

-- CreateIndex
CREATE INDEX "LeadershipProgramContent_learningPathId_idx" ON "LeadershipProgramContent"("learningPathId");

-- CreateIndex
CREATE INDEX "LeadershipProgramContent_microLearningId_idx" ON "LeadershipProgramContent"("microLearningId");

-- CreateIndex
CREATE INDEX "LeadershipProgramContent_assessmentId_idx" ON "LeadershipProgramContent"("assessmentId");

-- CreateIndex
CREATE INDEX "LeadershipProgramMethodology_programId_idx" ON "LeadershipProgramMethodology"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramMethodology_type_idx" ON "LeadershipProgramMethodology"("type");

-- CreateIndex
CREATE INDEX "LeadershipProgramAdvisor_programId_idx" ON "LeadershipProgramAdvisor"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramAdvisor_userId_idx" ON "LeadershipProgramAdvisor"("userId");

-- CreateIndex
CREATE INDEX "LeadershipProgramAdvisor_role_idx" ON "LeadershipProgramAdvisor"("role");

-- CreateIndex
CREATE INDEX "LeadershipProgramAdvisor_active_idx" ON "LeadershipProgramAdvisor"("active");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipProgramAdvisor_programId_userId_role_key" ON "LeadershipProgramAdvisor"("programId", "userId", "role");

-- CreateIndex
CREATE INDEX "LeadershipProgramParticipant_programId_status_idx" ON "LeadershipProgramParticipant"("programId", "status");

-- CreateIndex
CREATE INDEX "LeadershipProgramParticipant_status_idx" ON "LeadershipProgramParticipant"("status");

-- CreateIndex
CREATE INDEX "LeadershipProgramParticipant_readinessLevel_idx" ON "LeadershipProgramParticipant"("readinessLevel");

-- CreateIndex
CREATE INDEX "LeadershipProgramParticipant_mentorId_idx" ON "LeadershipProgramParticipant"("mentorId");

-- CreateIndex
CREATE INDEX "LeadershipProgramParticipant_coachId_idx" ON "LeadershipProgramParticipant"("coachId");

-- CreateIndex
CREATE INDEX "LeadershipProgramParticipant_mentoringId_idx" ON "LeadershipProgramParticipant"("mentoringId");

-- CreateIndex
CREATE INDEX "LeadershipProgramParticipant_successionPlanId_idx" ON "LeadershipProgramParticipant"("successionPlanId");

-- CreateIndex
CREATE INDEX "LeadershipProgramParticipant_selectedById_idx" ON "LeadershipProgramParticipant"("selectedById");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipParticipantPlan_participantId_key" ON "LeadershipParticipantPlan"("participantId");

-- CreateIndex
CREATE INDEX "LeadershipParticipantPlan_developmentPlanId_idx" ON "LeadershipParticipantPlan"("developmentPlanId");

-- CreateIndex
CREATE INDEX "LeadershipParticipantPlan_status_idx" ON "LeadershipParticipantPlan"("status");

-- CreateIndex
CREATE INDEX "LeadershipParticipantPlanAction_planId_idx" ON "LeadershipParticipantPlanAction"("planId");

-- CreateIndex
CREATE INDEX "LeadershipParticipantPlanAction_developmentPlanActionId_idx" ON "LeadershipParticipantPlanAction"("developmentPlanActionId");

-- CreateIndex
CREATE INDEX "LeadershipParticipantPlanAction_courseId_idx" ON "LeadershipParticipantPlanAction"("courseId");

-- CreateIndex
CREATE INDEX "LeadershipParticipantPlanAction_status_idx" ON "LeadershipParticipantPlanAction"("status");

-- CreateIndex
CREATE INDEX "LeadershipParticipantAssessment_participantId_idx" ON "LeadershipParticipantAssessment"("participantId");

-- CreateIndex
CREATE INDEX "LeadershipParticipantAssessment_stage_idx" ON "LeadershipParticipantAssessment"("stage");

-- CreateIndex
CREATE INDEX "LeadershipParticipantAssessment_status_idx" ON "LeadershipParticipantAssessment"("status");

-- CreateIndex
CREATE INDEX "LeadershipParticipantAssessment_assessorId_idx" ON "LeadershipParticipantAssessment"("assessorId");

-- CreateIndex
CREATE INDEX "LeadershipParticipantAssessment_assessmentId_idx" ON "LeadershipParticipantAssessment"("assessmentId");

-- CreateIndex
CREATE INDEX "LeadershipProject_programId_idx" ON "LeadershipProject"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProject_participantId_idx" ON "LeadershipProject"("participantId");

-- CreateIndex
CREATE INDEX "LeadershipProject_status_idx" ON "LeadershipProject"("status");

-- CreateIndex
CREATE INDEX "LeadershipProject_sponsorId_idx" ON "LeadershipProject"("sponsorId");

-- CreateIndex
CREATE INDEX "LeadershipProject_mentorId_idx" ON "LeadershipProject"("mentorId");

-- CreateIndex
CREATE INDEX "LeadershipProject_evaluatedById_idx" ON "LeadershipProject"("evaluatedById");

-- CreateIndex
CREATE INDEX "LeadershipProgramCost_programId_idx" ON "LeadershipProgramCost"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramCost_participantId_idx" ON "LeadershipProgramCost"("participantId");

-- CreateIndex
CREATE INDEX "LeadershipProgramCost_category_idx" ON "LeadershipProgramCost"("category");

-- CreateIndex
CREATE INDEX "LeadershipProgramDocument_programId_idx" ON "LeadershipProgramDocument"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramDocument_participantId_idx" ON "LeadershipProgramDocument"("participantId");

-- CreateIndex
CREATE INDEX "LeadershipProgramDocument_projectId_idx" ON "LeadershipProgramDocument"("projectId");

-- CreateIndex
CREATE INDEX "LeadershipProgramDocument_documentId_idx" ON "LeadershipProgramDocument"("documentId");

-- CreateIndex
CREATE INDEX "LeadershipProgramDocument_kind_idx" ON "LeadershipProgramDocument"("kind");

-- CreateIndex
CREATE INDEX "LeadershipProgramDocument_uploadedById_idx" ON "LeadershipProgramDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "LeadershipProgramCommunication_programId_idx" ON "LeadershipProgramCommunication"("programId");

-- CreateIndex
CREATE INDEX "LeadershipProgramCommunication_participantId_idx" ON "LeadershipProgramCommunication"("participantId");

-- CreateIndex
CREATE INDEX "LeadershipProgramCommunication_event_idx" ON "LeadershipProgramCommunication"("event");

-- CreateIndex
CREATE INDEX "LeadershipProgramCommunication_status_idx" ON "LeadershipProgramCommunication"("status");

-- CreateIndex
CREATE INDEX "LeadershipProgramCommunication_scheduledFor_idx" ON "LeadershipProgramCommunication"("scheduledFor");

-- CreateIndex
CREATE INDEX "LeadershipProgramCommunication_notificationLogId_idx" ON "LeadershipProgramCommunication"("notificationLogId");

-- CreateIndex
CREATE INDEX "LeadershipProgramCommunication_active_idx" ON "LeadershipProgramCommunication"("active");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipProgram_code_key" ON "LeadershipProgram"("code");

-- CreateIndex
CREATE INDEX "LeadershipProgram_type_idx" ON "LeadershipProgram"("type");

-- CreateIndex
CREATE INDEX "LeadershipProgram_corporateLevel_idx" ON "LeadershipProgram"("corporateLevel");

-- CreateIndex
CREATE INDEX "LeadershipProgram_createdById_idx" ON "LeadershipProgram"("createdById");

-- CreateIndex
CREATE INDEX "LeadershipProgram_responsibleId_idx" ON "LeadershipProgram"("responsibleId");

-- CreateIndex
CREATE INDEX "LeadershipProgram_departmentId_idx" ON "LeadershipProgram"("departmentId");

-- CreateIndex
CREATE INDEX "LeadershipProgram_learningPathId_idx" ON "LeadershipProgram"("learningPathId");

-- CreateIndex
CREATE INDEX "LeadershipProgram_mandatory_idx" ON "LeadershipProgram"("mandatory");

-- CreateIndex
CREATE INDEX "LeadershipProgram_startDate_idx" ON "LeadershipProgram"("startDate");

-- CreateIndex
CREATE INDEX "LeadershipProgram_certificateTemplateId_idx" ON "LeadershipProgram"("certificateTemplateId");

-- AddForeignKey
ALTER TABLE "LeadershipProgram" ADD CONSTRAINT "LeadershipProgram_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgram" ADD CONSTRAINT "LeadershipProgram_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgram" ADD CONSTRAINT "LeadershipProgram_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgram" ADD CONSTRAINT "LeadershipProgram_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgram" ADD CONSTRAINT "LeadershipProgram_certificateTemplateId_fkey" FOREIGN KEY ("certificateTemplateId") REFERENCES "CertificateTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramTargeting" ADD CONSTRAINT "LeadershipProgramTargeting_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramTargeting" ADD CONSTRAINT "LeadershipProgramTargeting_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramTargeting" ADD CONSTRAINT "LeadershipProgramTargeting_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramTargeting" ADD CONSTRAINT "LeadershipProgramTargeting_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramTargeting" ADD CONSTRAINT "LeadershipProgramTargeting_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipSelectionCriterion" ADD CONSTRAINT "LeadershipSelectionCriterion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipSelectionCriterion" ADD CONSTRAINT "LeadershipSelectionCriterion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramCompetency" ADD CONSTRAINT "LeadershipProgramCompetency_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramCompetency" ADD CONSTRAINT "LeadershipProgramCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramObjective" ADD CONSTRAINT "LeadershipProgramObjective_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramContent" ADD CONSTRAINT "LeadershipProgramContent_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramContent" ADD CONSTRAINT "LeadershipProgramContent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramContent" ADD CONSTRAINT "LeadershipProgramContent_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramContent" ADD CONSTRAINT "LeadershipProgramContent_microLearningId_fkey" FOREIGN KEY ("microLearningId") REFERENCES "MicroLearning"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramContent" ADD CONSTRAINT "LeadershipProgramContent_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramMethodology" ADD CONSTRAINT "LeadershipProgramMethodology_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramAdvisor" ADD CONSTRAINT "LeadershipProgramAdvisor_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramAdvisor" ADD CONSTRAINT "LeadershipProgramAdvisor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramParticipant" ADD CONSTRAINT "LeadershipProgramParticipant_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramParticipant" ADD CONSTRAINT "LeadershipProgramParticipant_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramParticipant" ADD CONSTRAINT "LeadershipProgramParticipant_selectedById_fkey" FOREIGN KEY ("selectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramParticipant" ADD CONSTRAINT "LeadershipProgramParticipant_mentoringId_fkey" FOREIGN KEY ("mentoringId") REFERENCES "Mentoring"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramParticipant" ADD CONSTRAINT "LeadershipProgramParticipant_successionPlanId_fkey" FOREIGN KEY ("successionPlanId") REFERENCES "SuccessionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipantPlan" ADD CONSTRAINT "LeadershipParticipantPlan_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LeadershipProgramParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipantPlan" ADD CONSTRAINT "LeadershipParticipantPlan_developmentPlanId_fkey" FOREIGN KEY ("developmentPlanId") REFERENCES "DevelopmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipantPlanAction" ADD CONSTRAINT "LeadershipParticipantPlanAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LeadershipParticipantPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipantPlanAction" ADD CONSTRAINT "LeadershipParticipantPlanAction_developmentPlanActionId_fkey" FOREIGN KEY ("developmentPlanActionId") REFERENCES "DevelopmentPlanAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipantPlanAction" ADD CONSTRAINT "LeadershipParticipantPlanAction_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipantAssessment" ADD CONSTRAINT "LeadershipParticipantAssessment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LeadershipProgramParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipantAssessment" ADD CONSTRAINT "LeadershipParticipantAssessment_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipantAssessment" ADD CONSTRAINT "LeadershipParticipantAssessment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProject" ADD CONSTRAINT "LeadershipProject_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProject" ADD CONSTRAINT "LeadershipProject_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LeadershipProgramParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProject" ADD CONSTRAINT "LeadershipProject_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProject" ADD CONSTRAINT "LeadershipProject_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProject" ADD CONSTRAINT "LeadershipProject_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramCost" ADD CONSTRAINT "LeadershipProgramCost_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramCost" ADD CONSTRAINT "LeadershipProgramCost_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LeadershipProgramParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramDocument" ADD CONSTRAINT "LeadershipProgramDocument_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramDocument" ADD CONSTRAINT "LeadershipProgramDocument_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LeadershipProgramParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramDocument" ADD CONSTRAINT "LeadershipProgramDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LeadershipProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramDocument" ADD CONSTRAINT "LeadershipProgramDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramDocument" ADD CONSTRAINT "LeadershipProgramDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramCommunication" ADD CONSTRAINT "LeadershipProgramCommunication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LeadershipProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramCommunication" ADD CONSTRAINT "LeadershipProgramCommunication_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LeadershipProgramParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipProgramCommunication" ADD CONSTRAINT "LeadershipProgramCommunication_notificationLogId_fkey" FOREIGN KEY ("notificationLogId") REFERENCES "NotificationLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

