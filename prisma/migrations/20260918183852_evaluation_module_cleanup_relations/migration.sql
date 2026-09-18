-- DropForeignKey
ALTER TABLE "EvaluationAssignment" DROP CONSTRAINT "EvaluationAssignment_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationAssignment" DROP CONSTRAINT "EvaluationAssignment_evaluatedId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationAssignment" DROP CONSTRAINT "EvaluationAssignment_evaluatorId_fkey";

-- DropTable
DROP TABLE "EvaluationAssignment";

-- DropEnum
DROP TYPE "EvalAssignmentStatus";

-- DropEnum
DROP TYPE "EvalCampaignEvaluatorType";

-- CreateIndex
CREATE INDEX "EvaluationRequest_cycleId_idx" ON "EvaluationRequest"("cycleId");

-- CreateIndex
CREATE INDEX "PerformanceEvaluation_cycleId_idx" ON "PerformanceEvaluation"("cycleId");

-- AddForeignKey
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "EvaluationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRequest" ADD CONSTRAINT "EvaluationRequest_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "EvaluationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

