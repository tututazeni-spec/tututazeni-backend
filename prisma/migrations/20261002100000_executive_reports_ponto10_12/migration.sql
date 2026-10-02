-- CreateTable
CREATE TABLE "ExecutiveKPIDefinition" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "target" DOUBLE PRECISION,
    "warningThreshold" DOUBLE PRECISION,
    "criticalThreshold" DOUBLE PRECISION,
    "ownerId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveKPIDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveReportAudit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "reportId" INTEGER,
    "action" TEXT NOT NULL,
    "filters" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveReportAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveKPIDefinition_code_key" ON "ExecutiveKPIDefinition"("code");

-- CreateIndex
CREATE INDEX "ExecutiveReportAudit_reportId_idx" ON "ExecutiveReportAudit"("reportId");

-- CreateIndex
CREATE INDEX "ExecutiveReportAudit_userId_createdAt_idx" ON "ExecutiveReportAudit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutiveReportAudit_action_createdAt_idx" ON "ExecutiveReportAudit"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "ExecutiveKPIDefinition" ADD CONSTRAINT "ExecutiveKPIDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveReportAudit" ADD CONSTRAINT "ExecutiveReportAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveReportAudit" ADD CONSTRAINT "ExecutiveReportAudit_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExecutiveReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
