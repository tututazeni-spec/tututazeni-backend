-- Reciclagem de cursos: eliminar um curso passa a ser soft delete. O curso fica
-- escondido das listas, restaurável durante 30 dias, e é apagado em definitivo
-- pela rotina diária CoursesService.purgeExpiredDeleted.
ALTER TABLE "Course" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Course" ADD COLUMN "deletedById" INTEGER;
CREATE INDEX "Course_deletedAt_idx" ON "Course"("deletedAt");
