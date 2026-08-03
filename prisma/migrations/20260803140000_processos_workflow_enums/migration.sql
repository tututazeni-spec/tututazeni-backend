-- Lote 6 (sub-projecto 2): conversão de 7 campos String para enums Prisma
-- em Processos & Workflow (ProcessStandard/Step/Instance/StepProgress/ApprovalLog).
-- Todas as tabelas alvo estão vazias em innova_dev/innova_test — sem necessidade
-- de UPDATE defensivo de normalização.
--
-- ProcessStandard.riskLevel reutiliza o enum "RiskLevel" já existente
-- (CriticalPosition, lote 2) — valores idênticos (LOW/MEDIUM/HIGH/CRITICAL).
-- ProcessApprovalLog.action reutiliza o enum "ApprovalDecision" já existente
-- (PdiApproval) — valores idênticos (APPROVE/REJECT).
-- ProcessApprovalLog.status reutiliza o novo enum "ProcessStatus".
--
-- Deixados como String livre (não convertidos): ProcessStep.responsibleRole
-- (referencia Role.code dinâmico, sem vocabulário fixo), StepProgress.action
-- e ProcessAuditLog.action (nomes de acção de auditoria em aberto/crescente,
-- mesmo padrão de AuditLog.entity/NotificationLog.type já documentado).

CREATE TYPE "ProcessStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "StepType" AS ENUM ('START', 'END', 'TASK', 'DECISION', 'GATEWAY', 'REVIEW');
CREATE TYPE "InstanceStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD');
CREATE TYPE "StepProgressStatus" AS ENUM ('WAITING', 'PENDING', 'COMPLETED', 'REJECTED', 'ESCALATED', 'SKIPPED');

ALTER TABLE "ProcessStandard" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ProcessStandard" ALTER COLUMN "status" TYPE "ProcessStatus" USING "status"::"ProcessStatus";
ALTER TABLE "ProcessStandard" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "ProcessStandard" ALTER COLUMN "riskLevel" DROP DEFAULT;
ALTER TABLE "ProcessStandard" ALTER COLUMN "riskLevel" TYPE "RiskLevel" USING "riskLevel"::"RiskLevel";
ALTER TABLE "ProcessStandard" ALTER COLUMN "riskLevel" SET DEFAULT 'LOW';

ALTER TABLE "ProcessStep" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "ProcessStep" ALTER COLUMN "type" TYPE "StepType" USING "type"::"StepType";
ALTER TABLE "ProcessStep" ALTER COLUMN "type" SET DEFAULT 'TASK';

ALTER TABLE "ProcessInstance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ProcessInstance" ALTER COLUMN "status" TYPE "InstanceStatus" USING "status"::"InstanceStatus";
ALTER TABLE "ProcessInstance" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

ALTER TABLE "StepProgress" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "StepProgress" ALTER COLUMN "status" TYPE "StepProgressStatus" USING "status"::"StepProgressStatus";
ALTER TABLE "StepProgress" ALTER COLUMN "status" SET DEFAULT 'WAITING';

ALTER TABLE "ProcessApprovalLog" ALTER COLUMN "action" TYPE "ApprovalDecision" USING "action"::"ApprovalDecision";
ALTER TABLE "ProcessApprovalLog" ALTER COLUMN "status" TYPE "ProcessStatus" USING "status"::"ProcessStatus";
