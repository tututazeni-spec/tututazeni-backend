-- CreateEnum
CREATE TYPE "ExecutiveExportFormat" AS ENUM ('PDF', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "ExecutiveScheduleFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ExecutiveAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ExecutiveAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "ExecutiveReport" ADD COLUMN     "content" JSONB,
ADD COLUMN     "filters" JSONB,
ADD COLUMN     "formulaVersion" TEXT,
ADD COLUMN     "scheduleId" INTEGER,
ADD COLUMN     "templateCode" TEXT,
ADD COLUMN     "templateVersion" INTEGER;

-- CreateTable
CREATE TABLE "ExecutiveReportTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'CUSTOM',
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveReportSchedule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "templateCode" TEXT,
    "templateId" INTEGER,
    "frequency" "ExecutiveScheduleFrequency" NOT NULL,
    "hour" INTEGER NOT NULL DEFAULT 8,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "format" "ExecutiveExportFormat" NOT NULL DEFAULT 'PDF',
    "filters" JSONB,
    "recipientIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastReportId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveReportScheduleRun" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "reportId" INTEGER,
    "delivered" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "rejected" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "errorMessage" TEXT,

    CONSTRAINT "ExecutiveReportScheduleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveAlertRule" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION,
    "unit" TEXT,
    "severity" "ExecutiveAlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "ownerId" INTEGER,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveAlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveAlert" (
    "id" SERIAL NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "ExecutiveAlertSeverity" NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" INTEGER,
    "link" TEXT,
    "value" DOUBLE PRECISION,
    "departmentId" INTEGER,
    "ownerId" INTEGER,
    "dueDate" TIMESTAMP(3),
    "status" "ExecutiveAlertStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutiveAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveAlertEvent" (
    "id" SERIAL NOT NULL,
    "alertId" INTEGER NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecutiveReportTemplate_createdById_idx" ON "ExecutiveReportTemplate"("createdById");

-- CreateIndex
CREATE INDEX "ExecutiveReportSchedule_active_nextRunAt_idx" ON "ExecutiveReportSchedule"("active", "nextRunAt");

-- CreateIndex
CREATE INDEX "ExecutiveReportSchedule_createdById_idx" ON "ExecutiveReportSchedule"("createdById");

-- CreateIndex
CREATE INDEX "ExecutiveReportScheduleRun_scheduleId_startedAt_idx" ON "ExecutiveReportScheduleRun"("scheduleId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveAlertRule_code_key" ON "ExecutiveAlertRule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveAlert_fingerprint_key" ON "ExecutiveAlert"("fingerprint");

-- CreateIndex
CREATE INDEX "ExecutiveAlert_status_severity_idx" ON "ExecutiveAlert"("status", "severity");

-- CreateIndex
CREATE INDEX "ExecutiveAlert_ruleCode_idx" ON "ExecutiveAlert"("ruleCode");

-- CreateIndex
CREATE INDEX "ExecutiveAlert_ownerId_idx" ON "ExecutiveAlert"("ownerId");

-- CreateIndex
CREATE INDEX "ExecutiveAlert_departmentId_idx" ON "ExecutiveAlert"("departmentId");

-- CreateIndex
CREATE INDEX "ExecutiveAlertEvent_alertId_idx" ON "ExecutiveAlertEvent"("alertId");

-- CreateIndex
CREATE INDEX "ExecutiveReport_templateCode_idx" ON "ExecutiveReport"("templateCode");

-- CreateIndex
CREATE INDEX "ExecutiveReport_scheduleId_idx" ON "ExecutiveReport"("scheduleId");

-- AddForeignKey
ALTER TABLE "ExecutiveReport" ADD CONSTRAINT "ExecutiveReport_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ExecutiveReportSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveReportTemplate" ADD CONSTRAINT "ExecutiveReportTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveReportSchedule" ADD CONSTRAINT "ExecutiveReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveReportScheduleRun" ADD CONSTRAINT "ExecutiveReportScheduleRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ExecutiveReportSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveAlertRule" ADD CONSTRAINT "ExecutiveAlertRule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveAlert" ADD CONSTRAINT "ExecutiveAlert_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveAlertEvent" ADD CONSTRAINT "ExecutiveAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "ExecutiveAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveAlertEvent" ADD CONSTRAINT "ExecutiveAlertEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

