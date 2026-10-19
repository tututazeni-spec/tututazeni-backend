-- Certificados fatia 2: templates configuráveis e versionados + armazém de imagens.
-- Aditiva: templates existentes ficam isSystem=false, sem config nem versões.

CREATE TYPE "CertificateAssetKind" AS ENUM ('LOGO', 'BACKGROUND', 'SIGNATURE');

ALTER TABLE "CertificateTemplate"
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "layoutKey" TEXT,
  ADD COLUMN "config" TEXT,
  ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CertificateTemplateVersion" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "config" TEXT NOT NULL,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificateTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CertificateTemplateVersion_templateId_version_key"
  ON "CertificateTemplateVersion"("templateId", "version");
CREATE INDEX "CertificateTemplateVersion_templateId_idx" ON "CertificateTemplateVersion"("templateId");

ALTER TABLE "CertificateTemplateVersion"
  ADD CONSTRAINT "CertificateTemplateVersion_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CertificateAsset" (
  "id" TEXT NOT NULL,
  "kind" "CertificateAssetKind" NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificateAsset_pkey" PRIMARY KEY ("id")
);
