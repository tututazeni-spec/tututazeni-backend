-- modulo_settings.md §1 (Visão Geral) e §3 (política de utilizadores)
ALTER TABLE "tenant_configs"
  ADD COLUMN "platformName" TEXT,
  ADD COLUMN "nif" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "sector" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "faviconUrl" TEXT,
  ADD COLUMN "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN "timeFormat" TEXT NOT NULL DEFAULT '24h',
  ADD COLUMN "numberFormat" TEXT NOT NULL DEFAULT 'pt',
  ADD COLUMN "userPolicyJson" TEXT;
