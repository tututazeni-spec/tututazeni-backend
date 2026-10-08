-- onboarding: "Informações gerais" do plano de integração ganha Empresa e
-- Localização (Nome/Descrição/Duração/Departamento/Cargo já existiam via
-- name/description/durationDays/departmentId/positionId). Single-tenant
-- (ver project_innova_arquitetura_modular_roadmap) — company é texto livre,
-- não FK, mesmo padrão dos outros campos `location String?` do schema.
ALTER TABLE "OnboardingTemplate" ADD COLUMN "company" TEXT;
ALTER TABLE "OnboardingTemplate" ADD COLUMN "location" TEXT;

-- AlterEnum
-- Cobre "Estrutura" do plano de integração: faltavam categorias de tarefa
-- para Políticas e procedimentos e Avaliações (as restantes já mapeiam para
-- categorias existentes: Formação obrigatória=TRAINING, Documentos=DOCUMENTS,
-- Apresentações/equipa=SOCIAL, Acessos e equipamentos=IT_ACCESS,
-- Reuniões 1:1=MEETING, Tarefas=ADMIN).
ALTER TYPE "TaskCategory" ADD VALUE IF NOT EXISTS 'POLICIES';
ALTER TYPE "TaskCategory" ADD VALUE IF NOT EXISTS 'EVALUATION';
