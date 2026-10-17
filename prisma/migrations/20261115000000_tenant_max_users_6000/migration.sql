-- Plataforma dimensionada para ~6000 utilizadores (antes: 100).
ALTER TABLE "tenant_configs" ALTER COLUMN "maxUsers" SET DEFAULT 6000;

-- Tenants que ainda têm o valor por omissão antigo passam ao novo limite.
UPDATE "tenant_configs" SET "maxUsers" = 6000 WHERE "maxUsers" = 100;
