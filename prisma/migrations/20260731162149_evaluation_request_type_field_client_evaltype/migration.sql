-- AlterEnum
ALTER TYPE "EvalType" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "EvaluationRequest" ADD COLUMN     "type" "EvalType";
