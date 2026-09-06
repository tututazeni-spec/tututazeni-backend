-- Fase E: DeclarationRequest.generatedAt sem equivalente em "declarations".
ALTER TABLE "declarations" ADD COLUMN "legacyGeneratedAt" TIMESTAMP(3);
