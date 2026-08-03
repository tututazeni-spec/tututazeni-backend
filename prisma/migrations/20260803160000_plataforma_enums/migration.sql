-- Lote 7 (sub-projecto 2): conversão de 20 campos String para enums Prisma
-- em Plataforma — Notificações/Auditoria/Automação/Integrações/Mobile/Reporting.
--
-- Os CREATE TYPE estão envolvidos em blocos DO...EXCEPTION para serem
-- seguros de reaplicar (idempotentes) — necessário porque a primeira
-- tentativa desta migration falhou a meio (P3018 — nomes de tabela errados
-- para AutomationRule/AutomationExecution/IntegrationConfig/IntegrationSyncLog,
-- que usam @@map para automation_rules/automation_executions/
-- integration_configs/integration_sync_logs) depois de já ter criado os 14
-- tipos e convertido as primeiras 8 colunas em innova_dev. Corrigido aqui
-- com os nomes de tabela reais e tornado seguro para correr do zero
-- (innova_test) ou ser reaplicado sobre um estado parcialmente migrado
-- (innova_dev).
--
-- NotificationLog.priority (1207 registos, todos 'MEDIUM') e AuditLog.status/
-- severity (13846 registos, todos 'SUCCESS'/'LOW') têm dados reais em
-- innova_dev/innova_test, mas os valores observados são todos membros
-- válidos do novo enum — cast directo sem UPDATE defensivo. As restantes
-- tabelas alvo estão vazias.
--
-- AuditLog.severity e ProcessStandard.riskLevel (lote 6) reutilizam o mesmo
-- enum "RiskLevel" (LOW/MEDIUM/HIGH/CRITICAL) já existente.
-- ReportApproval.decision reutiliza "ApprovalDecision" (APPROVE/REJECT) —
-- confirmado que approveReport() grava dto.decision.toUpperCase().
--
-- Deixados como String livre (não convertidos, achados estruturais):
-- NotificationLog.type / NotificationTemplate.eventType (nomes de evento
-- em aberto, escritos por 40+ módulos — grep confirmou 94 ocorrências);
-- AuditLog.action (idem, escrito por common/services/audit.service.ts,
-- usado por 19+ serviços com nomes de acção arbitrários, apesar do
-- comentário no schema documentar só 12 valores — comentário desactualizado,
-- não reflecte o uso real); AutomationRule.trigger/action (já documentado
-- em "Achados estruturais" do plano — coexistem com triggerType:
-- AutomationTrigger, um enum real com valores completamente diferentes;
-- scalability.service.ts usa triggerType/AutomationTrigger enquanto
-- automation.service.ts usa trigger/action String — dois motores paralelos,
-- decisão de arquitectura, não conversão mecânica); MobileSession.platform
-- (string livre enviada pelo cliente, sem vocabulário fixo declarado);
-- ReportLog.type (um único valor observado 'EXECUTIVE', nome de modelo
-- genérico sugere extensão futura por outros geradores de relatório).

