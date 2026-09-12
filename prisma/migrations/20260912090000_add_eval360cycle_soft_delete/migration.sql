-- Soft delete de ciclos de Avaliação 360º (Eval360Cycle): ADMIN/DIRECTOR podem
-- eliminar um ciclo sem perder o registo — fica escondido da listagem normal e
-- pode ser restaurado a partir do separador "Apagados" do módulo de auditoria.
ALTER TABLE "Eval360Cycle" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Eval360Cycle" ADD COLUMN "deletedById" TEXT;
CREATE INDEX "Eval360Cycle_deletedAt_idx" ON "Eval360Cycle"("deletedAt");
