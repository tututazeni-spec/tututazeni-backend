-- Lote 11 (sub-projecto 2): conversão de 2 campos String para enums Prisma
-- em CRM Parceiros. Ambas as tabelas alvo estão vazias em innova_dev/
-- innova_test — sem necessidade de UPDATE defensivo.
--
-- Este lote (CRM — Beneficiários/Parceiros/Financiadores) já estava quase
-- todo enum-tipado antes deste sub-projecto começar. Dos 14 campos
-- examinados, só 2 tinham conversão real por fazer:
--
-- Partner.province reutiliza "AngolaProvince" (já usado por
-- Beneficiary.province) — achado estrutural já documentado no CLAUDE.md
-- ("AngolaProvince existe mas não é usado por todos os modelos com esse
-- conceito"); conversão mecânica segura, mesmos valores.
--
-- PartnerMilestone.priority reutiliza "NeedPriority" (BeneficiaryNeed,
-- mesmo domínio CRM) — sem valor real gravado em código (só o default
-- 'MEDIUM' do schema), mas o mesmo conceito LOW/MEDIUM/HIGH/URGENT.
--
-- Deixados como String livre (examinados, sem vocabulário fixo declarado
-- em código — apenas @IsString() com exemplo/default, sem @IsEnum/@IsIn):
-- Beneficiary.category/source/segment, BeneficiaryInteraction.channel/
-- outcome, BeneficiaryNeed.category, PartnerInteraction.channel/outcome,
-- Funder.category, FundingGrant.reportingCycle, FunderInteraction.outcome.
-- BeneficiaryDocument.type não convertido — modelo confirmado como código
-- morto (zero referências em todo o src/).

ALTER TABLE "Partner" ALTER COLUMN "province" TYPE "AngolaProvince" USING "province"::"AngolaProvince";

ALTER TABLE "PartnerMilestone" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "PartnerMilestone" ALTER COLUMN "priority" TYPE "NeedPriority" USING "priority"::"NeedPriority";
ALTER TABLE "PartnerMilestone" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';
