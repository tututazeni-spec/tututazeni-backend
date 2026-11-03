-- Conteúdos adicionados à biblioteca são publicados e activos automaticamente.
ALTER TABLE "ContentAsset" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Os que ficaram em rascunho (criados antes desta regra) passam a activos.
UPDATE "ContentAsset" SET "status" = 'ACTIVE' WHERE "status" = 'DRAFT' AND "deletedAt" IS NULL;
