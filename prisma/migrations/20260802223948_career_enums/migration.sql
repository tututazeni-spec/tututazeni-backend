-- CareerPathType e ReadinessLevel já existiam como tipos Postgres (de uma migration
-- anterior) mas nunca chegaram a ser usados por nenhuma coluna — valores antigos
-- (LINEAR|Y_SHAPED|W_SHAPED|HORIZONTAL|HYBRID e READY|DEVELOPING|STARTING) substituídos
-- pelos confirmados via código. Sem colunas a depender deles, drop+recreate é seguro.
DROP TYPE "CareerPathType";
DROP TYPE "ReadinessLevel";

-- CreateEnum
CREATE TYPE "CareerPathType" AS ENUM ('LINEAR', 'Y_SHAPED', 'T_SHAPED', 'W_SHAPED', 'LATTICE');
CREATE TYPE "ReadinessLevel" AS ENUM ('READY_NOW', 'READY_SOON', 'NEEDS_DEVELOPMENT');
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'REVIEWING', 'SHORTLISTED', 'REJECTED', 'ACCEPTED');
CREATE TYPE "VacancyType" AS ENUM ('PROMOTION', 'LATERAL', 'GIG_PROJECT', 'JOB_ROTATION', 'SHADOWING');
CREATE TYPE "VacancyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'FILLED');
CREATE TYPE "SuccessorPriority" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY');
CREATE TYPE "SuccessionPdiStatus" AS ENUM ('ACTIVE');
CREATE TYPE "BusinessImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ReplacementTime" AS ENUM ('IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "PlanPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL');
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'OVERDUE');
CREATE TYPE "ActionType" AS ENUM ('COURSE', 'MENTORING', 'COACHING', 'READING', 'PROJECT', 'JOB_ROTATION', 'MICROLEARNING', 'WORKSHOP', 'CERTIFICATION', 'SHADOWING', 'PEER_COACHING', 'FEEDBACK', 'CONFERENCE', 'OTHER');
CREATE TYPE "ActionStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED', 'OVERDUE');
CREATE TYPE "EvidenceType" AS ENUM ('FILE', 'LINK', 'NOTE');
CREATE TYPE "CheckinType" AS ENUM ('QUICK', 'STRUCTURED');
CREATE TYPE "CheckpointStatus" AS ENUM ('PENDING', 'COMPLETED');
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT');

-- AlterTable: CareerRole (nullable, sem default)
ALTER TABLE "CareerRole" ALTER COLUMN "seniority" TYPE "SeniorityLevel" USING ("seniority"::"SeniorityLevel");

-- AlterTable: CareerPosition
ALTER TABLE "CareerPosition" ALTER COLUMN "level" TYPE "SeniorityLevel" USING ("level"::"SeniorityLevel");

-- AlterTable: CareerPath
ALTER TABLE "CareerPath" ALTER COLUMN "type" TYPE "CareerPathType" USING ("type"::"CareerPathType");

-- AlterTable: InternalApplication
ALTER TABLE "InternalApplication" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "InternalApplication" ALTER COLUMN "status" TYPE "ApplicationStatus" USING ("status"::"ApplicationStatus");
ALTER TABLE "InternalApplication" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: InternalVacancy
ALTER TABLE "InternalVacancy" ALTER COLUMN "type" TYPE "VacancyType" USING ("type"::"VacancyType");
ALTER TABLE "InternalVacancy" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "InternalVacancy" ALTER COLUMN "status" TYPE "VacancyStatus" USING ("status"::"VacancyStatus");
ALTER TABLE "InternalVacancy" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable: SuccessionPlan
ALTER TABLE "SuccessionPlan" ALTER COLUMN "readinessLevel" TYPE "ReadinessLevel" USING ("readinessLevel"::"ReadinessLevel");
ALTER TABLE "SuccessionPlan" ALTER COLUMN "priority" TYPE "SuccessorPriority" USING ("priority"::"SuccessorPriority");

