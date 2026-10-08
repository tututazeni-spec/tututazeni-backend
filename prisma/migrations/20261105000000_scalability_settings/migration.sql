-- modulo_scalability.md §24: configurações (limiares, retenção, frequência, janelas, perfis)
ALTER TABLE "scalability_infra_settings"
  ADD COLUMN "thresholdsJson" TEXT,
  ADD COLUMN "disabledRulesJson" TEXT,
  ADD COLUMN "maintenanceWindowsJson" TEXT,
  ADD COLUMN "metricRetentionDays" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "collectionIntervalMin" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "authorizedRolesJson" TEXT;
