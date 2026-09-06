-- Fase E: fusão declarations + work-declaration.
-- /declarations/documents passa a ser servido pela tabela "declarations";
-- DeclarationRequest deixa de ser escrito. Colunas de rastreio da migração.

-- AlterTable
ALTER TABLE "declarations" ADD COLUMN "legacyRequestId" INTEGER;
ALTER TABLE "declarations" ADD COLUMN "legacyStatus" "DocumentRequestStatus";
ALTER TABLE "declarations" ADD COLUMN "legacyPurposeId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "declarations_legacyRequestId_key" ON "declarations"("legacyRequestId");

-- CreateIndex
CREATE INDEX "declarations_legacyStatus_idx" ON "declarations"("legacyStatus");
