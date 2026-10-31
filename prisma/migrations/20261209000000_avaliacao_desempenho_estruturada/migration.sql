-- AlterTable
ALTER TABLE "PerformanceEvaluation" ADD COLUMN     "completionPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingLabel" TEXT;

-- CreateTable
CREATE TABLE "EvaluationStrength" (
    "id" SERIAL NOT NULL,
    "evaluationId" INTEGER NOT NULL,
    "competencyId" INTEGER,
    "competency" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT,
    "impact" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationStrength_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationImprovementArea" (
    "id" SERIAL NOT NULL,
    "evaluationId" INTEGER NOT NULL,
    "competencyId" INTEGER,
    "competency" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT,
    "impact" TEXT,
    "priority" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationImprovementArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRecommendation" (
    "id" SERIAL NOT NULL,
    "evaluationId" INTEGER NOT NULL,
    "improvementAreaId" INTEGER,
    "action" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "responsibleId" INTEGER,
    "dueDate" TIMESTAMP(3),
    "successIndicator" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationStrength_evaluationId_idx" ON "EvaluationStrength"("evaluationId");

-- CreateIndex
CREATE INDEX "EvaluationStrength_competencyId_idx" ON "EvaluationStrength"("competencyId");

-- CreateIndex
CREATE INDEX "EvaluationImprovementArea_evaluationId_idx" ON "EvaluationImprovementArea"("evaluationId");

-- CreateIndex
CREATE INDEX "EvaluationImprovementArea_competencyId_idx" ON "EvaluationImprovementArea"("competencyId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendation_evaluationId_idx" ON "EvaluationRecommendation"("evaluationId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendation_improvementAreaId_idx" ON "EvaluationRecommendation"("improvementAreaId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendation_responsibleId_idx" ON "EvaluationRecommendation"("responsibleId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendation_status_idx" ON "EvaluationRecommendation"("status");

-- AddForeignKey
ALTER TABLE "EvaluationStrength" ADD CONSTRAINT "EvaluationStrength_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PerformanceEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationStrength" ADD CONSTRAINT "EvaluationStrength_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationImprovementArea" ADD CONSTRAINT "EvaluationImprovementArea_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PerformanceEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationImprovementArea" ADD CONSTRAINT "EvaluationImprovementArea_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendation" ADD CONSTRAINT "EvaluationRecommendation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "PerformanceEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendation" ADD CONSTRAINT "EvaluationRecommendation_improvementAreaId_fkey" FOREIGN KEY ("improvementAreaId") REFERENCES "EvaluationImprovementArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendation" ADD CONSTRAINT "EvaluationRecommendation_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
