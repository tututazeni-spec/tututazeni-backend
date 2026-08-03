-- CreateEnum
CREATE TYPE "CycleType" AS ENUM ('PROBATION', 'QUARTERLY', 'SEMESTER', 'ANNUAL', 'AD_HOC');
CREATE TYPE "CycleStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED', 'CANCELLED');
CREATE TYPE "ReviewType" AS ENUM ('SELF', 'MANAGER', 'PEER', 'R360');
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'PENDING_SELF', 'PENDING_MANAGER', 'PENDING_360', 'CALIBRATION', 'PUBLISHED', 'DISPUTE', 'FINALIZED');
CREATE TYPE "PerformanceCategory" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "PerformanceGoalStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'COMPLETED');
CREATE TYPE "FeedbackType" AS ENUM ('PRAISE', 'IMPROVEMENT', 'GENERAL');
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN');
CREATE TYPE "EvaluationRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');
CREATE TYPE "LeadershipProgramLevel" AS ENUM ('INITIAL', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "ParticipantStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN');
CREATE TYPE "OneOnOneStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');
CREATE TYPE "LeadershipClassification" AS ENUM ('CRITICAL', 'BELOW_AVERAGE', 'AVERAGE', 'ABOVE_AVERAGE', 'TOP_10');

-- AlterTable: PerformanceCycle
ALTER TABLE "PerformanceCycle" ALTER COLUMN "type" TYPE "CycleType" USING ("type"::"CycleType");
ALTER TABLE "PerformanceCycle" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PerformanceCycle" ALTER COLUMN "status" TYPE "CycleStatus" USING ("status"::"CycleStatus");
ALTER TABLE "PerformanceCycle" ALTER COLUMN "status" SET DEFAULT 'PLANNED';

-- AlterTable: PerformanceReview
ALTER TABLE "PerformanceReview" ALTER COLUMN "type" TYPE "ReviewType" USING ("type"::"ReviewType");
ALTER TABLE "PerformanceReview" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PerformanceReview" ALTER COLUMN "status" TYPE "ReviewStatus" USING ("status"::"ReviewStatus");
ALTER TABLE "PerformanceReview" ALTER COLUMN "status" SET DEFAULT 'PENDING_SELF';
ALTER TABLE "PerformanceReview" ALTER COLUMN "category" TYPE "PerformanceCategory" USING ("category"::"PerformanceCategory");

-- AlterTable: PerformanceGoal
ALTER TABLE "PerformanceGoal" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PerformanceGoal" ALTER COLUMN "status" TYPE "PerformanceGoalStatus" USING ("status"::"PerformanceGoalStatus");
ALTER TABLE "PerformanceGoal" ALTER COLUMN "status" SET DEFAULT 'ON_TRACK';

-- AlterTable: ContinuousFeedback
ALTER TABLE "ContinuousFeedback" ALTER COLUMN "type" TYPE "FeedbackType" USING ("type"::"FeedbackType");

-- AlterTable: PerformanceDispute
ALTER TABLE "PerformanceDispute" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PerformanceDispute" ALTER COLUMN "status" TYPE "DisputeStatus" USING ("status"::"DisputeStatus");
ALTER TABLE "PerformanceDispute" ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable: EvaluationRequest
ALTER TABLE "EvaluationRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EvaluationRequest" ALTER COLUMN "status" TYPE "EvaluationRequestStatus" USING ("status"::"EvaluationRequestStatus");
ALTER TABLE "EvaluationRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: LeadershipProgram
ALTER TABLE "LeadershipProgram" ALTER COLUMN "level" TYPE "LeadershipProgramLevel" USING ("level"::"LeadershipProgramLevel");
ALTER TABLE "LeadershipProgram" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "LeadershipProgram" ALTER COLUMN "status" TYPE "ProgramStatus" USING ("status"::"ProgramStatus");
ALTER TABLE "LeadershipProgram" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable: LeadershipParticipant
ALTER TABLE "LeadershipParticipant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "LeadershipParticipant" ALTER COLUMN "status" TYPE "ParticipantStatus" USING ("status"::"ParticipantStatus");
ALTER TABLE "LeadershipParticipant" ALTER COLUMN "status" SET DEFAULT 'ENROLLED';

-- AlterTable: OneOnOne
ALTER TABLE "OneOnOne" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OneOnOne" ALTER COLUMN "status" TYPE "OneOnOneStatus" USING ("status"::"OneOnOneStatus");
ALTER TABLE "OneOnOne" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';

-- AlterTable: LeadershipScore
ALTER TABLE "LeadershipScore" ALTER COLUMN "classification" DROP DEFAULT;
ALTER TABLE "LeadershipScore" ALTER COLUMN "classification" TYPE "LeadershipClassification" USING ("classification"::"LeadershipClassification");
ALTER TABLE "LeadershipScore" ALTER COLUMN "classification" SET DEFAULT 'AVERAGE';
