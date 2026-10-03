-- AlterTable
ALTER TABLE "ProcessAuditLog" ADD COLUMN "source" TEXT,
ADD COLUMN "previousStatus" TEXT,
ADD COLUMN "newStatus" TEXT,
ADD COLUMN "reason" TEXT,
ADD COLUMN "result" TEXT,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "correlationId" TEXT;

-- CreateTable
CREATE TABLE "ProcessSetting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessSettingVersion" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "changedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessSettingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessIntegrationLog" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "idempotencyKey" TEXT,
    "correlationId" TEXT,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "processCode" TEXT,
    "instanceId" INTEGER,
    "payload" TEXT,
    "errorMessage" TEXT,
    "actorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessIntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessAuditLog_action_idx" ON "ProcessAuditLog"("action");

-- CreateIndex
CREATE INDEX "ProcessAuditLog_createdAt_idx" ON "ProcessAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ProcessAuditLog_userId_idx" ON "ProcessAuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessSetting_key_key" ON "ProcessSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessSettingVersion_key_version_key" ON "ProcessSettingVersion"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessIntegrationLog_idempotencyKey_key" ON "ProcessIntegrationLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProcessIntegrationLog_module_idx" ON "ProcessIntegrationLog"("module");

-- CreateIndex
CREATE INDEX "ProcessIntegrationLog_status_idx" ON "ProcessIntegrationLog"("status");

-- CreateIndex
CREATE INDEX "ProcessIntegrationLog_createdAt_idx" ON "ProcessIntegrationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ProcessSettingVersion" ADD CONSTRAINT "ProcessSettingVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
