-- AlterTable
ALTER TABLE "AvatarTrainingProgram" ADD COLUMN "competencyIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "AvatarTrainingAssignment"
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "developmentPlanActionId" INTEGER,
  ADD COLUMN "onboardingTaskInstanceId" INTEGER;

-- CreateTable
CREATE TABLE "AvatarTrainingCompetencyResult" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "levelBefore" INTEGER,
    "levelAfter" INTEGER,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "evidence" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarTrainingCompetencyResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvatarTrainingCompetencyResult_attemptId_competencyId_key" ON "AvatarTrainingCompetencyResult"("attemptId", "competencyId");
CREATE INDEX "AvatarTrainingCompetencyResult_userId_idx" ON "AvatarTrainingCompetencyResult"("userId");
CREATE INDEX "AvatarTrainingCompetencyResult_competencyId_idx" ON "AvatarTrainingCompetencyResult"("competencyId");

-- AddForeignKey
ALTER TABLE "AvatarTrainingCompetencyResult" ADD CONSTRAINT "AvatarTrainingCompetencyResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AvatarTrainingAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
