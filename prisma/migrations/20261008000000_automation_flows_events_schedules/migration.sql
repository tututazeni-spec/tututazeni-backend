-- AlterTable
ALTER TABLE "automation_executions" ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "resumeAt" TIMESTAMP(3),
ADD COLUMN     "resumePc" INTEGER,
ADD COLUMN     "ruleVersion" INTEGER,
ADD COLUMN     "scheduleId" TEXT;

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "departmentIds" TEXT,
ADD COLUMN     "draft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flowJson" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedBy" TEXT,
ADD COLUMN     "tags" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "automation_versions" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "note" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_events" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordType" TEXT,
    "recordId" TEXT,
    "correlationId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedRules" INTEGER NOT NULL DEFAULT 0,
    "executed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "note" TEXT,

    CONSTRAINT "automation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_schedules" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Luanda',
    "daysOfWeek" TEXT,
    "dayOfMonth" INTEGER,
    "cronExpression" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastError" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "missedPolicy" TEXT NOT NULL DEFAULT 'RUN_ONCE',
    "ownerId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_versions_ruleId_version_key" ON "automation_versions"("ruleId", "version");

-- CreateIndex
CREATE INDEX "automation_events_module_type_idx" ON "automation_events"("module", "type");

-- CreateIndex
CREATE INDEX "automation_events_occurredAt_idx" ON "automation_events"("occurredAt");

-- CreateIndex
CREATE INDEX "automation_events_correlationId_idx" ON "automation_events"("correlationId");

-- CreateIndex
CREATE INDEX "automation_schedules_status_nextRunAt_idx" ON "automation_schedules"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "automation_schedules_ruleId_idx" ON "automation_schedules"("ruleId");

-- CreateIndex
CREATE INDEX "automation_executions_status_resumeAt_idx" ON "automation_executions"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "automation_executions_eventId_idx" ON "automation_executions"("eventId");

-- AddForeignKey
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_schedules" ADD CONSTRAINT "automation_schedules_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

