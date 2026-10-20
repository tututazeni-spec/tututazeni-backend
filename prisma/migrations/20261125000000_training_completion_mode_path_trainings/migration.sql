-- Conclusão configurável por Formação e Formações dentro de Trilhas.
-- Aditiva: as formações existentes ficam em MANUAL (comportamento actual).

CREATE TYPE "TrainingCompletionMode" AS ENUM ('MANUAL', 'ATTENDANCE', 'HYBRID');

ALTER TABLE "Training" ADD COLUMN "completionMode" "TrainingCompletionMode" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Training" ADD COLUMN "minAttendancePercent" INTEGER NOT NULL DEFAULT 75;

CREATE TABLE "LearningPathTraining" (
    "id" SERIAL NOT NULL,
    "learningPathId" INTEGER NOT NULL,
    "trainingId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "LearningPathTraining_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LearningPathTraining_learningPathId_trainingId_key" ON "LearningPathTraining"("learningPathId", "trainingId");
CREATE INDEX "LearningPathTraining_learningPathId_idx" ON "LearningPathTraining"("learningPathId");
CREATE INDEX "LearningPathTraining_trainingId_idx" ON "LearningPathTraining"("trainingId");
ALTER TABLE "LearningPathTraining" ADD CONSTRAINT "LearningPathTraining_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningPathTraining" ADD CONSTRAINT "LearningPathTraining_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;
