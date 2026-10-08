-- CreateEnum
CREATE TYPE "EvalPurpose" AS ENUM ('PERFORMANCE', 'PROBATION', 'EXTRAORDINARY', 'POST_TRAINING', 'COMPETENCY', 'GOALS');

-- CreateEnum
CREATE TYPE "EvalPopulationType" AS ENUM ('ALL', 'DEPARTMENT', 'UNIT', 'GROUP');

-- CreateEnum
CREATE TYPE "EvalStage" AS ENUM ('SELF_EVAL', 'MANAGER_EVAL', 'HR_REVIEW', 'CALIBRATION', 'ONE_ON_ONE', 'APPROVAL', 'DONE');

-- AlterEnum
ALTER TYPE "EvalCampaignStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "EvaluationCampaign" ADD COLUMN     "blocks" JSONB,
ADD COLUMN     "managerEvalDueDate" TIMESTAMP(3),
ADD COLUMN     "populationType" "EvalPopulationType",
ADD COLUMN     "purpose" "EvalPurpose",
ADD COLUMN     "selfEvalDueDate" TIMESTAMP(3),
ADD COLUMN     "targetUnitIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "targetUserIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "EvaluationRequest" ADD COLUMN     "name" TEXT,
ADD COLUMN     "objectives" JSONB,
ADD COLUMN     "purpose" "EvalPurpose",
ADD COLUMN     "stage" "EvalStage";

