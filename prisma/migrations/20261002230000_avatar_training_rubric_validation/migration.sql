-- Validação da rubrica pelo responsável pedagógico (docs/Avatar_Training.md §10)
ALTER TABLE "AvatarTrainingAssessment" ADD COLUMN "rubricValidatedById" INTEGER,
ADD COLUMN "rubricValidatedAt" TIMESTAMP(3);
