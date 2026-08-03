-- Lote 12 (sub-projecto 2): conversão de ~14 campos String/String[] para
-- enums Prisma em Doc Repository, Engagement core (surveys), OKRs/Monitoria
-- e Saved Reports. Todas as tabelas alvo estão vazias em innova_dev/
-- innova_test — sem necessidade de UPDATE defensivo.
--
-- Gestão Académica e Dashboard Institucional foram investigados neste lote
-- mas não tiveram nenhum campo convertido: Gestão Académica já estava
-- inteiramente enum-tipada antes deste sub-projecto começar (os únicos
-- Strings restantes, AcademicProgram.category/certificateType, são texto
-- livre ou um achado estrutural já documentado no CLAUDE.md); Dashboard
-- Institucional's DashboardWidget.size é texto livre sem vocabulário
-- fechado em código (só @IsString() com default 'medium').
--
-- Bónus (fora da conversão mecânica): document-repository.dto.ts tinha
-- enums TS locais (DocCategory, DocSensitivity, DocStatus, ShareLinkAccess)
-- duplicando enums Prisma reais já usados pelos mesmos campos — o local
-- "DocCategory" divergia do real "DocCategoryType" (faltavam 8 valores:
-- POLITICA, MANUAL, PROCEDIMENTO, FORMULARIO, CONTRATO, REGULAMENTO,
-- COMUNICADO, OUTRO), bloqueando silenciosamente a criação de documentos
-- com essas categorias válidas. Consolidados para importar de
-- @prisma/client em vez de duplicar.

DO $$ BEGIN
  CREATE TYPE "DocOrigin" AS ENUM ('UPLOAD', 'SYSTEM', 'INTEGRATION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocPermissionType" AS ENUM ('VIEW', 'COMMENT', 'EDIT', 'SHARE', 'DELETE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocAuditAction" AS ENUM ('UPLOADED', 'VIEWED', 'DOWNLOADED', 'UPDATED', 'VERSIONED', 'SHARED', 'ARCHIVED', 'DELETED', 'ACCESS_DENIED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SurveyType" AS ENUM ('CLIMATE', 'PULSE', 'ENPS', 'ONBOARDING', 'OFFBOARDING', 'CUSTOM', 'WELLBEING');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SurveyQuestionType" AS ENUM ('SCALE', 'MULTIPLE', 'TEXT', 'ENPS', 'EMOJI');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ObjectiveStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "KeyResultStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MonitoringEvalType" AS ENUM ('SELF', 'MANAGER', 'PEER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MonitoringEvalStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReportCategory" AS ENUM ('HR', 'LEARNING', 'PERFORMANCE', 'ENGAGEMENT', 'TALENT', 'COMPLIANCE', 'OPERATIONAL', 'FINANCIAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExportFormat" AS ENUM ('JSON', 'CSV', 'XLSX', 'PDF', 'HTML');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ScheduleFrequency" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Document Repository
ALTER TABLE "Document" ALTER COLUMN "origin" DROP DEFAULT;
ALTER TABLE "Document" ALTER COLUMN "origin" TYPE "DocOrigin" USING "origin"::"DocOrigin";
ALTER TABLE "Document" ALTER COLUMN "origin" SET DEFAULT 'UPLOAD';

ALTER TABLE "DocPermission" ALTER COLUMN "permissions" TYPE "DocPermissionType"[] USING "permissions"::text[]::"DocPermissionType"[];

ALTER TABLE "DocAuditLog" ALTER COLUMN "action" TYPE "DocAuditAction" USING "action"::"DocAuditAction";

-- Engagement core (surveys)
ALTER TABLE "EngagementSurvey" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "EngagementSurvey" ALTER COLUMN "type" TYPE "SurveyType" USING "type"::"SurveyType";
ALTER TABLE "EngagementSurvey" ALTER COLUMN "type" SET DEFAULT 'PULSE';

ALTER TABLE "EngagementSurvey" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EngagementSurvey" ALTER COLUMN "status" TYPE "SurveyStatus" USING "status"::"SurveyStatus";
ALTER TABLE "EngagementSurvey" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "SurveyQuestion" ALTER COLUMN "type" TYPE "SurveyQuestionType" USING "type"::"SurveyQuestionType";

-- OKRs / Monitoria
ALTER TABLE "Objective" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Objective" ALTER COLUMN "status" TYPE "ObjectiveStatus" USING "status"::"ObjectiveStatus";
ALTER TABLE "Objective" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "KeyResult" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "KeyResult" ALTER COLUMN "status" TYPE "KeyResultStatus" USING "status"::"KeyResultStatus";
ALTER TABLE "KeyResult" ALTER COLUMN "status" SET DEFAULT 'ON_TRACK';

ALTER TABLE "UserEvaluation" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "UserEvaluation" ALTER COLUMN "type" TYPE "MonitoringEvalType" USING "type"::"MonitoringEvalType";
ALTER TABLE "UserEvaluation" ALTER COLUMN "type" SET DEFAULT 'MANAGER';

ALTER TABLE "UserEvaluation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "UserEvaluation" ALTER COLUMN "status" TYPE "MonitoringEvalStatus" USING "status"::"MonitoringEvalStatus";
ALTER TABLE "UserEvaluation" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Saved Reports
ALTER TABLE "SavedReport" ALTER COLUMN "category" TYPE "ReportCategory" USING "category"::"ReportCategory";

ALTER TABLE "ReportSchedule" ALTER COLUMN "frequency" TYPE "ScheduleFrequency" USING "frequency"::"ScheduleFrequency";

ALTER TABLE "ReportSchedule" ALTER COLUMN "formats" DROP DEFAULT;
ALTER TABLE "ReportSchedule" ALTER COLUMN "formats" TYPE "ExportFormat"[] USING "formats"::text[]::"ExportFormat"[];
ALTER TABLE "ReportSchedule" ALTER COLUMN "formats" SET DEFAULT ARRAY[]::"ExportFormat"[];
