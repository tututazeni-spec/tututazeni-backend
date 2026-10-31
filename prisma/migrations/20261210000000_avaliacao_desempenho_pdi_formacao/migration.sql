-- AlterTable
ALTER TABLE "PerformanceEvaluation" ADD COLUMN     "pdiPlanId" INTEGER;

-- AlterTable
ALTER TABLE "EvaluationRecommendation" ADD COLUMN     "pdiActionId" INTEGER,
ADD COLUMN     "trainingId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationRecommendation_pdiActionId_key" ON "EvaluationRecommendation"("pdiActionId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendation_trainingId_idx" ON "EvaluationRecommendation"("trainingId");

-- AddForeignKey
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_pdiPlanId_fkey" FOREIGN KEY ("pdiPlanId") REFERENCES "DevelopmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendation" ADD CONSTRAINT "EvaluationRecommendation_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendation" ADD CONSTRAINT "EvaluationRecommendation_pdiActionId_fkey" FOREIGN KEY ("pdiActionId") REFERENCES "DevelopmentPlanAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
