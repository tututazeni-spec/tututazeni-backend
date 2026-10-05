-- CreateEnum
CREATE TYPE "SecurityIncidentStatus" AS ENUM ('OPEN', 'IN_ANALYSIS', 'MITIGATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InternalAuditStatus" AS ENUM ('PLANNED', 'PREPARING', 'IN_PROGRESS', 'IN_REVIEW', 'AWAITING_CORRECTIVE_ACTIONS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InternalAuditType" AS ENUM ('INTERNAL', 'OPERATIONAL', 'COMPLIANCE', 'SECURITY');

-- CreateTable
CREATE TABLE "SecurityIncident" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "type" TEXT,
    "severity" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "SecurityIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "assigneeId" INTEGER,
    "createdById" INTEGER,
    "resolution" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityIncidentEvidence" (
    "id" SERIAL NOT NULL,
    "incidentId" INTEGER NOT NULL,
    "auditLogId" INTEGER,
    "note" TEXT,
    "addedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityIncidentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalAudit" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "scope" TEXT,
    "type" "InternalAuditType" NOT NULL DEFAULT 'INTERNAL',
    "modules" TEXT[],
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "criteria" TEXT,
    "leadAuditorId" INTEGER,
    "teamIds" INTEGER[],
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" "InternalAuditStatus" NOT NULL DEFAULT 'PLANNED',
    "result" TEXT,
    "closingReport" TEXT,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalAuditCheck" (
    "id" SERIAL NOT NULL,
    "auditId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalAuditCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalAuditEvidence" (
    "id" SERIAL NOT NULL,
    "auditId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "auditLogId" INTEGER,
    "addedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalAuditEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalAuditFinding" (
    "id" SERIAL NOT NULL,
    "auditId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "nonConformity" BOOLEAN NOT NULL DEFAULT false,
    "risk" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalAuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalAuditAction" (
    "id" SERIAL NOT NULL,
    "auditId" INTEGER NOT NULL,
    "findingId" INTEGER,
    "description" TEXT NOT NULL,
    "responsibleId" INTEGER,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalAuditAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityIncident_code_key" ON "SecurityIncident"("code");

-- CreateIndex
CREATE INDEX "SecurityIncident_status_idx" ON "SecurityIncident"("status");

-- CreateIndex
CREATE INDEX "SecurityIncident_severity_idx" ON "SecurityIncident"("severity");

-- CreateIndex
CREATE INDEX "SecurityIncident_detectedAt_idx" ON "SecurityIncident"("detectedAt");

-- CreateIndex
CREATE INDEX "SecurityIncident_assigneeId_idx" ON "SecurityIncident"("assigneeId");

-- CreateIndex
CREATE INDEX "SecurityIncidentEvidence_incidentId_idx" ON "SecurityIncidentEvidence"("incidentId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalAudit_code_key" ON "InternalAudit"("code");

-- CreateIndex
CREATE INDEX "InternalAudit_status_idx" ON "InternalAudit"("status");

-- CreateIndex
CREATE INDEX "InternalAudit_dueDate_idx" ON "InternalAudit"("dueDate");

-- CreateIndex
CREATE INDEX "InternalAuditCheck_auditId_idx" ON "InternalAuditCheck"("auditId");

-- CreateIndex
CREATE INDEX "InternalAuditEvidence_auditId_idx" ON "InternalAuditEvidence"("auditId");

-- CreateIndex
CREATE INDEX "InternalAuditFinding_auditId_idx" ON "InternalAuditFinding"("auditId");

-- CreateIndex
CREATE INDEX "InternalAuditAction_auditId_idx" ON "InternalAuditAction"("auditId");

-- CreateIndex
CREATE INDEX "InternalAuditAction_findingId_idx" ON "InternalAuditAction"("findingId");

-- AddForeignKey
ALTER TABLE "SecurityIncidentEvidence" ADD CONSTRAINT "SecurityIncidentEvidence_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalAuditCheck" ADD CONSTRAINT "InternalAuditCheck_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "InternalAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalAuditEvidence" ADD CONSTRAINT "InternalAuditEvidence_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "InternalAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalAuditFinding" ADD CONSTRAINT "InternalAuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "InternalAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalAuditAction" ADD CONSTRAINT "InternalAuditAction_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "InternalAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalAuditAction" ADD CONSTRAINT "InternalAuditAction_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "InternalAuditFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

