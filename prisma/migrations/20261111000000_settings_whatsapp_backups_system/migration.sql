-- AlterTable
ALTER TABLE "tenant_configs" ADD COLUMN     "whatsappSettingsJson" TEXT,
ADD COLUMN     "backupSettingsJson" TEXT,
ADD COLUMN     "systemSettingsJson" TEXT;

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" SERIAL NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filePath" TEXT,
    "sizeBytes" BIGINT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "triggeredById" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "restoredById" INTEGER,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_runs_startedAt_idx" ON "backup_runs"("startedAt");

-- CreateIndex
CREATE INDEX "backup_runs_status_idx" ON "backup_runs"("status");
