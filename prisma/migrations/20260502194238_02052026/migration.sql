/*
  Warnings:

  - You are about to drop the column `department` on the `CareerPath` table. All the data in the column will be lost.
  - You are about to drop the column `pathId` on the `CareerPathStep` table. All the data in the column will be lost.
  - You are about to drop the column `employerSocialSecurity` on the `Payslip` table. All the data in the column will be lost.
  - The `status` column on the `Payslip` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `actionId` on the `PdiEvidence` table. All the data in the column will be lost.
  - You are about to drop the column `readiness` on the `SuccessionPlan` table. All the data in the column will be lost.
  - You are about to drop the `AutomationRule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeclarationTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IntegrationConfig` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[careerPathId,order]` on the table `CareerPathStep` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[criticalPositionId,candidateId]` on the table `SuccessionPlan` will be added. If there are existing duplicate values, this will fail.
  - Made the column `severity` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `status` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `type` on the `CareerPath` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `careerPathId` to the `CareerPathStep` table without a default value. This is not possible if the table is not empty.
  - Added the required column `positionId` to the `CareerPathStep` table without a default value. This is not possible if the table is not empty.
  - Added the required column `developmentPlanActionId` to the `PdiEvidence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `criticalPositionId` to the `SuccessionPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priority` to the `SuccessionPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `readinessLevel` to the `SuccessionPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SuccessionPlan` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'ISSUED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeclarationLocale" AS ENUM ('PT', 'EN', 'FR');

-- CreateEnum
CREATE TYPE "SignatureType" AS ENUM ('IMAGE_UPLOAD', 'DIGITAL_CERTIFIED');

-- CreateEnum
CREATE TYPE "DeclarationType" AS ENUM ('EMPLOYMENT', 'TRAINING', 'ATTENDANCE', 'PERFORMANCE', 'BANKING', 'LEGAL', 'ACADEMIC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DocumentLayout" AS ENUM ('FORMAL', 'INSTITUTIONAL', 'SIMPLE');

-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SsoProvider" AS ENUM ('GOOGLE', 'MICROSOFT', 'SAML', 'OIDC', 'SLACK');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('ERP_HR', 'PAYROLL', 'ATS', 'MICROSOFT_TEAMS', 'SLACK', 'SSO_GOOGLE', 'SSO_MICROSOFT', 'SCORM_PROVIDER', 'XAPI_LRS', 'BI_TOOL', 'CUSTOM_WEBHOOK');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'PENDING_AUTH', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "SyncFrequency" AS ENUM ('REALTIME', 'HOURLY', 'DAILY', 'WEEKLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('USER_HIRED', 'USER_PROMOTED', 'USER_TRANSFERRED', 'USER_OFFBOARDED', 'COURSE_COMPLETED', 'CERTIFICATE_EXPIRED', 'TRAIL_COMPLETED', 'SCHEDULED_CRON', 'WEBHOOK_EVENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('PERFORMANCE', 'SECURITY', 'INTEGRATION', 'STORAGE', 'SLA_BREACH', 'AUTOMATION', 'COMPLIANCE');

-- DropForeignKey
ALTER TABLE "CareerPathStep" DROP CONSTRAINT "CareerPathStep_pathId_fkey";

-- DropForeignKey
ALTER TABLE "DeclarationRequest" DROP CONSTRAINT "DeclarationRequest_templateId_fkey";

-- DropForeignKey
ALTER TABLE "DeclarationTemplate" DROP CONSTRAINT "DeclarationTemplate_createdById_fkey";

-- DropForeignKey
ALTER TABLE "DeclarationTemplate" DROP CONSTRAINT "DeclarationTemplate_purposeId_fkey";

-- DropForeignKey
ALTER TABLE "PdiEvidence" DROP CONSTRAINT "PdiEvidence_actionId_fkey";

-- DropIndex
DROP INDEX "CareerPathStep_pathId_idx";

-- DropIndex
DROP INDEX "CareerPathStep_pathId_order_key";

-- DropIndex
DROP INDEX "PdiEvidence_actionId_idx";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "metadata" SET DATA TYPE TEXT,
ALTER COLUMN "severity" SET NOT NULL,
ALTER COLUMN "severity" SET DEFAULT 'LOW',
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'SUCCESS';

-- AlterTable
ALTER TABLE "CareerPath" DROP COLUMN "department",
ADD COLUMN     "departmentId" INTEGER,
DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CareerPathStep" DROP COLUMN "pathId",
ADD COLUMN     "careerPathId" INTEGER NOT NULL,
ADD COLUMN     "minMonthsRequired" INTEGER,
ADD COLUMN     "minPerformanceScore" DOUBLE PRECISION,
ADD COLUMN     "positionId" INTEGER NOT NULL,
ADD COLUMN     "requiredCompetencyIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "requiredCourseIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "Payslip" DROP COLUMN "employerSocialSecurity",
ADD COLUMN     "advanceDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "bonuses" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "christmasAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "employerInss" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "healthInsurance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "inssOverride" DOUBLE PRECISION,
ADD COLUMN     "irtBracketRate" DOUBLE PRECISION,
ADD COLUMN     "irtFormula" TEXT,
ADD COLUMN     "irtOverride" DOUBLE PRECISION,
ADD COLUMN     "loanDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "mealAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "otherAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "overtime" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "paymentDate" TEXT,
ADD COLUMN     "vacationAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "baseSalary" SET DEFAULT 0,
ALTER COLUMN "totalDeductions" SET DEFAULT 0,
ALTER COLUMN "netSalary" SET DEFAULT 0,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "PayslipAccessLog" ADD COLUMN     "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PdiEvidence" DROP COLUMN "actionId",
ADD COLUMN     "developmentPlanActionId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "SuccessionPlan" DROP COLUMN "readiness",
ADD COLUMN     "available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "criticalPositionId" INTEGER NOT NULL,
ADD COLUMN     "geographicMobility" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "matchScore" DOUBLE PRECISION,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL,
ADD COLUMN     "readinessByDate" TIMESTAMP(3),
ADD COLUMN     "readinessLevel" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "AutomationRule";

-- DropTable
DROP TABLE "DeclarationTemplate";

-- DropTable
DROP TABLE "IntegrationConfig";

-- CreateTable
CREATE TABLE "InternalApplication" (
    "id" SERIAL NOT NULL,
    "vacancyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "motivation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "feedback" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalVacancy" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "positionId" INTEGER,
    "departmentId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 1,
    "closingDate" TIMESTAMP(3),
    "durationDays" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "requiredCompetencyIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "requiredCourseIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalVacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentPool" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "readinessLevel" TEXT NOT NULL,
    "mentorId" INTEGER,
    "notes" TEXT,
    "geographicMobility" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuccessionPDI" (
    "id" SERIAL NOT NULL,
    "successionPlanId" INTEGER NOT NULL,
    "gaps" TEXT NOT NULL,
    "developmentGoals" TEXT,
    "learningPathIds" INTEGER[],
    "courseIds" INTEGER[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessionPDI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriticalPosition" (
    "id" SERIAL NOT NULL,
    "positionId" INTEGER NOT NULL,
    "businessImpact" TEXT NOT NULL,
    "replacementTime" TEXT NOT NULL,
    "exitRisk" TEXT NOT NULL,
    "expectedExitDate" TIMESTAMP(3),
    "criticalReason" TEXT,
    "keyPersonRisk" BOOLEAN NOT NULL DEFAULT false,
    "minSuccessorsRequired" INTEGER NOT NULL DEFAULT 2,
    "requiresDocumentation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriticalPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdiAction" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "courseId" INTEGER,
    "workloadHours" INTEGER,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resources" TEXT[],
    "xpReward" INTEGER NOT NULL DEFAULT 20,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdiAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" "AutomationTrigger" NOT NULL,
    "triggerConfigJson" TEXT NOT NULL,
    "conditionsJson" TEXT,
    "actionsJson" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "triggeredBy" TEXT,
    "targetUserId" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "actionsLog" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uptimePercent" DOUBLE PRECISION NOT NULL DEFAULT 99.5,
    "maxLatencyMs" INTEGER NOT NULL DEFAULT 2000,
    "maxErrorRate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "incidentResponse" INTEGER NOT NULL DEFAULT 60,
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "backupFrequency" TEXT NOT NULL DEFAULT 'DAILY',
    "rpoMinutes" INTEGER NOT NULL DEFAULT 60,
    "rtoMinutes" INTEGER NOT NULL DEFAULT 240,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_delivery_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cdnProvider" TEXT,
    "cdnBaseUrl" TEXT,
    "adaptiveBitrate" BOOLEAN NOT NULL DEFAULT true,
    "bitrateProfiles" TEXT,
    "offlineSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxOfflineDays" INTEGER NOT NULL DEFAULT 30,
    "compressionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxVideoSizeMb" INTEGER NOT NULL DEFAULT 500,
    "allowedFormats" TEXT[] DEFAULT ARRAY['mp4', 'pdf', 'scorm', 'xapi']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_delivery_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scalability_metrics" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "concurrentSessions" INTEGER NOT NULL DEFAULT 0,
    "cpuUsagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memoryUsagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diskUsagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "p95LatencyMs" INTEGER NOT NULL DEFAULT 0,
    "p99LatencyMs" INTEGER NOT NULL DEFAULT 0,
    "requestsPerMinute" INTEGER NOT NULL DEFAULT 0,
    "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uptimePercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "storageUsedGb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandwidthMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "videoStreamCount" INTEGER NOT NULL DEFAULT 0,
    "apiCallsPerMin" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scalability_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_alerts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "category" "AlertCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "notifiedVia" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_configs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "apiKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'INACTIVE',
    "baseUrl" TEXT,
    "authType" TEXT,
    "credentialsJson" TEXT,
    "syncFrequency" "SyncFrequency" NOT NULL DEFAULT 'DAILY',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "webhookUrl" TEXT,
    "webhookEvents" TEXT[],
    "configJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_configs" (
    "id" TEXT NOT NULL,
    "tenantCode" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "plan" "TenantPlan" NOT NULL DEFAULT 'STARTER',
    "maxUsers" INTEGER NOT NULL DEFAULT 100,
    "maxStorageGb" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trialEndsAt" TIMESTAMP(3),
    "billingCycleStart" TIMESTAMP(3),
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "customDomain" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#1E40AF',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'pt',
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Africa/Luanda',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'AOA',
    "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ssoProvider" "SsoProvider",
    "ssoConfigJson" TEXT,
    "offlineModeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adaptiveBitrate" BOOLEAN NOT NULL DEFAULT true,
    "cdnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cdnConfigJson" TEXT,
    "webhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_logs" (
    "id" TEXT NOT NULL,
    "integrationId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "detailsJson" TEXT,

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declarations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "type" "DeclarationType" NOT NULL,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "locale" "DeclarationLocale" NOT NULL DEFAULT 'PT',
    "layout" "DocumentLayout" NOT NULL DEFAULT 'FORMAL',
    "renderedContent" TEXT,
    "pdfUrl" TEXT,
    "docxUrl" TEXT,
    "employeeSnapshot" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "showSalary" BOOLEAN NOT NULL DEFAULT false,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "verificationHash" TEXT,
    "qrCodeUrl" TEXT,
    "requestNotes" TEXT,
    "internalNotes" TEXT,
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_signatures" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "signerId" INTEGER NOT NULL,
    "signerRole" TEXT NOT NULL,
    "type" "SignatureType" NOT NULL DEFAULT 'IMAGE_UPLOAD',
    "signatureUrl" TEXT,
    "certificateData" JSONB,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "declaration_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_audit_logs" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "DeclarationStatus",
    "toStatus" "DeclarationStatus",
    "details" JSONB,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declaration_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_access_logs" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "accessedVia" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declaration_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_attachments" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declaration_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_tenant_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "companyName" TEXT,
    "companyAddress" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "companyNif" TEXT,
    "headerHtml" TEXT,
    "footerHtml" TEXT,
    "defaultLayout" "DocumentLayout" NOT NULL DEFAULT 'FORMAL',
    "defaultLocale" "DeclarationLocale" NOT NULL DEFAULT 'PT',
    "defaultValidity" INTEGER,
    "allowSalaryExposure" BOOLEAN NOT NULL DEFAULT false,
    "requireManagerSignature" BOOLEAN NOT NULL DEFAULT false,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declaration_tenant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purposeId" INTEGER,
    "tenantId" TEXT NOT NULL,
    "type" "DeclarationType" NOT NULL,
    "locale" "DeclarationLocale" NOT NULL DEFAULT 'PT',
    "layout" "DocumentLayout" NOT NULL DEFAULT 'FORMAL',
    "language" "TemplateLanguage" NOT NULL DEFAULT 'PT',
    "content" TEXT NOT NULL,
    "variables" TEXT[],
    "bodyContent" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "validityDays" INTEGER,
    "requiredFields" TEXT[],
    "customVariables" JSONB,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "autoGenerate" BOOLEAN NOT NULL DEFAULT false,
    "validDays" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declaration_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalApplication_userId_idx" ON "InternalApplication"("userId");

-- CreateIndex
CREATE INDEX "InternalApplication_status_idx" ON "InternalApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InternalApplication_vacancyId_userId_key" ON "InternalApplication"("vacancyId", "userId");

-- CreateIndex
CREATE INDEX "InternalVacancy_status_idx" ON "InternalVacancy"("status");

-- CreateIndex
CREATE INDEX "InternalVacancy_type_idx" ON "InternalVacancy"("type");

-- CreateIndex
CREATE INDEX "InternalVacancy_departmentId_idx" ON "InternalVacancy"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentPool_userId_key" ON "TalentPool"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SuccessionPDI_successionPlanId_key" ON "SuccessionPDI"("successionPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "CriticalPosition_positionId_key" ON "CriticalPosition"("positionId");

-- CreateIndex
CREATE INDEX "CriticalPosition_exitRisk_idx" ON "CriticalPosition"("exitRisk");

-- CreateIndex
CREATE INDEX "CriticalPosition_businessImpact_idx" ON "CriticalPosition"("businessImpact");

-- CreateIndex
CREATE INDEX "PdiAction_planId_idx" ON "PdiAction"("planId");

-- CreateIndex
CREATE INDEX "PdiAction_status_idx" ON "PdiAction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "content_delivery_configs_tenantId_key" ON "content_delivery_configs"("tenantId");

-- CreateIndex
CREATE INDEX "scalability_metrics_capturedAt_idx" ON "scalability_metrics"("capturedAt");

-- CreateIndex
CREATE INDEX "scalability_metrics_tenantId_capturedAt_idx" ON "scalability_metrics"("tenantId", "capturedAt");

-- CreateIndex
CREATE INDEX "system_alerts_severity_isResolved_idx" ON "system_alerts"("severity", "isResolved");

-- CreateIndex
CREATE INDEX "system_alerts_tenantId_createdAt_idx" ON "system_alerts"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_configs_tenantCode_key" ON "tenant_configs"("tenantCode");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_code_key" ON "declarations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_verificationHash_key" ON "declarations"("verificationHash");

-- CreateIndex
CREATE INDEX "declarations_tenantId_status_idx" ON "declarations"("tenantId", "status");

-- CreateIndex
CREATE INDEX "declarations_tenantId_employeeId_idx" ON "declarations"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "declarations_tenantId_requestedById_idx" ON "declarations"("tenantId", "requestedById");

-- CreateIndex
CREATE INDEX "declarations_code_idx" ON "declarations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "declaration_signatures_declarationId_signerId_key" ON "declaration_signatures"("declarationId", "signerId");

-- CreateIndex
CREATE INDEX "declaration_audit_logs_declarationId_idx" ON "declaration_audit_logs"("declarationId");

-- CreateIndex
CREATE INDEX "declaration_audit_logs_actorId_idx" ON "declaration_audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "declaration_access_logs_declarationId_idx" ON "declaration_access_logs"("declarationId");

-- CreateIndex
CREATE UNIQUE INDEX "declaration_tenant_configs_tenantId_key" ON "declaration_tenant_configs"("tenantId");

-- CreateIndex
CREATE INDEX "declaration_templates_purposeId_tenantId_type_isActive_idx" ON "declaration_templates"("purposeId", "tenantId", "type", "isActive");

-- CreateIndex
CREATE INDEX "CareerPath_active_idx" ON "CareerPath"("active");

-- CreateIndex
CREATE INDEX "CareerPath_departmentId_idx" ON "CareerPath"("departmentId");

-- CreateIndex
CREATE INDEX "CareerPathStep_careerPathId_idx" ON "CareerPathStep"("careerPathId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPathStep_careerPathId_order_key" ON "CareerPathStep"("careerPathId", "order");

-- CreateIndex
CREATE INDEX "Payslip_period_status_idx" ON "Payslip"("period", "status");

-- CreateIndex
CREATE INDEX "PdiEvidence_developmentPlanActionId_idx" ON "PdiEvidence"("developmentPlanActionId");

-- CreateIndex
CREATE INDEX "SuccessionPlan_readinessLevel_idx" ON "SuccessionPlan"("readinessLevel");

-- CreateIndex
CREATE INDEX "SuccessionPlan_candidateId_idx" ON "SuccessionPlan"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "SuccessionPlan_criticalPositionId_candidateId_key" ON "SuccessionPlan"("criticalPositionId", "candidateId");

-- AddForeignKey
ALTER TABLE "CareerPath" ADD CONSTRAINT "CareerPath_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPathStep" ADD CONSTRAINT "CareerPathStep_careerPathId_fkey" FOREIGN KEY ("careerPathId") REFERENCES "CareerPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPathStep" ADD CONSTRAINT "CareerPathStep_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalApplication" ADD CONSTRAINT "InternalApplication_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "InternalVacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalApplication" ADD CONSTRAINT "InternalApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalVacancy" ADD CONSTRAINT "InternalVacancy_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalVacancy" ADD CONSTRAINT "InternalVacancy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalVacancy" ADD CONSTRAINT "InternalVacancy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_criticalPositionId_fkey" FOREIGN KEY ("criticalPositionId") REFERENCES "CriticalPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPool" ADD CONSTRAINT "TalentPool_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPool" ADD CONSTRAINT "TalentPool_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuccessionPDI" ADD CONSTRAINT "SuccessionPDI_successionPlanId_fkey" FOREIGN KEY ("successionPlanId") REFERENCES "SuccessionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriticalPosition" ADD CONSTRAINT "CriticalPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiEvidence" ADD CONSTRAINT "PdiEvidence_developmentPlanActionId_fkey" FOREIGN KEY ("developmentPlanActionId") REFERENCES "DevelopmentPlanAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdiAction" ADD CONSTRAINT "PdiAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_configs" ADD CONSTRAINT "sla_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_delivery_configs" ADD CONSTRAINT "content_delivery_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scalability_metrics" ADD CONSTRAINT "scalability_metrics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "declaration_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_signatures" ADD CONSTRAINT "declaration_signatures_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_signatures" ADD CONSTRAINT "declaration_signatures_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_audit_logs" ADD CONSTRAINT "declaration_audit_logs_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_audit_logs" ADD CONSTRAINT "declaration_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_access_logs" ADD CONSTRAINT "declaration_access_logs_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_attachments" ADD CONSTRAINT "declaration_attachments_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_attachments" ADD CONSTRAINT "declaration_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_tenant_configs" ADD CONSTRAINT "declaration_tenant_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_templates" ADD CONSTRAINT "declaration_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_templates" ADD CONSTRAINT "declaration_templates_purposeId_fkey" FOREIGN KEY ("purposeId") REFERENCES "DeclarationPurpose"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_templates" ADD CONSTRAINT "declaration_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_templates" ADD CONSTRAINT "declaration_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationRequest" ADD CONSTRAINT "DeclarationRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "declaration_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