DO $$ BEGIN
  CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationCategory" AS ENUM ('LMS', 'PDI', 'PERFORMANCE', 'HR', 'ENGAGEMENT', 'GAMIFICATION', 'SYSTEM', 'ONBOARDING', 'KNOWLEDGE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DigestFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILED', 'DENIED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationCategory" AS ENUM ('HR', 'LMS', 'PERFORMANCE', 'ENGAGEMENT', 'GAMIFICATION', 'OPERATIONAL', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AuthType" AS ENUM ('OAUTH2', 'API_KEY', 'BASIC', 'BEARER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SyncLogStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ApiCallStatus" AS ENUM ('OK', 'ERROR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MobileSyncStatus" AS ENUM ('SUCCESS', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReportType" AS ENUM ('FLASH', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM', 'AUDIT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExecutiveReportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReportConfidentiality" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "KpiStatus" AS ENUM ('GREEN', 'YELLOW', 'RED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Notificações ───────────────────────────────────────────────────────────

ALTER TABLE "NotificationLog" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "NotificationLog" ALTER COLUMN "priority" TYPE "NotificationPriority" USING "priority"::"NotificationPriority";
ALTER TABLE "NotificationLog" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';
ALTER TABLE "NotificationLog" ALTER COLUMN "category" TYPE "NotificationCategory" USING "category"::"NotificationCategory";

ALTER TABLE "NotificationTemplate" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "NotificationTemplate" ALTER COLUMN "priority" TYPE "NotificationPriority" USING "priority"::"NotificationPriority";
ALTER TABLE "NotificationTemplate" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';
ALTER TABLE "NotificationTemplate" ALTER COLUMN "category" TYPE "NotificationCategory" USING "category"::"NotificationCategory";

ALTER TABLE "NotificationPreference" ALTER COLUMN "digestFrequency" DROP DEFAULT;
ALTER TABLE "NotificationPreference" ALTER COLUMN "digestFrequency" TYPE "DigestFrequency" USING "digestFrequency"::"DigestFrequency";
ALTER TABLE "NotificationPreference" ALTER COLUMN "digestFrequency" SET DEFAULT 'NONE';

-- ─── Auditoria ──────────────────────────────────────────────────────────────

ALTER TABLE "AuditLog" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AuditLog" ALTER COLUMN "status" TYPE "AuditStatus" USING "status"::"AuditStatus";
ALTER TABLE "AuditLog" ALTER COLUMN "status" SET DEFAULT 'SUCCESS';

ALTER TABLE "AuditLog" ALTER COLUMN "severity" DROP DEFAULT;
ALTER TABLE "AuditLog" ALTER COLUMN "severity" TYPE "RiskLevel" USING "severity"::"RiskLevel";
ALTER TABLE "AuditLog" ALTER COLUMN "severity" SET DEFAULT 'LOW';

-- ─── Automação (nomes de tabela mapeados via @@map) ─────────────────────────

ALTER TABLE "automation_rules" ALTER COLUMN "category" TYPE "AutomationCategory" USING "category"::"AutomationCategory";
ALTER TABLE "automation_rules" ALTER COLUMN "lastRunStatus" TYPE "ExecutionStatus" USING "lastRunStatus"::"ExecutionStatus";
ALTER TABLE "automation_executions" ALTER COLUMN "status" TYPE "ExecutionStatus" USING "status"::"ExecutionStatus";

-- ─── Integrações (nomes de tabela mapeados via @@map) ───────────────────────

ALTER TABLE "integration_configs" ALTER COLUMN "authType" TYPE "AuthType" USING "authType"::"AuthType";
ALTER TABLE "integration_configs" ALTER COLUMN "lastSyncStatus" TYPE "SyncLogStatus" USING "lastSyncStatus"::"SyncLogStatus";
ALTER TABLE "integration_sync_logs" ALTER COLUMN "status" TYPE "SyncLogStatus" USING "status"::"SyncLogStatus";
ALTER TABLE "ApiIntegrationLog" ALTER COLUMN "status" TYPE "ApiCallStatus" USING "status"::"ApiCallStatus";

-- ─── Mobile ─────────────────────────────────────────────────────────────────

ALTER TABLE "MobileSyncLog" ALTER COLUMN "status" TYPE "MobileSyncStatus" USING "status"::"MobileSyncStatus";

-- ─── Executive Reports ──────────────────────────────────────────────────────

ALTER TABLE "ExecutiveReport" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "ExecutiveReport" ALTER COLUMN "type" TYPE "ReportType" USING "type"::"ReportType";
ALTER TABLE "ExecutiveReport" ALTER COLUMN "type" SET DEFAULT 'MONTHLY';

ALTER TABLE "ExecutiveReport" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ExecutiveReport" ALTER COLUMN "status" TYPE "ExecutiveReportStatus" USING "status"::"ExecutiveReportStatus";
ALTER TABLE "ExecutiveReport" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "ExecutiveReport" ALTER COLUMN "confidentiality" DROP DEFAULT;
ALTER TABLE "ExecutiveReport" ALTER COLUMN "confidentiality" TYPE "ReportConfidentiality" USING "confidentiality"::"ReportConfidentiality";
ALTER TABLE "ExecutiveReport" ALTER COLUMN "confidentiality" SET DEFAULT 'CONFIDENTIAL';

ALTER TABLE "ExecutiveMetric" ALTER COLUMN "status" TYPE "KpiStatus" USING "status"::"KpiStatus";

ALTER TABLE "ReportApproval" ALTER COLUMN "decision" TYPE "ApprovalDecision" USING "decision"::"ApprovalDecision";
