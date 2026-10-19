-- Certificados fatia 4: ciclo de vida (origem, reemissão ligada ao original, alerta de validade).
-- Aditiva: certificados existentes ficam INTERNAL, sem reemissão e sem alerta enviado.

CREATE TYPE "CertificateOrigin" AS ENUM ('INTERNAL', 'EXTERNAL');

ALTER TABLE "Certificate"
  ADD COLUMN "origin" "CertificateOrigin" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "replacesId" INTEGER,
  ADD COLUMN "observations" TEXT,
  ADD COLUMN "lastExpiryAlertDays" INTEGER;

ALTER TABLE "Certificate"
  ADD CONSTRAINT "Certificate_replacesId_fkey"
  FOREIGN KEY ("replacesId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Certificate_replacesId_idx" ON "Certificate"("replacesId");
CREATE INDEX "Certificate_expiresAt_idx" ON "Certificate"("expiresAt");
