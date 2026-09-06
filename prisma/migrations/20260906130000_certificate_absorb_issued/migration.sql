-- Fase F2: Certificate absorve IssuedCertificate. Colunas nullable/defaulted.

ALTER TABLE "Certificate"
  ADD COLUMN "hashCode" TEXT,
  ADD COLUMN "title" TEXT,
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "issuerName" TEXT DEFAULT 'INNOVA',
  ADD COLUMN "score" DOUBLE PRECISION,
  ADD COLUMN "pdfUrl" TEXT,
  ADD COLUMN "publicUrl" TEXT,
  ADD COLUMN "linkedInUrl" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokeReason" TEXT,
  ADD COLUMN "revokedById" INTEGER,
  ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "verifyCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "issuedById" INTEGER,
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "metadata" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "legacyType" "CertificateTemplateType",
  ADD COLUMN "legacyIssuedCertId" TEXT;

CREATE UNIQUE INDEX "Certificate_legacyIssuedCertId_key" ON "Certificate"("legacyIssuedCertId");
CREATE INDEX "Certificate_legacyType_idx" ON "Certificate"("legacyType");
