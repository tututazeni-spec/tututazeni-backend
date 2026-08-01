-- AlterTable
ALTER TABLE "Eval360Feedback" ADD COLUMN     "competencyId" INTEGER,
ADD COLUMN     "relatedCycleId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "PulseSurvey" ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "questions" TEXT,
ADD COLUMN     "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tenantId" TEXT;
