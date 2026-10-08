-- Versões de conteúdo e rubrica registadas por tentativa (docs/Avatar_Training.md §15)
ALTER TABLE "AvatarTrainingAssessment" ADD COLUMN "rubricVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AvatarTrainingAttempt" ADD COLUMN "sessionVersion" INTEGER,
ADD COLUMN "rubricVersion" INTEGER;