-- AlterTable: TalentPool
ALTER TABLE "TalentPool" ALTER COLUMN "readinessLevel" TYPE "ReadinessLevel" USING ("readinessLevel"::"ReadinessLevel");

-- AlterTable: SuccessionPDI
ALTER TABLE "SuccessionPDI" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SuccessionPDI" ALTER COLUMN "status" TYPE "SuccessionPdiStatus" USING ("status"::"SuccessionPdiStatus");
ALTER TABLE "SuccessionPDI" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable: CriticalPosition
ALTER TABLE "CriticalPosition" ALTER COLUMN "businessImpact" TYPE "BusinessImpact" USING ("businessImpact"::"BusinessImpact");
ALTER TABLE "CriticalPosition" ALTER COLUMN "replacementTime" TYPE "ReplacementTime" USING ("replacementTime"::"ReplacementTime");
ALTER TABLE "CriticalPosition" ALTER COLUMN "exitRisk" TYPE "RiskLevel" USING ("exitRisk"::"RiskLevel");

-- AlterTable: DevelopmentPlan
ALTER TABLE "DevelopmentPlan" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "DevelopmentPlan" ALTER COLUMN "priority" TYPE "PlanPriority" USING ("priority"::"PlanPriority");
ALTER TABLE "DevelopmentPlan" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';
ALTER TABLE "DevelopmentPlan" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DevelopmentPlan" ALTER COLUMN "status" TYPE "PlanStatus" USING (
  CASE "status" WHEN 'PENDING' THEN 'PENDING_APPROVAL' ELSE "status" END::"PlanStatus"
);
ALTER TABLE "DevelopmentPlan" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable: DevelopmentPlanAction
ALTER TABLE "DevelopmentPlanAction" ALTER COLUMN "type" TYPE "ActionType" USING ("type"::"ActionType");
ALTER TABLE "DevelopmentPlanAction" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DevelopmentPlanAction" ALTER COLUMN "status" TYPE "ActionStatus" USING ("status"::"ActionStatus");
ALTER TABLE "DevelopmentPlanAction" ALTER COLUMN "status" SET DEFAULT 'TODO';

-- AlterTable: PdiEvidence
ALTER TABLE "PdiEvidence" ALTER COLUMN "evidenceType" DROP DEFAULT;
ALTER TABLE "PdiEvidence" ALTER COLUMN "evidenceType" TYPE "EvidenceType" USING ("evidenceType"::"EvidenceType");
ALTER TABLE "PdiEvidence" ALTER COLUMN "evidenceType" SET DEFAULT 'NOTE';

-- AlterTable: PdiAction
ALTER TABLE "PdiAction" ALTER COLUMN "type" TYPE "ActionType" USING ("type"::"ActionType");
ALTER TABLE "PdiAction" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PdiAction" ALTER COLUMN "status" TYPE "ActionStatus" USING ("status"::"ActionStatus");
ALTER TABLE "PdiAction" ALTER COLUMN "status" SET DEFAULT 'TODO';

-- AlterTable: PdiCheckpoint
ALTER TABLE "PdiCheckpoint" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "PdiCheckpoint" ALTER COLUMN "type" TYPE "CheckinType" USING ("type"::"CheckinType");
ALTER TABLE "PdiCheckpoint" ALTER COLUMN "type" SET DEFAULT 'QUICK';
ALTER TABLE "PdiCheckpoint" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PdiCheckpoint" ALTER COLUMN "status" TYPE "CheckpointStatus" USING ("status"::"CheckpointStatus");
ALTER TABLE "PdiCheckpoint" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: PdiApproval (normaliza decisões antigas escritas como 'APPROVED' — ver leader.service.ts)
ALTER TABLE "PdiApproval" ALTER COLUMN "decision" TYPE "ApprovalDecision" USING (
  CASE "decision" WHEN 'APPROVED' THEN 'APPROVE' WHEN 'REJECTED' THEN 'REJECT' ELSE "decision" END::"ApprovalDecision"
);
