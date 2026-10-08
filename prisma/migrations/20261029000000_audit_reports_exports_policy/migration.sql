-- CreateTable
CREATE TABLE "AuditPolicy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "requiredEvents" TEXT[],
    "coveredModules" TEXT[],
    "severityRules" JSONB,
    "alertRules" JSONB,
    "retentionDays" JSONB,
    "archivePolicy" TEXT,
    "viewRoles" TEXT[],
    "exportRoles" TEXT[],
    "maskSensitive" BOOLEAN NOT NULL DEFAULT true,
    "maskedFields" TEXT[],
    "backupDestination" TEXT,
    "backupFrequency" TEXT,
    "serviceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "failureAlertEmails" TEXT[],
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditExport" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "reportType" TEXT,
    "incidentId" INTEGER,
    "auditId" INTEGER,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "filters" JSONB,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "confidentiality" TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
    "sha256" TEXT NOT NULL,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" BYTEA,

    CONSTRAINT "AuditExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditExportAccess" (
    "id" SERIAL NOT NULL,
    "exportId" INTEGER NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditExportAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditExport_code_key" ON "AuditExport"("code");

-- CreateIndex
CREATE INDEX "AuditExport_kind_idx" ON "AuditExport"("kind");

-- CreateIndex
CREATE INDEX "AuditExport_createdAt_idx" ON "AuditExport"("createdAt");

-- CreateIndex
CREATE INDEX "AuditExport_retentionUntil_idx" ON "AuditExport"("retentionUntil");

-- CreateIndex
CREATE INDEX "AuditExport_incidentId_idx" ON "AuditExport"("incidentId");

-- CreateIndex
CREATE INDEX "AuditExport_auditId_idx" ON "AuditExport"("auditId");

-- CreateIndex
CREATE INDEX "AuditExportAccess_exportId_idx" ON "AuditExportAccess"("exportId");

-- AddForeignKey
ALTER TABLE "AuditExportAccess" ADD CONSTRAINT "AuditExportAccess_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "AuditExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

