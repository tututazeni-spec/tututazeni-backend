-- Certificados fatia 1: regras de emissão + campos de emissão idempotente.
-- Aditiva: registos existentes ficam ACTIVE (ou EXPIRED/REVOKED conforme o estado real).

CREATE TYPE "CertificateStatus" AS ENUM ('PENDING', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE "CertificateIssueMode" AS ENUM ('AUTOMATIC', 'MANUAL', 'APPROVAL');
CREATE TYPE "CertificateActivityKind" AS ENUM ('COURSE', 'TRAINING', 'LEARNING_PATH', 'EVENT');

ALTER TABLE "Certificate"
  ADD COLUMN "status" "CertificateStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "activityKind" "CertificateActivityKind",
  ADD COLUMN "activityId" INTEGER,
  ADD COLUMN "cycleKey" TEXT NOT NULL DEFAULT '1',
  ADD COLUMN "dedupKey" TEXT,
  ADD COLUMN "hours" DOUBLE PRECISION,
  ADD COLUMN "snapshot" TEXT;

UPDATE "Certificate" SET "status" = 'EXPIRED' WHERE "revoked" = false AND "expiresAt" IS NOT NULL AND "expiresAt" < now();
UPDATE "Certificate" SET "status" = 'REVOKED' WHERE "revoked" = true;

CREATE UNIQUE INDEX "Certificate_dedupKey_key" ON "Certificate"("dedupKey");
CREATE INDEX "Certificate_status_idx" ON "Certificate"("status");
CREATE INDEX "Certificate_activityKind_activityId_idx" ON "Certificate"("activityKind", "activityId");

CREATE TABLE "CertificateRule" (
  "id" SERIAL NOT NULL,
  "activityKind" "CertificateActivityKind" NOT NULL,
  "activityId" INTEGER NOT NULL,
  "mode" "CertificateIssueMode" NOT NULL DEFAULT 'AUTOMATIC',
  "criteria" TEXT NOT NULL,
  "templateId" TEXT,
  "validityDays" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificateRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CertificateRule_activityKind_activityId_key" ON "CertificateRule"("activityKind", "activityId");
