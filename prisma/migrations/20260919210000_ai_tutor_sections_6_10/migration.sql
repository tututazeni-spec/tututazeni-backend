-- AlterTable
ALTER TABLE "AiTutorSession" ADD COLUMN     "trainingId" INTEGER;

-- CreateTable
CREATE TABLE "AiGeneratedExercise" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "topic" TEXT,
    "courseId" INTEGER,
    "count" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGeneratedExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRecommendationLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "courseIdsJson" TEXT NOT NULL,
    "competencyGapsJson" TEXT,
    "acceptedCourseId" INTEGER,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRecommendationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTutorSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "allowOutsideKnowledge" BOOLEAN NOT NULL DEFAULT true,
    "sourceOnlyMode" BOOLEAN NOT NULL DEFAULT false,
    "showSources" BOOLEAN NOT NULL DEFAULT true,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'pt',
    "dailyMessageLimit" INTEGER,
    "historyRetentionDays" INTEGER,
    "customSystemPromptAddendum" TEXT,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTutorSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGeneratedExercise_userId_idx" ON "AiGeneratedExercise"("userId");

-- CreateIndex
CREATE INDEX "AiGeneratedExercise_createdAt_idx" ON "AiGeneratedExercise"("createdAt");

-- CreateIndex
CREATE INDEX "AiRecommendationLog_userId_idx" ON "AiRecommendationLog"("userId");

-- CreateIndex
CREATE INDEX "AiRecommendationLog_createdAt_idx" ON "AiRecommendationLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiTutorSession_trainingId_idx" ON "AiTutorSession"("trainingId");

-- AddForeignKey
ALTER TABLE "AiTutorSession" ADD CONSTRAINT "AiTutorSession_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneratedExercise" ADD CONSTRAINT "AiGeneratedExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRecommendationLog" ADD CONSTRAINT "AiRecommendationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

