-- Reciclagem de conteúdos da biblioteca (apagados ficam 30 dias e podem ser restaurados)
ALTER TABLE "ContentAsset" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" INTEGER;

CREATE INDEX "ContentAsset_deletedAt_idx" ON "ContentAsset"("deletedAt");
