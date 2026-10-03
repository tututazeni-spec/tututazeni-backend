-- AlterTable
ALTER TABLE "TrainingAvatar" ADD COLUMN "knowledgeBase" TEXT;

-- AlterTable
ALTER TABLE "AvatarTrainingProgram" ADD COLUMN "languageVariant" TEXT,
ADD COLUMN "certificateMinScore" INTEGER,
ADD COLUMN "certificateRequireAllSessions" BOOLEAN NOT NULL DEFAULT true;
