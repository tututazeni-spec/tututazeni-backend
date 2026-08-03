-- Lote 9 (sub-projecto 2): conversão de 7 campos String para enums Prisma
-- em Legacy Employee (Contract/CareerPlan/LegacyPdi/EmployeeDocument) e
-- Declarações (DeclarationSignature/DeclarationAccessLog/DeclarationAuditLog).
-- Todas as tabelas alvo estão vazias em innova_dev/innova_test — sem
-- necessidade de UPDATE defensivo de normalização.
--
-- Contract.status reutiliza o enum "EmployeeStatus" já existente
-- (Employee.status) — confirmado que UpdateContractStatusDto já valida
-- @IsEnum(EmployeeStatus) e updateContractStatus() grava esse valor
-- directamente.
--
-- CareerPlan.status (modelo legado ligado a Employee) usa o novo enum
-- "LegacyCareerPlanStatus" — nome distinto de "CareerPlanStatus" (já
-- existente para UserCareerPlan, o módulo career moderno, com valores
-- diferentes: DRAFT/ACTIVE/COMPLETED/PAUSED/ARCHIVED).
--
-- DeclarationAuditLog.action é convertido (ao contrário de AuditLog.action
-- no lote 7) porque tem um único escritor confirmado por grep
-- (work-declaration.service.ts) com um conjunto fechado e estável de 7
-- valores observados + 1 documentado no comentário do schema (REVOKED,
-- não observado em código mas mantido por segurança).
--
-- Deixados como String livre (não convertidos): Employee.role (busca por
-- "contains", texto livre de cargo), Feedback360.evaluatorRole (sem
-- vocabulário fixo declarado em código), EmployeeDocument.type (mesmo
-- padrão de OnboardingDocument.documentType já documentado no lote 5).

CREATE TYPE "LegacyCareerPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "LegacyPdiStatus" AS ENUM ('ACTIVE', 'COMPLETED');
CREATE TYPE "EmployeeDocumentStatus" AS ENUM ('ACTIVE', 'DELETED');
CREATE TYPE "SignerRole" AS ENUM ('RH', 'MANAGER', 'DIRECTOR');
CREATE TYPE "AccessMethod" AS ENUM ('QR_CODE', 'DIRECT_LINK', 'EMAIL_LINK');
CREATE TYPE "DeclarationAuditAction" AS ENUM ('REQUESTED', 'CREATED', 'UPDATED', 'STATUS_CHANGED', 'SIGNED', 'EXPORTED', 'SENT', 'REVOKED');

ALTER TABLE "Contract" ALTER COLUMN "status" TYPE "EmployeeStatus" USING "status"::"EmployeeStatus";

ALTER TABLE "CareerPlan" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CareerPlan" ALTER COLUMN "status" TYPE "LegacyCareerPlanStatus" USING "status"::"LegacyCareerPlanStatus";
ALTER TABLE "CareerPlan" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "LegacyPdi" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "LegacyPdi" ALTER COLUMN "status" TYPE "LegacyPdiStatus" USING "status"::"LegacyPdiStatus";
ALTER TABLE "LegacyPdi" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "EmployeeDocument" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EmployeeDocument" ALTER COLUMN "status" TYPE "EmployeeDocumentStatus" USING "status"::"EmployeeDocumentStatus";
ALTER TABLE "EmployeeDocument" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "declaration_signatures" ALTER COLUMN "signerRole" TYPE "SignerRole" USING "signerRole"::"SignerRole";
ALTER TABLE "declaration_access_logs" ALTER COLUMN "accessedVia" TYPE "AccessMethod" USING "accessedVia"::"AccessMethod";
ALTER TABLE "declaration_audit_logs" ALTER COLUMN "action" TYPE "DeclarationAuditAction" USING "action"::"DeclarationAuditAction";
