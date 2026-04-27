/*
  Warnings:

  - You are about to drop the column `passScore` on the `Assessment` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `AssessmentAttempt` table. All the data in the column will be lost.
  - You are about to alter the column `score` on the `AssessmentAttempt` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to drop the column `correctIndex` on the `AssessmentQuestion` table. All the data in the column will be lost.
  - You are about to drop the column `question` on the `AssessmentQuestion` table. All the data in the column will be lost.
  - The `status` column on the `Attendance` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `category` on the `CareerGoal` table. All the data in the column will be lost.
  - The `status` column on the `CareerGoal` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `active` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `avgScore` on the `CourseAnalytics` table. All the data in the column will be lost.
  - The `status` column on the `Enrollment` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `EventParticipant` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `evaluatorName` on the `Feedback360` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `KnowledgeArticle` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `KnowledgeTag` table. All the data in the column will be lost.
  - You are about to drop the column `active` on the `LeadershipProgram` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `LearningPathAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `unitId` on the `LearningPathAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `contentType` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `pdfUrl` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `videoUrl` on the `Lesson` table. All the data in the column will be lost.
  - You are about to drop the column `active` on the `MicroLearning` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `MicroLearning` table. All the data in the column will be lost.
  - You are about to alter the column `title` on the `MicroLearning` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(80)`.
  - You are about to drop the column `tasks` on the `OnboardingPlan` table. All the data in the column will be lost.
  - You are about to drop the column `allowances` on the `Payslip` table. All the data in the column will be lost.
  - You are about to drop the column `bonuses` on the `Payslip` table. All the data in the column will be lost.
  - You are about to drop the column `overtime` on the `Payslip` table. All the data in the column will be lost.
  - The `status` column on the `Payslip` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `comment` on the `PerformanceReview` table. All the data in the column will be lost.
  - You are about to drop the column `period` on the `PerformanceReview` table. All the data in the column will be lost.
  - You are about to drop the column `department` on the `Position` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ProcessInstance` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ProcessStep` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ProcessStep` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Training` table. All the data in the column will be lost.
  - You are about to drop the column `duration` on the `TrainingSession` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TrainingSession` table. All the data in the column will be lost.
  - You are about to drop the column `departmentId` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `tipo` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `targetPosition` on the `UserCareerPlan` table. All the data in the column will be lost.
  - The `status` column on the `UserCareerPlan` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `level` on the `UserCompetency` table. All the data in the column will be lost.
  - You are about to drop the `MicroLearningDispatch` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Module` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[employeeId,date,context]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `Certificate` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[internalCode]` on the table `Course` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courseId]` on the table `CourseAnalytics` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courseId,competencyId]` on the table `CourseCompetency` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courseId,userId]` on the table `CourseFeedback` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `Department` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[matricula]` on the table `Employee` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[cpf]` on the table `Employee` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courseId,userId]` on the table `Enrollment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `KnowledgeCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[lessonId,userId]` on the table `LessonProgress` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,cycleId,type]` on the table `PerformanceReview` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `ProcessStandard` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sessionId,userId]` on the table `TrainingParticipant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `Unit` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[employeeNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `role` on the `AiMessage` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `Assessment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `questionText` to the `AssessmentQuestion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `seq` to the `AssessmentQuestion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `AssessmentQuestion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CareerGoal` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `category` on the `CompanyDocument` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `Competency` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Contract` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Course` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `Department` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Department` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `DevelopmentPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `DevelopmentPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ExecutiveReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `evaluatorId` to the `Feedback360` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `InstructorProfile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `KnowledgeCategory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `level` to the `LeadershipProgram` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `LeadershipProgram` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `LearningPath` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetId` to the `LearningPathAssignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetType` to the `LearningPathAssignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `LessonProgress` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contentType` to the `MicroLearning` table without a default value. This is not possible if the table is not empty.
  - Added the required column `level` to the `MicroLearning` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MicroLearning` table without a default value. This is not possible if the table is not empty.
  - Added the required column `templateId` to the `OnboardingPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `OnboardingPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Payslip` table without a default value. This is not possible if the table is not empty.
  - Made the column `incomeTax` on table `Payslip` required. This step will fail if there are existing NULL values in that column.
  - Made the column `socialSecurity` on table `Payslip` required. This step will fail if there are existing NULL values in that column.
  - Made the column `otherDeductions` on table `Payslip` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `cycleId` to the `PerformanceReview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `PerformanceReview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `PerformanceReview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `processVersion` to the `ProcessInstance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `ProcessStandard` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stepOrder` to the `StepProgress` table without a default value. This is not possible if the table is not empty.
  - Added the required column `level` to the `Training` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Training` table without a default value. This is not possible if the table is not empty.
  - Added the required column `durationMinutes` to the `TrainingSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `modality` to the `TrainingSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `Unit` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('INDEFINITE', 'FIXED_TERM', 'UNCERTAIN_TERM', 'APPRENTICESHIP', 'INTERNSHIP', 'SERVICE_PROVISION', 'TEMPORARY_PLACEMENT', 'PART_TIME');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ON_SITE');

-- CreateEnum
CREATE TYPE "SeniorityLevel" AS ENUM ('JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR', 'C_LEVEL');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "SkillType" AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'LEADERSHIP', 'LANGUAGE', 'CERTIFICATION', 'TOOL');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('HIRED', 'PROMOTED', 'TRANSFERRED', 'SALARY_CHANGE', 'COURSE', 'EVALUATION', 'PDI', 'EVENT', 'BADGE', 'DOCUMENT', 'NOTE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('DATA_CHANGE', 'PROMOTION', 'TRANSFER', 'TERMINATION', 'LEAVE', 'BENEFIT_CHANGE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'PARTIAL', 'ABSENT', 'JUSTIFIED', 'REMOTE', 'ON_LEAVE', 'HALF_DAY_AM', 'HALF_DAY_PM', 'RECORDED', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('MANUAL', 'QR_STATIC', 'QR_DYNAMIC', 'GEOLOCATION', 'FACIAL', 'NFC', 'TOKEN', 'VIRTUAL_LINK', 'FACILITATOR');

-- CreateEnum
CREATE TYPE "AttendanceContext" AS ENUM ('WORK', 'EVENT', 'WEBINAR', 'LMS', 'MENTORING', 'PRACTICAL');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK_LEAVE', 'MATERNITY', 'PATERNITY', 'JUSTIFIED_ABSENCE', 'UNJUSTIFIED_ABSENCE', 'BEREAVEMENT', 'TRAINING', 'PUBLIC_DUTY', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('STATUTORY', 'MEDICAL', 'FAMILY', 'TRAINING', 'FLEXIBLE', 'UNPAID', 'DISCIPLINARY', 'OTHER');

-- CreateEnum
CREATE TYPE "DurationMode" AS ENUM ('FULL_DAY', 'HALF_AM', 'HALF_PM', 'HOURS');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT', 'FULL_DAY', 'ROTATING', 'ON_CALL', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPENSATED', 'PAID');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'ISSUED', 'ACKNOWLEDGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'PROCESSING', 'CALCULATED', 'APPROVED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "ComponentCalcType" AS ENUM ('FIXED', 'PERCENT', 'FORMULA', 'TABLE');

-- CreateEnum
CREATE TYPE "DocumentRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'GENERATED', 'ISSUED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WorkDeclStatus" AS ENUM ('DRAFT', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WorkDeclType" AS ENUM ('ONBOARDING', 'PERIODIC', 'EVENT', 'RESIGNATION', 'EXIT_INTERVIEW', 'DIVERSITY', 'COMPLIANCE', 'GENERAL');

-- CreateEnum
CREATE TYPE "TemplateLanguage" AS ENUM ('PT', 'EN', 'FR');

-- CreateEnum
CREATE TYPE "PurposeCategory" AS ENUM ('FINANCIAL', 'LEGAL', 'PERSONAL', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocCategoryType" AS ENUM ('PERSONAL', 'LABOUR', 'LEARNING', 'CORPORATE', 'RECRUITMENT', 'COMPLIANCE', 'HEALTH', 'PAYROLL', 'LEAVE', 'POLITICA', 'MANUAL', 'PROCEDIMENTO', 'FORMULARIO', 'CONTRATO', 'REGULAMENTO', 'COMUNICADO', 'OTHER', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocSensitivity" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'SECRET');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ShareLinkAccess" AS ENUM ('VIEW_ONLY', 'VIEW_DOWNLOAD');

-- CreateEnum
CREATE TYPE "CareerPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CareerPathType" AS ENUM ('LINEAR', 'Y_SHAPED', 'W_SHAPED', 'HORIZONTAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "ReadinessLevel" AS ENUM ('READY', 'DEVELOPING', 'STARTING');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('COURSE', 'PROJECT', 'MENTORING', 'CERTIFICATION', 'SKILL', 'OTHER');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssessmentSource" AS ENUM ('SELF', 'MANAGER', 'HR', 'PEER_360', 'TEST', 'PROJECT', 'CERTIFICATION', 'COURSE');

-- CreateEnum
CREATE TYPE "GapPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
ALTER TYPE "CertificateType" ADD VALUE 'TRAINING';

-- DropForeignKey
ALTER TABLE "AiMessage" DROP CONSTRAINT "AiMessage_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Assessment" DROP CONSTRAINT "Assessment_courseId_fkey";

-- DropForeignKey
ALTER TABLE "AssessmentAttempt" DROP CONSTRAINT "AssessmentAttempt_assessmentId_fkey";

-- DropForeignKey
ALTER TABLE "AssessmentAttempt" DROP CONSTRAINT "AssessmentAttempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "DevelopmentPlan" DROP CONSTRAINT "DevelopmentPlan_userId_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_courseId_fkey";

-- DropForeignKey
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_userId_fkey";

-- DropForeignKey
ALTER TABLE "EventParticipant" DROP CONSTRAINT "EventParticipant_eventId_fkey";

-- DropForeignKey
ALTER TABLE "InstructorProfile" DROP CONSTRAINT "InstructorProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "KnowledgeArticle" DROP CONSTRAINT "KnowledgeArticle_authorId_fkey";

-- DropForeignKey
ALTER TABLE "KnowledgeInteraction" DROP CONSTRAINT "KnowledgeInteraction_userId_fkey";

-- DropForeignKey
ALTER TABLE "KnowledgeTag" DROP CONSTRAINT "KnowledgeTag_userId_fkey";

-- DropForeignKey
ALTER TABLE "LeadershipParticipant" DROP CONSTRAINT "LeadershipParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "LearningPathAssignment" DROP CONSTRAINT "LearningPathAssignment_learningPathId_fkey";

-- DropForeignKey
ALTER TABLE "LearningPathAssignment" DROP CONSTRAINT "LearningPathAssignment_unitId_fkey";

-- DropForeignKey
ALTER TABLE "LearningPathCourse" DROP CONSTRAINT "LearningPathCourse_courseId_fkey";

-- DropForeignKey
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_moduleId_fkey";

-- DropForeignKey
ALTER TABLE "LessonProgress" DROP CONSTRAINT "LessonProgress_enrollmentId_fkey";

-- DropForeignKey
ALTER TABLE "MicroLearningDispatch" DROP CONSTRAINT "MicroLearningDispatch_microLearningId_fkey";

-- DropForeignKey
ALTER TABLE "MicroLearningDispatch" DROP CONSTRAINT "MicroLearningDispatch_userId_fkey";

-- DropForeignKey
ALTER TABLE "Module" DROP CONSTRAINT "Module_courseId_fkey";

-- DropForeignKey
ALTER TABLE "PositionCompetency" DROP CONSTRAINT "PositionCompetency_competencyId_fkey";

-- DropForeignKey
ALTER TABLE "PositionCompetency" DROP CONSTRAINT "PositionCompetency_positionId_fkey";

-- DropForeignKey
ALTER TABLE "ProcessStandard" DROP CONSTRAINT "ProcessStandard_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "ProcessStep" DROP CONSTRAINT "ProcessStep_responsibleId_fkey";

-- DropForeignKey
ALTER TABLE "Training" DROP CONSTRAINT "Training_instructorId_fkey";

-- DropForeignKey
ALTER TABLE "TrainingParticipant" DROP CONSTRAINT "TrainingParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "Unit" DROP CONSTRAINT "Unit_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "UserCareerPlan" DROP CONSTRAINT "UserCareerPlan_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserCompetency" DROP CONSTRAINT "UserCompetency_competencyId_fkey";

-- DropForeignKey
ALTER TABLE "UserCompetency" DROP CONSTRAINT "UserCompetency_userId_fkey";

-- DropIndex
DROP INDEX "CareerGoal_careerPlanId_idx";

-- DropIndex
DROP INDEX "Department_name_idx";

-- DropIndex
DROP INDEX "LessonProgress_enrollmentId_lessonId_key";

-- DropIndex
DROP INDEX "PositionCompetency_competencyId_idx";

-- DropIndex
DROP INDEX "PositionCompetency_positionId_competencyId_key";

-- DropIndex
DROP INDEX "PositionCompetency_positionId_idx";

-- DropIndex
DROP INDEX "UserCareerPlan_status_idx";

-- DropIndex
DROP INDEX "UserCareerPlan_userId_idx";

-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "agentAction" TEXT,
ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "ratingFeedback" TEXT,
DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Assessment" DROP COLUMN "passScore",
ADD COLUMN     "allowReview" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cooldownHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "feedbackMode" TEXT NOT NULL DEFAULT 'ON_SUBMIT',
ADD COLUMN     "learningPathId" INTEGER,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "moduleId" INTEGER,
ADD COLUMN     "passingScore" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "randomizeOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "randomizeQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "timeLimitMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'QUIZ',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "courseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AssessmentAttempt" DROP COLUMN "createdAt",
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "lastSavedAt" TIMESTAMP(3),
ADD COLUMN     "needsManualReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "questionOrder" TEXT,
ADD COLUMN     "savedAnswers" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "timeSpentMinutes" INTEGER,
ALTER COLUMN "score" DROP NOT NULL,
ALTER COLUMN "score" SET DATA TYPE INTEGER,
ALTER COLUMN "passed" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AssessmentQuestion" DROP COLUMN "correctIndex",
DROP COLUMN "question",
ADD COLUMN     "correctAnswer" TEXT,
ADD COLUMN     "difficulty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaUrl" TEXT,
ADD COLUMN     "questionText" TEXT NOT NULL,
ADD COLUMN     "seq" INTEGER NOT NULL,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "type" TEXT NOT NULL,
ALTER COLUMN "options" DROP NOT NULL,
ALTER COLUMN "options" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "breakMinutes" INTEGER DEFAULT 0,
ADD COLUMN     "clockIn" TEXT,
ADD COLUMN     "clockInAt" TIMESTAMP(3),
ADD COLUMN     "clockOut" TEXT,
ADD COLUMN     "clockOutAt" TIMESTAMP(3),
ADD COLUMN     "context" "AttendanceContext" NOT NULL DEFAULT 'WORK',
ADD COLUMN     "courseId" INTEGER,
ADD COLUMN     "deviceInfo" TEXT,
ADD COLUMN     "eventId" INTEGER,
ADD COLUMN     "facialValidated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "justification" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "leaveRequestId" INTEGER,
ADD COLUMN     "locationLabel" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "method" "CheckInMethod" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "overtimeMinutes" INTEGER DEFAULT 0,
ADD COLUMN     "presencePercent" DOUBLE PRECISION,
ADD COLUMN     "selfieUrl" TEXT,
ADD COLUMN     "sessionId" INTEGER,
ADD COLUMN     "shiftId" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "workMinutes" INTEGER DEFAULT 0,
ALTER COLUMN "hoursWorked" DROP NOT NULL,
ALTER COLUMN "hoursWorked" SET DEFAULT 0,
DROP COLUMN "status",
ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "after" TEXT,
ADD COLUMN     "before" TEXT,
ADD COLUMN     "changes" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "entityName" TEXT,
ADD COLUMN     "hash" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "previousHash" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "severity" TEXT,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "CareerGoal" DROP COLUMN "category",
ADD COLUMN     "courseId" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "resourceUrl" TEXT,
ADD COLUMN     "skillId" INTEGER,
ADD COLUMN     "type" "GoalType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "GoalStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "CareerPlan" ADD COLUMN     "progressPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "targetRole" TEXT,
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "code" TEXT,
ADD COLUMN     "courseId" INTEGER,
ADD COLUMN     "eventId" INTEGER,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "CompanyDocument" DROP COLUMN "category",
ADD COLUMN     "category" "DocCategoryType" NOT NULL;

-- AlterTable
ALTER TABLE "Competency" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'HARD_SKILL',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "salary" DOUBLE PRECISION,
ADD COLUMN     "type" "ContractType" NOT NULL,
ALTER COLUMN "endDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Course" DROP COLUMN "active",
ADD COLUMN     "allowDownload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certificateValidityDays" INTEGER,
ADD COLUMN     "departmentId" INTEGER,
ADD COLUMN     "internalCode" TEXT,
ADD COLUMN     "introVideoUrl" TEXT,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'pt',
ADD COLUMN     "learningObjectives" TEXT[],
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'BEGINNER',
ADD COLUMN     "passingScore" INTEGER,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "shortDescription" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "CourseAnalytics" DROP COLUMN "avgScore",
ADD COLUMN     "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalRatings" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "totalEnrollments" SET DEFAULT 0,
ALTER COLUMN "totalCompleted" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "CourseCompetency" ADD COLUMN     "levelGained" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "annualBudget" DOUBLE PRECISION,
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "costCenter" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "headId" INTEGER,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "parentId" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "trainingBudget" INTEGER,
ADD COLUMN     "unitId" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "DevelopmentPlan" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managerId" INTEGER,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "overallProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "performanceCycleId" INTEGER,
ADD COLUMN     "period" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "address" JSONB,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "contractType" "ContractType",
ADD COLUMN     "costCenter" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "emergencyContact" JSONB,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "managerId" INTEGER,
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "matricula" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "salary" DOUBLE PRECISION,
ADD COLUMN     "salaryBand" TEXT,
ADD COLUMN     "seniority" "SeniorityLevel",
ADD COLUMN     "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "team" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "workMode" "WorkMode";

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "assignedById" INTEGER,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "learningPathId" INTEGER,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'NOT_STARTED';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "certificateEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "courseId" INTEGER,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxCapacity" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "meetingPassword" TEXT,
ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "minAttendancePercent" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "modalidade" TEXT NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'TRAINING',
ADD COLUMN     "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedOutAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ExecutiveMetric" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "previousValue" DOUBLE PRECISION,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "target" DOUBLE PRECISION,
ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "ExecutiveReport" ADD COLUMN     "achievements" TEXT[],
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "confidentiality" TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
ADD COLUMN     "narrative" TEXT,
ADD COLUMN     "nextSteps" TEXT[],
ADD COLUMN     "period" TEXT,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "recommendations" TEXT[],
ADD COLUMN     "risks" TEXT[],
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Feedback360" DROP COLUMN "evaluatorName",
ADD COLUMN     "anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cycle" TEXT,
ADD COLUMN     "evaluatorId" INTEGER NOT NULL,
ADD COLUMN     "improvements" TEXT,
ADD COLUMN     "strengths" TEXT;

-- AlterTable
ALTER TABLE "InstructorProfile" ADD COLUMN     "availableForMentoring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hourlyRate" DOUBLE PRECISION,
ADD COLUMN     "instructorType" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "KnowledgeArticle" DROP COLUMN "description",
ADD COLUMN     "accessLevel" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "avgRating" DOUBLE PRECISION,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "readingMinutes" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "restrictedDepartmentId" INTEGER,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "KnowledgeCategory" ADD COLUMN     "color" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "parentId" INTEGER,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "KnowledgeTag" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "LeadershipParticipant" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "LeadershipProgram" DROP COLUMN "active",
ADD COLUMN     "durationWeeks" INTEGER,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "learningPathId" INTEGER,
ADD COLUMN     "level" TEXT NOT NULL,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minLeadershipScore" INTEGER,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "LearningPath" ADD COLUMN     "category" TEXT,
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'pt',
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'BEGINNER',
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "pathType" TEXT NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "progressionType" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "shortDescription" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "totalHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "LearningPathAssignment" DROP COLUMN "role",
DROP COLUMN "unitId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetId" INTEGER NOT NULL,
ADD COLUMN     "targetType" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "LearningPathCourse" ADD COLUMN     "deadlineDays" INTEGER,
ADD COLUMN     "milestoneId" INTEGER,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Lesson" DROP COLUMN "contentType",
DROP COLUMN "pdfUrl",
DROP COLUMN "videoUrl",
ADD COLUMN     "allowDownload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "content" TEXT,
ADD COLUMN     "contentUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "textContent" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'VIDEO';

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "resumePosition" INTEGER,
ADD COLUMN     "userId" INTEGER NOT NULL,
ADD COLUMN     "watchedSeconds" INTEGER,
ALTER COLUMN "enrollmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MarketplaceCourse" ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "workloadHours" INTEGER;

-- AlterTable
ALTER TABLE "MicroLearning" DROP COLUMN "active",
DROP COLUMN "content",
ADD COLUMN     "authorId" INTEGER,
ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "contentType" TEXT NOT NULL,
ADD COLUMN     "description" VARCHAR(200),
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "learningPathId" INTEGER,
ADD COLUMN     "level" TEXT NOT NULL,
ADD COLUMN     "mediaUrl" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "takeaways" TEXT[],
ADD COLUMN     "textContent" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xpReward" INTEGER NOT NULL DEFAULT 10,
ALTER COLUMN "title" SET DATA TYPE VARCHAR(80);

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "actionLabel" TEXT,
ADD COLUMN     "actionUrl" TEXT,
ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "metadata" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT,
ALTER COLUMN "success" SET DEFAULT true;

-- AlterTable
ALTER TABLE "OnboardingPlan" DROP COLUMN "tasks",
ADD COLUMN     "buddyId" INTEGER,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "expectedEndDate" TIMESTAMP(3),
ADD COLUMN     "hrResponsibleId" INTEGER,
ADD COLUMN     "managerId" INTEGER,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "templateId" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "xpEarned" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payslip" DROP COLUMN "allowances",
DROP COLUMN "bonuses",
DROP COLUMN "overtime",
ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'AO',
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "employerSocialSecurity" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "runId" INTEGER,
ADD COLUMN     "taxBracket" TEXT,
ADD COLUMN     "totalEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalEmployerCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "incomeTax" SET NOT NULL,
ALTER COLUMN "incomeTax" SET DEFAULT 0,
ALTER COLUMN "socialSecurity" SET NOT NULL,
ALTER COLUMN "socialSecurity" SET DEFAULT 0,
ALTER COLUMN "otherDeductions" SET NOT NULL,
ALTER COLUMN "otherDeductions" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "PerformanceReview" DROP COLUMN "comment",
DROP COLUMN "period",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "cycleId" INTEGER NOT NULL,
ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "justification" TEXT,
ADD COLUMN     "potentialScore" INTEGER,
ADD COLUMN     "reviewerId" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING_SELF',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "score" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Position" DROP COLUMN "department",
ADD COLUMN     "code" TEXT,
ADD COLUMN     "departmentId" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "headcountPlanned" INTEGER DEFAULT 1,
ADD COLUMN     "salaryMax" DOUBLE PRECISION,
ADD COLUMN     "salaryMin" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PositionCompetency" ADD COLUMN     "careerPositionId" INTEGER,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MANDATORY',
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
ALTER COLUMN "positionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProcessInstance" DROP COLUMN "createdAt",
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "processVersion" TEXT NOT NULL,
ADD COLUMN     "slaDeadline" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ProcessStandard" ADD COLUMN     "category" TEXT,
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "defaultSlaHours" DOUBLE PRECISION,
ADD COLUMN     "departmentId" INTEGER,
ADD COLUMN     "estimatedMinutes" DOUBLE PRECISION,
ADD COLUMN     "nextReviewDate" TIMESTAMP(3),
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "version" TEXT NOT NULL DEFAULT '1.0';

-- AlterTable
ALTER TABLE "ProcessStep" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "checklist" TEXT[],
ADD COLUMN     "estimatedMinutes" DOUBLE PRECISION,
ADD COLUMN     "exitConditions" TEXT,
ADD COLUMN     "formSchema" TEXT,
ADD COLUMN     "requiresUpload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsibleRole" TEXT,
ADD COLUMN     "slaHours" DOUBLE PRECISION,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'TASK',
ALTER COLUMN "responsibleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "careerGoals" TEXT,
ADD COLUMN     "interests" TEXT[],
ADD COLUMN     "linkedinUrl" TEXT,
ALTER COLUMN "bio" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StepProgress" ADD COLUMN     "action" TEXT,
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "evidenceIds" INTEGER[],
ADD COLUMN     "formData" TEXT,
ADD COLUMN     "slaDeadline" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "stepOrder" INTEGER NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'WAITING';

-- AlterTable
ALTER TABLE "Training" DROP COLUMN "location",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "completionDeadlineDays" INTEGER,
ADD COLUMN     "cost" DOUBLE PRECISION,
ADD COLUMN     "issueCertificate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'pt',
ADD COLUMN     "level" TEXT NOT NULL,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "objectives" TEXT,
ADD COLUMN     "passingScore" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "prerequisites" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "shortDescription" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "targetAudience" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "workloadHours" DOUBLE PRECISION,
ALTER COLUMN "startDate" DROP NOT NULL,
ALTER COLUMN "endDate" DROP NOT NULL,
ALTER COLUMN "instructorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TrainingParticipant" ADD COLUMN     "attendedHours" DOUBLE PRECISION,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "finalScore" DOUBLE PRECISION,
ADD COLUMN     "trainingId" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'REGISTERED';

-- AlterTable
ALTER TABLE "TrainingSession" DROP COLUMN "duration",
DROP COLUMN "updatedAt",
ADD COLUMN     "durationMinutes" INTEGER NOT NULL,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "maxParticipants" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "modality" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sessionEndDate" TIMESTAMP(3),
ADD COLUMN     "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Unit" DROP COLUMN "departmentId",
DROP COLUMN "tipo",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'BRANCH';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "exitDate" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "hireDate" TIMESTAMP(3),
ADD COLUMN     "hrStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'pt',
ADD COLUMN     "managerId" INTEGER,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Luanda',
ALTER COLUMN "password" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserCareerPlan" DROP COLUMN "targetPosition",
ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "careerPathId" INTEGER,
ADD COLUMN     "currentRoleId" INTEGER,
ADD COLUMN     "targetRoleId" INTEGER,
DROP COLUMN "status",
ADD COLUMN     "status" "CareerPlanStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "UserCompetency" DROP COLUMN "level",
ADD COLUMN     "currentLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "evidenceUrl" TEXT,
ADD COLUMN     "managerLevel" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "selfLevel" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "targetLevel" INTEGER;

-- DropTable
DROP TABLE "MicroLearningDispatch";

-- DropTable
DROP TABLE "Module";

-- DropEnum
DROP TYPE "DocCategory";

-- DropEnum
DROP TYPE "EnrollmentStatus";

-- DropEnum
DROP TYPE "LessonContentType";

-- CreateTable
CREATE TABLE "UserAuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "performedById" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentHeadHistory" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "headId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "DepartmentHeadHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentTransferLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromDepartmentId" INTEGER,
    "toDepartmentId" INTEGER NOT NULL,
    "reason" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentTransferLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgChangeLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "changeType" TEXT NOT NULL,
    "fromDepartmentId" INTEGER,
    "toDepartmentId" INTEGER,
    "fromPositionId" INTEGER,
    "toPositionId" INTEGER,
    "fromManagerId" INTEGER,
    "toManagerId" INTEGER,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "performedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerRole" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT NOT NULL,
    "seniority" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "parentRoleId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerSkill" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "SkillType" NOT NULL,
    "category" TEXT,
    "maxLevel" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPath" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CareerPathType" NOT NULL,
    "department" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPathStep" (
    "id" SERIAL NOT NULL,
    "pathId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT,

    CONSTRAINT "CareerPathStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressionRule" (
    "id" SERIAL NOT NULL,
    "fromRoleId" INTEGER NOT NULL,
    "toRoleId" INTEGER NOT NULL,
    "minMonthsInRole" INTEGER,
    "minPerformanceScore" DOUBLE PRECISION,
    "minCompletedProjects" INTEGER,
    "requiresManagerApproval" BOOLEAN NOT NULL DEFAULT true,
    "requiresHrApproval" BOOLEAN NOT NULL DEFAULT true,
    "requiresCommitteeApproval" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "targetRoleId" INTEGER NOT NULL,
    "careerPlanId" INTEGER,
    "justification" TEXT NOT NULL,
    "readinessScore" DOUBLE PRECISION,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "requestedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentPlanAction" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "courseId" INTEGER,
    "workloadHours" INTEGER,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resources" TEXT[],
    "xpReward" INTEGER NOT NULL DEFAULT 20,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevelopmentPlanAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdiEvidence" (
    "id" SERIAL NOT NULL,
    "actionId" INTEGER NOT NULL,
    "submittedById" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "evidenceType" TEXT NOT NULL DEFAULT 'NOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdiEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdiGoal" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "successIndicator" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdiGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdiCheckpoint" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'QUICK',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "selfScore" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdiCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdiApproval" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "approverId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdiApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "learningObjectives" TEXT[],
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "type" TEXT,
    "progressionType" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    "completionRule" TEXT NOT NULL DEFAULT 'ALL_LESSONS',
    "minCompletionPercent" INTEGER NOT NULL DEFAULT 100,
    "minQuizScore" INTEGER,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "dripDays" INTEGER,
    "availableFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleMaterial" (
    "id" SERIAL NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSizeKb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" SERIAL NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "maxAttempts" INTEGER NOT NULL DEFAULT 0,
    "timeLimitMinutes" INTEGER,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" SERIAL NOT NULL,
    "quizId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT,
    "correctAnswer" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" SERIAL NOT NULL,
    "quizId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answers" TEXT NOT NULL,
    "results" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPathMilestone" (
    "id" SERIAL NOT NULL,
    "learningPathId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "LearningPathMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPathEnrollment" (
    "id" SERIAL NOT NULL,
    "learningPathId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LearningPathEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttemptAnswer" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "selectedIndices" TEXT,
    "textAnswer" TEXT,
    "fileUrl" TEXT,
    "isCorrect" BOOLEAN,
    "earnedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "manualScore" DOUBLE PRECISION,
    "reviewComment" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentAttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyLevel" (
    "id" SERIAL NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "ProficiencyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyEvolutionLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "previousLevel" INTEGER NOT NULL,
    "newLevel" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetencyEvolutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyEndorsement" (
    "id" SERIAL NOT NULL,
    "endorserId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetencyEndorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceCycle" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "selfEvalDeadline" TIMESTAMP(3),
    "managerEvalDeadline" TIMESTAMP(3),
    "goalsWeight" INTEGER NOT NULL DEFAULT 40,
    "competenciesWeight" INTEGER NOT NULL DEFAULT 40,
    "behaviorsWeight" INTEGER NOT NULL DEFAULT 20,
    "selfBeforeManager" BOOLEAN NOT NULL DEFAULT true,
    "anonymous360" BOOLEAN NOT NULL DEFAULT true,
    "scoreScale" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceGoal" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "cycleId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalEvaluation" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "goalId" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,

    CONSTRAINT "GoalEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyEvaluation" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "evaluatedLevel" INTEGER NOT NULL,
    "feedback" TEXT,

    CONSTRAINT "CompetencyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContinuousFeedback" (
    "id" SERIAL NOT NULL,
    "giverId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "cycleId" INTEGER,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "visibleToUser" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContinuousFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationLog" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "calibratorId" INTEGER NOT NULL,
    "previousScore" DOUBLE PRECISION,
    "calibratedScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceDispute" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NineBoxPlacement" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "cycleId" INTEGER,
    "performanceAxis" INTEGER NOT NULL,
    "potentialAxis" INTEGER NOT NULL,
    "justification" TEXT NOT NULL,
    "updatedById" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NineBoxPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneOnOne" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "subordinateId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "agenda" TEXT,
    "meetingUrl" TEXT,
    "minutes" TEXT,
    "actionItems" TEXT,
    "nextMeetingDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneOnOne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipFeedback360" (
    "id" SERIAL NOT NULL,
    "leaderId" INTEGER NOT NULL,
    "respondentId" INTEGER,
    "cycleId" INTEGER,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "qualitativeFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadershipFeedback360_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipFeedback360Response" (
    "id" SERIAL NOT NULL,
    "feedbackId" INTEGER NOT NULL,
    "competency" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "LeadershipFeedback360Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipPulse" (
    "id" SERIAL NOT NULL,
    "leaderId" INTEGER NOT NULL,
    "respondentId" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "q1" TEXT,
    "q2" TEXT,
    "q3" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadershipPulse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipScore" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "classification" TEXT NOT NULL DEFAULT 'AVERAGE',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadershipScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mentoring" (
    "id" SERIAL NOT NULL,
    "mentorId" INTEGER NOT NULL,
    "menteeId" INTEGER NOT NULL,
    "objective" TEXT,
    "durationMonths" INTEGER,
    "reverseMentoring" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Mentoring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentoringSession" (
    "id" SERIAL NOT NULL,
    "mentoringId" INTEGER NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "summary" TEXT NOT NULL,
    "actionItems" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentoringSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamHealth" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "engagementScore" DOUBLE PRECISION,
    "turnoverRate" DOUBLE PRECISION,
    "absenteeismRate" DOUBLE PRECISION,
    "pdisCompletedPct" DOUBLE PRECISION,
    "evaluationsOnTimePct" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kudos" (
    "id" SERIAL NOT NULL,
    "senderId" INTEGER NOT NULL,
    "receiverId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "badge" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kudos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "positionId" INTEGER,
    "departmentId" INTEGER,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "learningPathId" INTEGER,
    "welcomeVideoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplateTask" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "dueDayOffset" INTEGER,
    "dependsOn" INTEGER[],
    "courseId" INTEGER,
    "processId" INTEGER,
    "xpReward" INTEGER NOT NULL DEFAULT 10,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "OnboardingTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTaskInstance" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "templateTaskId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "evidenceComment" TEXT,
    "evidenceUrl" TEXT,
    "skipReason" TEXT,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "approvalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingTaskInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingDocument" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadedById" INTEGER NOT NULL,
    "validatedById" INTEGER,
    "validatedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingSurvey" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "milestone" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "enps" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroQuizQuestion" (
    "id" SERIAL NOT NULL,
    "microLearningId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "explanation" TEXT,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "MicroQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroLearningProgress" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "microLearningId" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicroLearningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroLearningInteraction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "microLearningId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicroLearningInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroQuizAttempt" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "microLearningId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "answers" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicroQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroLearningPlaylist" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "authorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicroLearningPlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "id" SERIAL NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "microLearningId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningStreak" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TIMESTAMP(3),

    CONSTRAINT "LearningStreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRating" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "trainingId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleRating" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleComment" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleQuestion" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "askedById" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" INTEGER,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleVersion" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleAcknowledgement" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSearchLog" (
    "id" SERIAL NOT NULL,
    "query" TEXT NOT NULL,
    "userId" INTEGER,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeSearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessVersion" (
    "id" SERIAL NOT NULL,
    "processId" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessApprovalLog" (
    "id" SERIAL NOT NULL,
    "processId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessAuditLog" (
    "id" SERIAL NOT NULL,
    "processId" INTEGER,
    "instanceId" INTEGER,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "meta" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipItem" (
    "id" SERIAL NOT NULL,
    "payslipId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "calcType" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayslipItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipAccessLog" (
    "id" SERIAL NOT NULL,
    "payslipId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipDispute" (
    "id" SERIAL NOT NULL,
    "payslipId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "PayslipDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryConfig" (
    "id" SERIAL NOT NULL,
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "minimumWage" DOUBLE PRECISION NOT NULL,
    "defaultFoodAllowance" DOUBLE PRECISION,
    "defaultTransportAllowance" DOUBLE PRECISION,
    "socialSecurity" JSONB NOT NULL,
    "healthInsuranceRate" DOUBLE PRECISION,
    "unionFeeRate" DOUBLE PRECISION,
    "guaranteeFundRate" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IrtBracket" (
    "id" SERIAL NOT NULL,
    "configId" INTEGER NOT NULL,
    "min" DOUBLE PRECISION NOT NULL,
    "max" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION NOT NULL,
    "deduction" DOUBLE PRECISION,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IrtBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ComponentType" NOT NULL,
    "calcType" "ComponentCalcType" NOT NULL,
    "fixedValue" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "formula" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "countryCode" TEXT DEFAULT 'AO',
    "bankName" TEXT,
    "iban" TEXT,
    "accountNumber" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "foodAllowance" DOUBLE PRECISION,
    "transportAllowance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensationComponent" (
    "id" SERIAL NOT NULL,
    "compensationId" INTEGER NOT NULL,
    "componentCode" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "override" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmployeeCompensationComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" SERIAL NOT NULL,
    "period" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'AO',
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "totalGross" DOUBLE PRECISION,
    "processedAt" TIMESTAMP(3),
    "processedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "approvedById" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocCategoryModel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "DocCategoryType" NOT NULL,
    "retentionYears" INTEGER,
    "defaultSensitivity" "DocSensitivity" NOT NULL DEFAULT 'INTERNAL',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocCategoryModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DocCategoryType" NOT NULL,
    "categoryId" INTEGER,
    "sensitivity" "DocSensitivity" NOT NULL DEFAULT 'INTERNAL',
    "status" "DocStatus" NOT NULL DEFAULT 'ACTIVE',
    "origin" TEXT NOT NULL DEFAULT 'UPLOAD',
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileName" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "tags" TEXT[],
    "ocrText" TEXT,
    "ocrStatus" TEXT,
    "createdById" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "department" TEXT,
    "expiresAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deleteReason" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileName" TEXT,
    "changeDescription" TEXT NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocPermission" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER,
    "department" TEXT,
    "permissions" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "grantedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocShareLink" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "access" "ShareLinkAccess" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "passwordHash" TEXT,
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocDownload" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocAuditLog" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorCohort" (
    "id" SERIAL NOT NULL,
    "instructorId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "modalidade" TEXT NOT NULL DEFAULT 'ONLINE',
    "maxParticipants" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorCohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortParticipant" (
    "id" SERIAL NOT NULL,
    "cohortId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "CohortParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT false,
    "slack" BOOLEAN NOT NULL DEFAULT false,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "quietHourStart" INTEGER NOT NULL DEFAULT 22,
    "quietHourEnd" INTEGER NOT NULL DEFAULT 8,
    "digestFrequency" TEXT NOT NULL DEFAULT 'NONE',
    "disabledCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "titleTemplate" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT,
    "actionUrlTemplate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportApproval" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "approverId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAccessLog" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTutorMemory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTutorMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFeedback" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "nps" INTEGER NOT NULL,
    "rating" INTEGER,
    "instructorRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationMode" "DurationMode" NOT NULL DEFAULT 'FULL_DAY',
    "hours" DOUBLE PRECISION,
    "workDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calendarDays" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "attachments" TEXT[],
    "substituteId" INTEGER,
    "finalApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leaveTypeCode" TEXT,
    "reviewNotes" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "halfDayPeriod" TEXT,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApproval" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "approverId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "decision" TEXT,
    "notes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalanceHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "balanceBefore" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "change" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "requestId" INTEGER,
    "updatedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaveTypeCode" TEXT,

    CONSTRAINT "LeaveBalanceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveDocument" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveImpactPreview" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "affectedCourses" INTEGER NOT NULL DEFAULT 0,
    "affectedEvents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveImpactPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type_configs" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "annualLimit" INTEGER,
    "allowCarryOver" BOOLEAN NOT NULL DEFAULT false,
    "carryOverLimit" INTEGER,
    "countWorkDaysOnly" BOOLEAN NOT NULL DEFAULT true,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveUnderDays" INTEGER,
    "minNoticeDays" INTEGER,
    "maxConsecutiveDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT,
    "seniority" TEXT,
    "approvalLevels" INTEGER NOT NULL DEFAULT 1,
    "maxAbsencePercent" INTEGER NOT NULL DEFAULT 30,
    "blackoutPeriods" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceJustification" (
    "id" SERIAL NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "attachments" TEXT[],
    "leaveType" "LeaveType",
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordId" INTEGER,

    CONSTRAINT "AttendanceJustification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "context" TEXT NOT NULL DEFAULT 'WORK',
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "clockIn" TEXT,
    "clockOut" TEXT,
    "clockInAt" TIMESTAMP(3),
    "clockOutAt" TIMESTAMP(3),
    "breakMinutes" INTEGER DEFAULT 0,
    "workMinutes" INTEGER DEFAULT 0,
    "hoursWorked" DOUBLE PRECISION DEFAULT 0,
    "overtimeMinutes" INTEGER DEFAULT 0,
    "presencePercent" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationLabel" TEXT,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "selfieUrl" TEXT,
    "facialValidated" BOOLEAN NOT NULL DEFAULT false,
    "eventId" INTEGER,
    "courseId" INTEGER,
    "sessionId" INTEGER,
    "leaveRequestId" INTEGER,
    "justification" TEXT,
    "notes" TEXT,
    "shiftId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceAdjustment" (
    "id" SERIAL NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "adjustedById" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordId" INTEGER,

    CONSTRAINT "AttendanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shiftType" "ShiftType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER DEFAULT 60,
    "toleranceMinutes" INTEGER DEFAULT 10,
    "minPresencePercent" DOUBLE PRECISION DEFAULT 75,
    "workDays" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSchedule" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "overtimeMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "compensateWithTime" BOOLEAN NOT NULL DEFAULT true,
    "compensated" BOOLEAN NOT NULL DEFAULT false,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "attendanceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OvertimeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedLocation" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSkill" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "assessorId" INTEGER,
    "skillName" TEXT NOT NULL,
    "level" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skillId" INTEGER,
    "currentLevel" INTEGER,
    "desiredLevel" INTEGER,
    "source" TEXT,
    "notes" TEXT,
    "assessedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyPdi" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyPdi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyPdiAction" (
    "id" SERIAL NOT NULL,
    "pdiId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "resourceType" TEXT,
    "resourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyPdiAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "uploadedById" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTimeline" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" "TimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfServiceRequest" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" "RequestType" NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "attachments" TEXT[],
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelfServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "family" TEXT,
    "domain" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "SkillType" NOT NULL,
    "categoryId" INTEGER,
    "tags" TEXT[],
    "strategicWeight" DOUBLE PRECISION DEFAULT 1.0,
    "maxLevel" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillProficiencyLevel" (
    "id" SERIAL NOT NULL,
    "skillId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "observableBehavior" TEXT NOT NULL,
    "expectedMonths" INTEGER,

    CONSTRAINT "SkillProficiencyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleSkillMatrix" (
    "id" SERIAL NOT NULL,
    "roleCode" TEXT NOT NULL,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleSkillMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleSkillRequirement" (
    "id" SERIAL NOT NULL,
    "matrixId" INTEGER NOT NULL,
    "skillId" INTEGER NOT NULL,
    "careerRoleId" INTEGER,
    "requiredLevel" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoleSkillRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyEmployeeSkill" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "employeeId" INTEGER,
    "skillId" INTEGER NOT NULL,
    "currentLevel" INTEGER NOT NULL,
    "targetLevel" INTEGER,
    "source" "AssessmentSource" NOT NULL DEFAULT 'SELF',
    "assessedById" INTEGER,
    "managerValidated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "evidenceUrl" TEXT,
    "assessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyEmployeeSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillAssessmentHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "skillId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "source" "AssessmentSource" NOT NULL,
    "assessedById" INTEGER,
    "notes" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillAssessmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationPurpose" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "PurposeCategory" NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeclarationPurpose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purposeId" INTEGER,
    "language" "TemplateLanguage" NOT NULL DEFAULT 'PT',
    "content" TEXT NOT NULL,
    "variables" TEXT[],
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "autoGenerate" BOOLEAN NOT NULL DEFAULT false,
    "validDays" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeclarationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "purposeId" INTEGER,
    "language" "TemplateLanguage" NOT NULL DEFAULT 'PT',
    "addressedTo" TEXT,
    "observations" TEXT,
    "extraVariables" JSONB,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "generatedContent" TEXT,
    "referenceNumber" TEXT,
    "verificationCode" TEXT,
    "generatedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeclarationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationApproval" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "reviewerId" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclarationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDeclForm" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "WorkDeclType" NOT NULL,
    "periodicity" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "requiresDigitalSignature" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "targetAllEmployees" BOOLEAN NOT NULL DEFAULT true,
    "targetDepartments" TEXT[],
    "targetRoles" TEXT[],
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkDeclForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDeclQuestion" (
    "id" SERIAL NOT NULL,
    "formId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "fieldType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[],
    "conditionalKey" TEXT,
    "conditionalValue" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "placeholder" TEXT,
    "validationRegex" TEXT,
    "acceptedFileTypes" TEXT[],

    CONSTRAINT "WorkDeclQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDeclSubmission" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "formId" INTEGER NOT NULL,
    "status" "WorkDeclStatus" NOT NULL DEFAULT 'PENDING',
    "signature" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "exemptionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkDeclSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDeclAnswer" (
    "userId" INTEGER,
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "questionId" INTEGER,
    "questionKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkDeclAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDeclReview" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "reviewerId" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "notes" TEXT,
    "correctionFields" TEXT[],
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkDeclReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAuditLog_userId_idx" ON "UserAuditLog"("userId");

-- CreateIndex
CREATE INDEX "UserAuditLog_createdAt_idx" ON "UserAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "DepartmentTransferLog_userId_idx" ON "DepartmentTransferLog"("userId");

-- CreateIndex
CREATE INDEX "DepartmentTransferLog_toDepartmentId_idx" ON "DepartmentTransferLog"("toDepartmentId");

-- CreateIndex
CREATE INDEX "OrgChangeLog_userId_idx" ON "OrgChangeLog"("userId");

-- CreateIndex
CREATE INDEX "OrgChangeLog_changeType_idx" ON "OrgChangeLog"("changeType");

-- CreateIndex
CREATE INDEX "OrgChangeLog_effectiveDate_idx" ON "OrgChangeLog"("effectiveDate");

-- CreateIndex
CREATE INDEX "CareerRole_department_level_idx" ON "CareerRole"("department", "level");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSkill_name_key" ON "CareerSkill"("name");

-- CreateIndex
CREATE INDEX "CareerPathStep_pathId_idx" ON "CareerPathStep"("pathId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPathStep_pathId_order_key" ON "CareerPathStep"("pathId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressionRule_fromRoleId_toRoleId_key" ON "ProgressionRule"("fromRoleId", "toRoleId");

-- CreateIndex
CREATE INDEX "PromotionRequest_userId_status_idx" ON "PromotionRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "DevelopmentPlanAction_planId_idx" ON "DevelopmentPlanAction"("planId");

-- CreateIndex
CREATE INDEX "DevelopmentPlanAction_status_idx" ON "DevelopmentPlanAction"("status");

-- CreateIndex
CREATE INDEX "PdiEvidence_actionId_idx" ON "PdiEvidence"("actionId");

-- CreateIndex
CREATE INDEX "PdiGoal_planId_idx" ON "PdiGoal"("planId");

-- CreateIndex
CREATE INDEX "PdiCheckpoint_planId_idx" ON "PdiCheckpoint"("planId");

-- CreateIndex
CREATE INDEX "PdiCheckpoint_scheduledAt_idx" ON "PdiCheckpoint"("scheduledAt");

-- CreateIndex
CREATE INDEX "PdiApproval_planId_idx" ON "PdiApproval"("planId");

-- CreateIndex
CREATE INDEX "CourseModule_courseId_idx" ON "CourseModule"("courseId");

-- CreateIndex
CREATE INDEX "CourseModule_seq_idx" ON "CourseModule"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_lessonId_key" ON "Quiz"("lessonId");

-- CreateIndex
CREATE INDEX "LearningPathEnrollment_status_idx" ON "LearningPathEnrollment"("status");

-- CreateIndex
CREATE INDEX "LearningPathEnrollment_userId_idx" ON "LearningPathEnrollment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningPathEnrollment_learningPathId_userId_key" ON "LearningPathEnrollment"("learningPathId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttemptAnswer_attemptId_questionId_key" ON "AssessmentAttemptAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyLevel_competencyId_value_key" ON "ProficiencyLevel"("competencyId", "value");

-- CreateIndex
CREATE INDEX "CompetencyEvolutionLog_userId_idx" ON "CompetencyEvolutionLog"("userId");

-- CreateIndex
CREATE INDEX "CompetencyEvolutionLog_competencyId_idx" ON "CompetencyEvolutionLog"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyEndorsement_endorserId_userId_competencyId_key" ON "CompetencyEndorsement"("endorserId", "userId", "competencyId");

-- CreateIndex
CREATE INDEX "PerformanceCycle_status_idx" ON "PerformanceCycle"("status");

-- CreateIndex
CREATE INDEX "PerformanceGoal_userId_idx" ON "PerformanceGoal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalEvaluation_reviewId_goalId_key" ON "GoalEvaluation"("reviewId", "goalId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyEvaluation_reviewId_competencyId_key" ON "CompetencyEvaluation"("reviewId", "competencyId");

-- CreateIndex
CREATE INDEX "ContinuousFeedback_userId_idx" ON "ContinuousFeedback"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NineBoxPlacement_userId_cycleId_key" ON "NineBoxPlacement"("userId", "cycleId");

-- CreateIndex
CREATE INDEX "OneOnOne_managerId_idx" ON "OneOnOne"("managerId");

-- CreateIndex
CREATE INDEX "LeadershipFeedback360_leaderId_idx" ON "LeadershipFeedback360"("leaderId");

-- CreateIndex
CREATE INDEX "LeadershipPulse_leaderId_idx" ON "LeadershipPulse"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipPulse_leaderId_respondentId_month_year_key" ON "LeadershipPulse"("leaderId", "respondentId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipScore_userId_key" ON "LeadershipScore"("userId");

-- CreateIndex
CREATE INDEX "Mentoring_mentorId_idx" ON "Mentoring"("mentorId");

-- CreateIndex
CREATE INDEX "Mentoring_menteeId_idx" ON "Mentoring"("menteeId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamHealth_managerId_key" ON "TeamHealth"("managerId");

-- CreateIndex
CREATE INDEX "Kudos_receiverId_idx" ON "Kudos"("receiverId");

-- CreateIndex
CREATE INDEX "OnboardingTemplate_active_idx" ON "OnboardingTemplate"("active");

-- CreateIndex
CREATE INDEX "OnboardingTemplateTask_templateId_idx" ON "OnboardingTemplateTask"("templateId");

-- CreateIndex
CREATE INDEX "OnboardingTaskInstance_planId_idx" ON "OnboardingTaskInstance"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingTaskInstance_planId_templateTaskId_key" ON "OnboardingTaskInstance"("planId", "templateTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSurvey_planId_milestone_key" ON "OnboardingSurvey"("planId", "milestone");

-- CreateIndex
CREATE INDEX "MicroLearningProgress_userId_idx" ON "MicroLearningProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MicroLearningProgress_userId_microLearningId_key" ON "MicroLearningProgress"("userId", "microLearningId");

-- CreateIndex
CREATE INDEX "MicroLearningInteraction_userId_idx" ON "MicroLearningInteraction"("userId");

-- CreateIndex
CREATE INDEX "MicroLearningInteraction_microLearningId_idx" ON "MicroLearningInteraction"("microLearningId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistItem_playlistId_microLearningId_key" ON "PlaylistItem"("playlistId", "microLearningId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningStreak_userId_key" ON "LearningStreak"("userId");

-- CreateIndex
CREATE INDEX "TrainingRating_trainingId_idx" ON "TrainingRating"("trainingId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingRating_userId_trainingId_key" ON "TrainingRating"("userId", "trainingId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRating_userId_articleId_key" ON "ArticleRating"("userId", "articleId");

-- CreateIndex
CREATE INDEX "ArticleComment_articleId_idx" ON "ArticleComment"("articleId");

-- CreateIndex
CREATE INDEX "ArticleQuestion_articleId_idx" ON "ArticleQuestion"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleVersion_articleId_version_key" ON "ArticleVersion"("articleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleAcknowledgement_userId_articleId_key" ON "ArticleAcknowledgement"("userId", "articleId");

-- CreateIndex
CREATE INDEX "KnowledgeSearchLog_query_idx" ON "KnowledgeSearchLog"("query");

-- CreateIndex
CREATE INDEX "KnowledgeSearchLog_resultsCount_idx" ON "KnowledgeSearchLog"("resultsCount");

-- CreateIndex
CREATE INDEX "ProcessAuditLog_processId_idx" ON "ProcessAuditLog"("processId");

-- CreateIndex
CREATE INDEX "ProcessAuditLog_instanceId_idx" ON "ProcessAuditLog"("instanceId");

-- CreateIndex
CREATE INDEX "PayslipItem_payslipId_idx" ON "PayslipItem"("payslipId");

-- CreateIndex
CREATE INDEX "PayslipAccessLog_payslipId_idx" ON "PayslipAccessLog"("payslipId");

-- CreateIndex
CREATE INDEX "PayslipAccessLog_userId_idx" ON "PayslipAccessLog"("userId");

-- CreateIndex
CREATE INDEX "CountryConfig_countryCode_active_idx" ON "CountryConfig"("countryCode", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CountryConfig_countryCode_taxYear_key" ON "CountryConfig"("countryCode", "taxYear");

-- CreateIndex
CREATE INDEX "IrtBracket_configId_idx" ON "IrtBracket"("configId");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_userId_effectiveFrom_idx" ON "EmployeeCompensation"("userId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayrollRun_period_status_idx" ON "PayrollRun"("period", "status");

-- CreateIndex
CREATE INDEX "Document_category_status_idx" ON "Document"("category", "status");

-- CreateIndex
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");

-- CreateIndex
CREATE INDEX "Document_department_status_idx" ON "Document"("department", "status");

-- CreateIndex
CREATE INDEX "Document_expiresAt_status_idx" ON "Document"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "Document_sensitivity_idx" ON "Document"("sensitivity");

-- CreateIndex
CREATE INDEX "DocVersion_documentId_versionNumber_idx" ON "DocVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "DocPermission_documentId_idx" ON "DocPermission"("documentId");

-- CreateIndex
CREATE INDEX "DocPermission_userId_idx" ON "DocPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DocShareLink_token_key" ON "DocShareLink"("token");

-- CreateIndex
CREATE INDEX "DocShareLink_token_idx" ON "DocShareLink"("token");

-- CreateIndex
CREATE INDEX "DocDownload_documentId_idx" ON "DocDownload"("documentId");

-- CreateIndex
CREATE INDEX "DocDownload_userId_idx" ON "DocDownload"("userId");

-- CreateIndex
CREATE INDEX "DocAuditLog_documentId_createdAt_idx" ON "DocAuditLog"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocAuditLog_userId_idx" ON "DocAuditLog"("userId");

-- CreateIndex
CREATE INDEX "InstructorCohort_instructorId_idx" ON "InstructorCohort"("instructorId");

-- CreateIndex
CREATE INDEX "InstructorCohort_status_idx" ON "InstructorCohort"("status");

-- CreateIndex
CREATE INDEX "CohortParticipant_cohortId_idx" ON "CohortParticipant"("cohortId");

-- CreateIndex
CREATE INDEX "CohortParticipant_userId_idx" ON "CohortParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortParticipant_cohortId_userId_key" ON "CohortParticipant"("cohortId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_eventType_key" ON "NotificationTemplate"("eventType");

-- CreateIndex
CREATE INDEX "NotificationTemplate_eventType_idx" ON "NotificationTemplate"("eventType");

-- CreateIndex
CREATE INDEX "NotificationTemplate_active_idx" ON "NotificationTemplate"("active");

-- CreateIndex
CREATE INDEX "ReportApproval_reportId_idx" ON "ReportApproval"("reportId");

-- CreateIndex
CREATE INDEX "ReportAccessLog_reportId_idx" ON "ReportAccessLog"("reportId");

-- CreateIndex
CREATE INDEX "ReportAccessLog_userId_idx" ON "ReportAccessLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiTutorMemory_userId_key" ON "AiTutorMemory"("userId");

-- CreateIndex
CREATE INDEX "EventFeedback_eventId_idx" ON "EventFeedback"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFeedback_eventId_userId_key" ON "EventFeedback"("eventId", "userId");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_status_idx" ON "LeaveRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveApproval_requestId_idx" ON "LeaveApproval"("requestId");

-- CreateIndex
CREATE INDEX "LeaveApproval_approverId_decidedAt_idx" ON "LeaveApproval"("approverId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_userId_leaveType_key" ON "LeaveBalance"("userId", "leaveType");

-- CreateIndex
CREATE INDEX "LeaveBalanceHistory_userId_leaveType_idx" ON "LeaveBalanceHistory"("userId", "leaveType");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveImpactPreview_requestId_key" ON "LeaveImpactPreview"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_configs_code_key" ON "leave_type_configs"("code");

-- CreateIndex
CREATE INDEX "AttendanceJustification_attendanceId_idx" ON "AttendanceJustification"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceJustification_status_idx" ON "AttendanceJustification"("status");

-- CreateIndex
CREATE INDEX "attendance_records_userId_date_idx" ON "attendance_records"("userId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_date_status_idx" ON "attendance_records"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_userId_date_context_key" ON "attendance_records"("userId", "date", "context");

-- CreateIndex
CREATE INDEX "AttendanceAdjustment_attendanceId_idx" ON "AttendanceAdjustment"("attendanceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSchedule_name_key" ON "WorkSchedule"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserSchedule_userId_key" ON "UserSchedule"("userId");

-- CreateIndex
CREATE INDEX "UserSchedule_userId_idx" ON "UserSchedule"("userId");

-- CreateIndex
CREATE INDEX "OvertimeRecord_userId_status_idx" ON "OvertimeRecord"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSkill_employeeId_skillId_key" ON "EmployeeSkill"("employeeId", "skillId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_status_idx" ON "EmployeeDocument"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeTimeline_employeeId_occurredAt_idx" ON "EmployeeTimeline"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "SelfServiceRequest_employeeId_status_idx" ON "SelfServiceRequest"("employeeId", "status");

-- CreateIndex
CREATE INDEX "SkillCategory_family_domain_idx" ON "SkillCategory"("family", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "Skill_type_active_idx" ON "Skill"("type", "active");

-- CreateIndex
CREATE INDEX "SkillProficiencyLevel_skillId_idx" ON "SkillProficiencyLevel"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillProficiencyLevel_skillId_level_key" ON "SkillProficiencyLevel"("skillId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "RoleSkillMatrix_roleCode_key" ON "RoleSkillMatrix"("roleCode");

-- CreateIndex
CREATE INDEX "RoleSkillRequirement_matrixId_idx" ON "RoleSkillRequirement"("matrixId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleSkillRequirement_matrixId_skillId_key" ON "RoleSkillRequirement"("matrixId", "skillId");

-- CreateIndex
CREATE INDEX "LegacyEmployeeSkill_userId_idx" ON "LegacyEmployeeSkill"("userId");

-- CreateIndex
CREATE INDEX "LegacyEmployeeSkill_skillId_idx" ON "LegacyEmployeeSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyEmployeeSkill_userId_skillId_key" ON "LegacyEmployeeSkill"("userId", "skillId");

-- CreateIndex
CREATE INDEX "SkillAssessmentHistory_userId_skillId_snapshotAt_idx" ON "SkillAssessmentHistory"("userId", "skillId", "snapshotAt");

-- CreateIndex
CREATE INDEX "DeclarationTemplate_purposeId_active_idx" ON "DeclarationTemplate"("purposeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DeclarationRequest_referenceNumber_key" ON "DeclarationRequest"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeclarationRequest_verificationCode_key" ON "DeclarationRequest"("verificationCode");

-- CreateIndex
CREATE INDEX "DeclarationRequest_userId_status_idx" ON "DeclarationRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "DeclarationRequest_verificationCode_idx" ON "DeclarationRequest"("verificationCode");

-- CreateIndex
CREATE UNIQUE INDEX "DeclarationApproval_requestId_key" ON "DeclarationApproval"("requestId");

-- CreateIndex
CREATE INDEX "WorkDeclForm_type_active_idx" ON "WorkDeclForm"("type", "active");

-- CreateIndex
CREATE INDEX "WorkDeclQuestion_formId_idx" ON "WorkDeclQuestion"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkDeclQuestion_formId_key_key" ON "WorkDeclQuestion"("formId", "key");

-- CreateIndex
CREATE INDEX "WorkDeclSubmission_userId_status_idx" ON "WorkDeclSubmission"("userId", "status");

-- CreateIndex
CREATE INDEX "WorkDeclSubmission_formId_status_idx" ON "WorkDeclSubmission"("formId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkDeclSubmission_userId_formId_key" ON "WorkDeclSubmission"("userId", "formId");

-- CreateIndex
CREATE INDEX "WorkDeclAnswer_submissionId_idx" ON "WorkDeclAnswer"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkDeclReview_submissionId_key" ON "WorkDeclReview"("submissionId");

-- CreateIndex
CREATE INDEX "AiMessage_role_idx" ON "AiMessage"("role");

-- CreateIndex
CREATE INDEX "Assessment_courseId_idx" ON "Assessment"("courseId");

-- CreateIndex
CREATE INDEX "Assessment_status_idx" ON "Assessment"("status");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_status_idx" ON "AssessmentAttempt"("status");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_date_idx" ON "Attendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Attendance_date_status_idx" ON "Attendance"("date", "status");

-- CreateIndex
CREATE INDEX "Attendance_eventId_idx" ON "Attendance"("eventId");

-- CreateIndex
CREATE INDEX "Attendance_courseId_idx" ON "Attendance"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_date_context_key" ON "Attendance"("employeeId", "date", "context");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "CareerGoal_careerPlanId_status_idx" ON "CareerGoal"("careerPlanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_code_key" ON "Certificate"("code");

-- CreateIndex
CREATE INDEX "CompanyDocument_category_idx" ON "CompanyDocument"("category");

-- CreateIndex
CREATE INDEX "Competency_category_idx" ON "Competency"("category");

-- CreateIndex
CREATE INDEX "Competency_status_idx" ON "Competency"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Course_internalCode_key" ON "Course"("internalCode");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_category_idx" ON "Course"("category");

-- CreateIndex
CREATE INDEX "Course_mandatory_idx" ON "Course"("mandatory");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAnalytics_courseId_key" ON "CourseAnalytics"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCompetency_courseId_competencyId_key" ON "CourseCompetency"("courseId", "competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseFeedback_courseId_userId_key" ON "CourseFeedback"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_active_idx" ON "Department"("active");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_userId_idx" ON "DevelopmentPlan"("userId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_status_idx" ON "DevelopmentPlan"("status");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_managerId_idx" ON "DevelopmentPlan"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_matricula_key" ON "Employee"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_cpf_key" ON "Employee"("cpf");

-- CreateIndex
CREATE INDEX "Employee_department_status_idx" ON "Employee"("department", "status");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE INDEX "Employee_status_joinedAt_idx" ON "Employee"("status", "joinedAt");

-- CreateIndex
CREATE INDEX "Enrollment_status_idx" ON "Enrollment"("status");

-- CreateIndex
CREATE INDEX "Enrollment_deadline_idx" ON "Enrollment"("deadline");

-- CreateIndex
CREATE INDEX "Enrollment_mandatory_idx" ON "Enrollment"("mandatory");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_courseId_userId_key" ON "Enrollment"("courseId", "userId");

-- CreateIndex
CREATE INDEX "Event_organizerId_idx" ON "Event"("organizerId");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_startAt_idx" ON "Event"("startAt");

-- CreateIndex
CREATE INDEX "EventParticipant_eventId_idx" ON "EventParticipant"("eventId");

-- CreateIndex
CREATE INDEX "EventParticipant_userId_idx" ON "EventParticipant"("userId");

-- CreateIndex
CREATE INDEX "EventParticipant_status_idx" ON "EventParticipant"("status");

-- CreateIndex
CREATE INDEX "ExecutiveReport_status_idx" ON "ExecutiveReport"("status");

-- CreateIndex
CREATE INDEX "ExecutiveReport_type_idx" ON "ExecutiveReport"("type");

-- CreateIndex
CREATE INDEX "Feedback360_employeeId_cycle_idx" ON "Feedback360"("employeeId", "cycle");

-- CreateIndex
CREATE INDEX "InstructorProfile_approved_idx" ON "InstructorProfile"("approved");

-- CreateIndex
CREATE INDEX "InstructorProfile_instructorType_idx" ON "InstructorProfile"("instructorType");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_status_idx" ON "KnowledgeArticle"("status");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_authorId_idx" ON "KnowledgeArticle"("authorId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_viewCount_idx" ON "KnowledgeArticle"("viewCount");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_slug_key" ON "KnowledgeCategory"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeCategory_parentId_idx" ON "KnowledgeCategory"("parentId");

-- CreateIndex
CREATE INDEX "KnowledgeInteraction_articleId_idx" ON "KnowledgeInteraction"("articleId");

-- CreateIndex
CREATE INDEX "KnowledgeInteraction_userId_idx" ON "KnowledgeInteraction"("userId");

-- CreateIndex
CREATE INDEX "KnowledgeTag_articleId_idx" ON "KnowledgeTag"("articleId");

-- CreateIndex
CREATE INDEX "LeadershipParticipant_userId_idx" ON "LeadershipParticipant"("userId");

-- CreateIndex
CREATE INDEX "LeadershipProgram_level_idx" ON "LeadershipProgram"("level");

-- CreateIndex
CREATE INDEX "LeadershipProgram_status_idx" ON "LeadershipProgram"("status");

-- CreateIndex
CREATE INDEX "LearningPath_status_idx" ON "LearningPath"("status");

-- CreateIndex
CREATE INDEX "LearningPath_category_idx" ON "LearningPath"("category");

-- CreateIndex
CREATE INDEX "LearningPathAssignment_learningPathId_idx" ON "LearningPathAssignment"("learningPathId");

-- CreateIndex
CREATE INDEX "LearningPathCourse_learningPathId_idx" ON "LearningPathCourse"("learningPathId");

-- CreateIndex
CREATE INDEX "Lesson_moduleId_idx" ON "Lesson"("moduleId");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_idx" ON "LessonProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_lessonId_userId_key" ON "LessonProgress"("lessonId", "userId");

-- CreateIndex
CREATE INDEX "MicroLearning_status_idx" ON "MicroLearning"("status");

-- CreateIndex
CREATE INDEX "MicroLearning_contentType_idx" ON "MicroLearning"("contentType");

-- CreateIndex
CREATE INDEX "MicroLearning_viewCount_idx" ON "MicroLearning"("viewCount");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_idx" ON "NotificationLog"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_read_idx" ON "NotificationLog"("read");

-- CreateIndex
CREATE INDEX "NotificationLog_category_idx" ON "NotificationLog"("category");

-- CreateIndex
CREATE INDEX "NotificationLog_priority_idx" ON "NotificationLog"("priority");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "OnboardingPlan_userId_idx" ON "OnboardingPlan"("userId");

-- CreateIndex
CREATE INDEX "OnboardingPlan_status_idx" ON "OnboardingPlan"("status");

-- CreateIndex
CREATE INDEX "Payslip_userId_period_idx" ON "Payslip"("userId", "period");

-- CreateIndex
CREATE INDEX "Payslip_period_status_idx" ON "Payslip"("period", "status");

-- CreateIndex
CREATE INDEX "Payslip_runId_idx" ON "Payslip"("runId");

-- CreateIndex
CREATE INDEX "PerformanceReview_userId_idx" ON "PerformanceReview"("userId");

-- CreateIndex
CREATE INDEX "PerformanceReview_status_idx" ON "PerformanceReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_userId_cycleId_type_key" ON "PerformanceReview"("userId", "cycleId", "type");

-- CreateIndex
CREATE INDEX "ProcessInstance_status_idx" ON "ProcessInstance"("status");

-- CreateIndex
CREATE INDEX "ProcessInstance_processId_idx" ON "ProcessInstance"("processId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStandard_code_key" ON "ProcessStandard"("code");

-- CreateIndex
CREATE INDEX "ProcessStandard_status_idx" ON "ProcessStandard"("status");

-- CreateIndex
CREATE INDEX "ProcessStandard_category_idx" ON "ProcessStandard"("category");

-- CreateIndex
CREATE INDEX "ProcessStep_processId_idx" ON "ProcessStep"("processId");

-- CreateIndex
CREATE INDEX "StepProgress_status_idx" ON "StepProgress"("status");

-- CreateIndex
CREATE INDEX "Training_status_idx" ON "Training"("status");

-- CreateIndex
CREATE INDEX "Training_type_idx" ON "Training"("type");

-- CreateIndex
CREATE INDEX "TrainingParticipant_userId_idx" ON "TrainingParticipant"("userId");

-- CreateIndex
CREATE INDEX "TrainingParticipant_status_idx" ON "TrainingParticipant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingParticipant_sessionId_userId_key" ON "TrainingParticipant"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "TrainingSession_trainingId_idx" ON "TrainingSession"("trainingId");

-- CreateIndex
CREATE INDEX "TrainingSession_sessionDate_idx" ON "TrainingSession"("sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeNumber_key" ON "User"("employeeNumber");

-- CreateIndex
CREATE INDEX "User_accountStatus_idx" ON "User"("accountStatus");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_active_idx" ON "User"("active");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_unitId_idx" ON "User"("unitId");

-- CreateIndex
CREATE INDEX "UserCareerPlan_userId_status_idx" ON "UserCareerPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "UserCompetency_userId_idx" ON "UserCompetency"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentHeadHistory" ADD CONSTRAINT "DepartmentHeadHistory_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentHeadHistory" ADD CONSTRAINT "DepartmentHeadHistory_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTransferLog" ADD CONSTRAINT "DepartmentTransferLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTransferLog" ADD CONSTRAINT "DepartmentTransferLog_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentTransferLog" ADD CONSTRAINT "DepartmentTransferLog_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChangeLog" ADD CONSTRAINT "OrgChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChangeLog" ADD CONSTRAINT "OrgChangeLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChangeLog" ADD CONSTRAINT "OrgChangeLog_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChangeLog" ADD CONSTRAINT "OrgChangeLog_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChangeLog" ADD CONSTRAINT "OrgChangeLog_fromPositionId_fkey" FOREIGN KEY ("fromPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgChangeLog" ADD CONSTRAINT "OrgChangeLog_toPositionId_fkey" FOREIGN KEY ("toPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCareerPlan" ADD CONSTRAINT "UserCareerPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCareerPlan" ADD CONSTRAINT "UserCareerPlan_currentRoleId_fkey" FOREIGN KEY ("currentRoleId") REFERENCES "CareerRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCareerPlan" ADD CONSTRAINT "UserCareerPlan_targetRoleId_fkey" FOREIGN KEY ("targetRoleId") REFERENCES "CareerRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCareerPlan" ADD CONSTRAINT "UserCareerPlan_careerPathId_fkey" FOREIGN KEY ("careerPathId") REFERENCES "CareerPath"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerRole" ADD CONSTRAINT "CareerRole_parentRoleId_fkey" FOREIGN KEY ("parentRoleId") REFERENCES "CareerRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPathStep" ADD CONSTRAINT "CareerPathStep_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "CareerPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPathStep" ADD CONSTRAINT "CareerPathStep_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CareerRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressionRule" ADD CONSTRAINT "ProgressionRule_fromRoleId_fkey" FOREIGN KEY ("fromRoleId") REFERENCES "CareerRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressionRule" ADD CONSTRAINT "ProgressionRule_toRoleId_fkey" FOREIGN KEY ("toRoleId") REFERENCES "CareerRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerGoal" ADD CONSTRAINT "CareerGoal_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "CareerSkill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_targetRoleId_fkey" FOREIGN KEY ("targetRoleId") REFERENCES "CareerRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_careerPlanId_fkey" FOREIGN KEY ("careerPlanId") REFERENCES "UserCareerPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlanAction" ADD CONSTRAINT "DevelopmentPlanAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiEvidence" ADD CONSTRAINT "PdiEvidence_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "DevelopmentPlanAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiEvidence" ADD CONSTRAINT "PdiEvidence_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiGoal" ADD CONSTRAINT "PdiGoal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiCheckpoint" ADD CONSTRAINT "PdiCheckpoint_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiApproval" ADD CONSTRAINT "PdiApproval_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiApproval" ADD CONSTRAINT "PdiApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleMaterial" ADD CONSTRAINT "ModuleMaterial_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPathCourse" ADD CONSTRAINT "LearningPathCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPathMilestone" ADD CONSTRAINT "LearningPathMilestone_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPathAssignment" ADD CONSTRAINT "LearningPathAssignment_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPathEnrollment" ADD CONSTRAINT "LearningPathEnrollment_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPathEnrollment" ADD CONSTRAINT "LearningPathEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyLevel" ADD CONSTRAINT "ProficiencyLevel_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompetency" ADD CONSTRAINT "UserCompetency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompetency" ADD CONSTRAINT "UserCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyEvolutionLog" ADD CONSTRAINT "CompetencyEvolutionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyEvolutionLog" ADD CONSTRAINT "CompetencyEvolutionLog_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyEndorsement" ADD CONSTRAINT "CompetencyEndorsement_endorserId_fkey" FOREIGN KEY ("endorserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyEndorsement" ADD CONSTRAINT "CompetencyEndorsement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyEndorsement" ADD CONSTRAINT "CompetencyEndorsement_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionCompetency" ADD CONSTRAINT "PositionCompetency_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionCompetency" ADD CONSTRAINT "PositionCompetency_careerPositionId_fkey" FOREIGN KEY ("careerPositionId") REFERENCES "CareerPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionCompetency" ADD CONSTRAINT "PositionCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "PerformanceCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "PerformanceCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalEvaluation" ADD CONSTRAINT "GoalEvaluation_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalEvaluation" ADD CONSTRAINT "GoalEvaluation_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PerformanceGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyEvaluation" ADD CONSTRAINT "CompetencyEvaluation_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuousFeedback" ADD CONSTRAINT "ContinuousFeedback_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuousFeedback" ADD CONSTRAINT "ContinuousFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuousFeedback" ADD CONSTRAINT "ContinuousFeedback_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "PerformanceCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationLog" ADD CONSTRAINT "CalibrationLog_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationLog" ADD CONSTRAINT "CalibrationLog_calibratorId_fkey" FOREIGN KEY ("calibratorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceDispute" ADD CONSTRAINT "PerformanceDispute_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceDispute" ADD CONSTRAINT "PerformanceDispute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NineBoxPlacement" ADD CONSTRAINT "NineBoxPlacement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NineBoxPlacement" ADD CONSTRAINT "NineBoxPlacement_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "PerformanceCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NineBoxPlacement" ADD CONSTRAINT "NineBoxPlacement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipParticipant" ADD CONSTRAINT "LeadershipParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_subordinateId_fkey" FOREIGN KEY ("subordinateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipFeedback360" ADD CONSTRAINT "LeadershipFeedback360_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipFeedback360Response" ADD CONSTRAINT "LeadershipFeedback360Response_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "LeadershipFeedback360"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipScore" ADD CONSTRAINT "LeadershipScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentoring" ADD CONSTRAINT "Mentoring_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentoring" ADD CONSTRAINT "Mentoring_menteeId_fkey" FOREIGN KEY ("menteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentoringSession" ADD CONSTRAINT "MentoringSession_mentoringId_fkey" FOREIGN KEY ("mentoringId") REFERENCES "Mentoring"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplateTask" ADD CONSTRAINT "OnboardingTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPlan" ADD CONSTRAINT "OnboardingPlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPlan" ADD CONSTRAINT "OnboardingPlan_buddyId_fkey" FOREIGN KEY ("buddyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPlan" ADD CONSTRAINT "OnboardingPlan_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPlan" ADD CONSTRAINT "OnboardingPlan_hrResponsibleId_fkey" FOREIGN KEY ("hrResponsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTaskInstance" ADD CONSTRAINT "OnboardingTaskInstance_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OnboardingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTaskInstance" ADD CONSTRAINT "OnboardingTaskInstance_templateTaskId_fkey" FOREIGN KEY ("templateTaskId") REFERENCES "OnboardingTemplateTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTaskInstance" ADD CONSTRAINT "OnboardingTaskInstance_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OnboardingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSurvey" ADD CONSTRAINT "OnboardingSurvey_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OnboardingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroLearning" ADD CONSTRAINT "MicroLearning_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroQuizQuestion" ADD CONSTRAINT "MicroQuizQuestion_microLearningId_fkey" FOREIGN KEY ("microLearningId") REFERENCES "MicroLearning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroLearningProgress" ADD CONSTRAINT "MicroLearningProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroLearningProgress" ADD CONSTRAINT "MicroLearningProgress_microLearningId_fkey" FOREIGN KEY ("microLearningId") REFERENCES "MicroLearning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroLearningInteraction" ADD CONSTRAINT "MicroLearningInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroLearningInteraction" ADD CONSTRAINT "MicroLearningInteraction_microLearningId_fkey" FOREIGN KEY ("microLearningId") REFERENCES "MicroLearning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroQuizAttempt" ADD CONSTRAINT "MicroQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroQuizAttempt" ADD CONSTRAINT "MicroQuizAttempt_microLearningId_fkey" FOREIGN KEY ("microLearningId") REFERENCES "MicroLearning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroLearningPlaylist" ADD CONSTRAINT "MicroLearningPlaylist_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "MicroLearningPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningStreak" ADD CONSTRAINT "LearningStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingParticipant" ADD CONSTRAINT "TrainingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingParticipant" ADD CONSTRAINT "TrainingParticipant_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRating" ADD CONSTRAINT "TrainingRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRating" ADD CONSTRAINT "TrainingRating_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeInteraction" ADD CONSTRAINT "KnowledgeInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRating" ADD CONSTRAINT "ArticleRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRating" ADD CONSTRAINT "ArticleRating_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ArticleComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleQuestion" ADD CONSTRAINT "ArticleQuestion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleQuestion" ADD CONSTRAINT "ArticleQuestion_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAcknowledgement" ADD CONSTRAINT "ArticleAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAcknowledgement" ADD CONSTRAINT "ArticleAcknowledgement_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStandard" ADD CONSTRAINT "ProcessStandard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStandard" ADD CONSTRAINT "ProcessStandard_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessVersion" ADD CONSTRAINT "ProcessVersion_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProcessStandard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessApprovalLog" ADD CONSTRAINT "ProcessApprovalLog_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProcessStandard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessApprovalLog" ADD CONSTRAINT "ProcessApprovalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessAuditLog" ADD CONSTRAINT "ProcessAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipItem" ADD CONSTRAINT "PayslipItem_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipAccessLog" ADD CONSTRAINT "PayslipAccessLog_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipAccessLog" ADD CONSTRAINT "PayslipAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipDispute" ADD CONSTRAINT "PayslipDispute_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrtBracket" ADD CONSTRAINT "IrtBracket_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CountryConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationComponent" ADD CONSTRAINT "EmployeeCompensationComponent_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "EmployeeCompensation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocCategoryModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocVersion" ADD CONSTRAINT "DocVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocVersion" ADD CONSTRAINT "DocVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocPermission" ADD CONSTRAINT "DocPermission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocPermission" ADD CONSTRAINT "DocPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocPermission" ADD CONSTRAINT "DocPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocShareLink" ADD CONSTRAINT "DocShareLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocShareLink" ADD CONSTRAINT "DocShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocDownload" ADD CONSTRAINT "DocDownload_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocDownload" ADD CONSTRAINT "DocDownload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocAuditLog" ADD CONSTRAINT "DocAuditLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocAuditLog" ADD CONSTRAINT "DocAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorProfile" ADD CONSTRAINT "InstructorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorCohort" ADD CONSTRAINT "InstructorCohort_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "InstructorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorCohort" ADD CONSTRAINT "InstructorCohort_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortParticipant" ADD CONSTRAINT "CohortParticipant_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "InstructorCohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortParticipant" ADD CONSTRAINT "CohortParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportApproval" ADD CONSTRAINT "ReportApproval_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExecutiveReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportApproval" ADD CONSTRAINT "ReportApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAccessLog" ADD CONSTRAINT "ReportAccessLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExecutiveReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAccessLog" ADD CONSTRAINT "ReportAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingImpact" ADD CONSTRAINT "TrainingImpact_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiTutorSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTutorMemory" ADD CONSTRAINT "AiTutorMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFeedback" ADD CONSTRAINT "EventFeedback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFeedback" ADD CONSTRAINT "EventFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApproval" ADD CONSTRAINT "LeaveApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApproval" ADD CONSTRAINT "LeaveApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDocument" ADD CONSTRAINT "LeaveDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveImpactPreview" ADD CONSTRAINT "LeaveImpactPreview_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceJustification" ADD CONSTRAINT "AttendanceJustification_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceJustification" ADD CONSTRAINT "AttendanceJustification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceJustification" ADD CONSTRAINT "AttendanceJustification_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSchedule" ADD CONSTRAINT "UserSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSchedule" ADD CONSTRAINT "UserSchedule_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRecord" ADD CONSTRAINT "OvertimeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRecord" ADD CONSTRAINT "OvertimeRecord_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPdi" ADD CONSTRAINT "LegacyPdi_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPdiAction" ADD CONSTRAINT "LegacyPdiAction_pdiId_fkey" FOREIGN KEY ("pdiId") REFERENCES "LegacyPdi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimeline" ADD CONSTRAINT "EmployeeTimeline_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfServiceRequest" ADD CONSTRAINT "SelfServiceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SkillCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillProficiencyLevel" ADD CONSTRAINT "SkillProficiencyLevel_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSkillRequirement" ADD CONSTRAINT "RoleSkillRequirement_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "RoleSkillMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSkillRequirement" ADD CONSTRAINT "RoleSkillRequirement_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSkillRequirement" ADD CONSTRAINT "RoleSkillRequirement_careerRoleId_fkey" FOREIGN KEY ("careerRoleId") REFERENCES "CareerRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyEmployeeSkill" ADD CONSTRAINT "LegacyEmployeeSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyEmployeeSkill" ADD CONSTRAINT "LegacyEmployeeSkill_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyEmployeeSkill" ADD CONSTRAINT "LegacyEmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyEmployeeSkill" ADD CONSTRAINT "LegacyEmployeeSkill_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAssessmentHistory" ADD CONSTRAINT "SkillAssessmentHistory_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationTemplate" ADD CONSTRAINT "DeclarationTemplate_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "DeclarationPurpose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationTemplate" ADD CONSTRAINT "DeclarationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationRequest" ADD CONSTRAINT "DeclarationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationRequest" ADD CONSTRAINT "DeclarationRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DeclarationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationRequest" ADD CONSTRAINT "DeclarationRequest_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "DeclarationPurpose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationApproval" ADD CONSTRAINT "DeclarationApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DeclarationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationApproval" ADD CONSTRAINT "DeclarationApproval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclForm" ADD CONSTRAINT "WorkDeclForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclQuestion" ADD CONSTRAINT "WorkDeclQuestion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "WorkDeclForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclSubmission" ADD CONSTRAINT "WorkDeclSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclSubmission" ADD CONSTRAINT "WorkDeclSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "WorkDeclForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclAnswer" ADD CONSTRAINT "WorkDeclAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclAnswer" ADD CONSTRAINT "WorkDeclAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "WorkDeclSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclAnswer" ADD CONSTRAINT "WorkDeclAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "WorkDeclQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclReview" ADD CONSTRAINT "WorkDeclReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "WorkDeclSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDeclReview" ADD CONSTRAINT "WorkDeclReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
