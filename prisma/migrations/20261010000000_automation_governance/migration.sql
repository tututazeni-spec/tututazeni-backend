-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "critical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastFailureAlertAt" TIMESTAMP(3),
ADD COLUMN     "publishDecisionNote" TEXT,
ADD COLUMN     "publishRequestedAt" TIMESTAMP(3),
ADD COLUMN     "publishRequestedBy" TEXT,
ADD COLUMN     "publishStatus" TEXT,
ADD COLUMN     "templateKey" TEXT;

-- AlterTable
ALTER TABLE "automation_executions" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "automation_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "maxExecutionsPerMinute" INTEGER NOT NULL DEFAULT 120,
    "maxConcurrentPerRule" INTEGER NOT NULL DEFAULT 5,
    "maxEventDepth" INTEGER NOT NULL DEFAULT 5,
    "requireApprovalCritical" BOOLEAN NOT NULL DEFAULT true,
    "failureAlertThreshold" INTEGER NOT NULL DEFAULT 5,
    "failureAlertWindowMinutes" INTEGER NOT NULL DEFAULT 60,
    "archiveAfterDays" INTEGER NOT NULL DEFAULT 90,
    "retentionDays" INTEGER NOT NULL DEFAULT 365,
    "deadLetterRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "auditRetentionDays" INTEGER NOT NULL DEFAULT 730,
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_role_permissions" (
    "id" SERIAL NOT NULL,
    "roleCode" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canTest" BOOLEAN NOT NULL DEFAULT false,
    "canActivate" BOOLEAN NOT NULL DEFAULT false,
    "canExecute" BOOLEAN NOT NULL DEFAULT false,
    "canCancel" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_audit_logs" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "ruleId" INTEGER,
    "action" TEXT NOT NULL,
    "userId" INTEGER,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_connections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'HTTP',
    "baseUrl" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'NONE',
    "headerName" TEXT,
    "username" TEXT,
    "secretEnc" TEXT,
    "secretHint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "ownerId" INTEGER,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_dead_letters" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "executionId" TEXT,
    "eventId" TEXT,
    "correlationId" TEXT,
    "payload" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,
    "resolutionNote" TEXT,

    CONSTRAINT "automation_dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_role_permissions_roleCode_key" ON "automation_role_permissions"("roleCode");

-- CreateIndex
CREATE INDEX "automation_audit_logs_ruleId_createdAt_idx" ON "automation_audit_logs"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_audit_logs_entity_createdAt_idx" ON "automation_audit_logs"("entity", "createdAt");

-- CreateIndex
CREATE INDEX "automation_audit_logs_userId_idx" ON "automation_audit_logs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_connections_name_key" ON "automation_connections"("name");

-- CreateIndex
CREATE INDEX "automation_dead_letters_status_createdAt_idx" ON "automation_dead_letters"("status", "createdAt");

-- CreateIndex
CREATE INDEX "automation_dead_letters_ruleId_idx" ON "automation_dead_letters"("ruleId");

-- CreateIndex
CREATE INDEX "automation_dead_letters_executionId_idx" ON "automation_dead_letters"("executionId");

-- CreateIndex
CREATE INDEX "automation_executions_startedAt_idx" ON "automation_executions"("startedAt");
