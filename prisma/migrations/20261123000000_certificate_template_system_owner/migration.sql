-- Modelos de sistema (criados automaticamente) não têm autor humano.
ALTER TABLE "CertificateTemplate" ALTER COLUMN "createdById" DROP NOT NULL;
