-- AlterTable
ALTER TABLE "EngagementSurvey" ADD COLUMN     "anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minResponsesForResults" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'PULSE';

-- AlterTable
ALTER TABLE "SurveyQuestion" ADD COLUMN     "options" TEXT[],
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scaleMax" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "SurveyResponse" ADD COLUMN     "anonymous" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "EngagementSurvey_type_idx" ON "EngagementSurvey"("type");
