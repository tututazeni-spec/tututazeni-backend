-- evaluation360: sub-fatores do eixo Potencial da matriz 9-box (1-5, nota do
-- gestor via PerformanceReview). Consolidação dos 9 itens pedidos: Liderança/
-- Potencial de liderança continua a vir de Competency.category = LEADERSHIP
-- (não ganha coluna própria); Capacidade de aprendizagem e Agilidade de
-- aprendizagem foram unificadas em learningAgilityScore.
ALTER TABLE "PerformanceReview" ADD COLUMN "learningAgilityScore" INTEGER;
ALTER TABLE "PerformanceReview" ADD COLUMN "adaptabilityScore" INTEGER;
ALTER TABLE "PerformanceReview" ADD COLUMN "ambitionScore" INTEGER;
ALTER TABLE "PerformanceReview" ADD COLUMN "responsibilityReadinessScore" INTEGER;
ALTER TABLE "PerformanceReview" ADD COLUMN "mobilityFlexibilityScore" INTEGER;
ALTER TABLE "PerformanceReview" ADD COLUMN "futureRoleReadinessScore" INTEGER;
