-- Imagem opcional (data URL ou URL) nos cartões de avaliações formais e ciclos de avaliação.
-- Idempotente: pode já ter sido aplicada à mão numa base de desenvolvimento.
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "EvaluationCampaign" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
