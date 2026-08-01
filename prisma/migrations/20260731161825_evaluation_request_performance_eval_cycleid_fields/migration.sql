-- AlterTable
ALTER TABLE "EvaluationRequest" ADD COLUMN     "cycleId" INTEGER;

-- AlterTable
ALTER TABLE "PerformanceEvaluation" ADD COLUMN     "competencyScores" TEXT,
ADD COLUMN     "cycleId" INTEGER,
ADD COLUMN     "improvements" TEXT,
ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recommendations" TEXT,
ADD COLUMN     "strengths" TEXT;
