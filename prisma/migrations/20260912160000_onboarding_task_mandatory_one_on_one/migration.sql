-- onboarding: "Estrutura" do plano de integração ganha os dois itens pedidos
-- que ainda se apoiavam só em label de UI, sem campo/categoria de dados:
--
-- 1. "Formação obrigatória" — até aqui TRAINING não distinguia formação
--    obrigatória de opcional. isMandatory cobre qualquer categoria (não só
--    TRAINING), default true porque a maioria das tarefas de onboarding é
--    de facto obrigatória; quem cria o plano pode desmarcar caso a caso.
-- 2. "Reuniões 1:1" — até aqui mapeava para MEETING (genérica, também usada
--    para reuniões de equipa). ONE_ON_ONE isola 1:1 como categoria própria;
--    MEETING passa a ser usada só para reuniões de grupo/equipa.
ALTER TABLE "OnboardingTemplateTask" ADD COLUMN "isMandatory" BOOLEAN NOT NULL DEFAULT true;

-- AlterEnum
ALTER TYPE "TaskCategory" ADD VALUE IF NOT EXISTS 'ONE_ON_ONE';
