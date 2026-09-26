-- CreateTable
CREATE TABLE "RoiConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "discountRatePercent" DOUBLE PRECISION,
    "defaultIsolationFactorsJson" TEXT,
    "level45CostThreshold" DOUBLE PRECISION,
    "defaultMeasurementPeriods" INTEGER[] DEFAULT ARRAY[30, 60, 90, 180]::INTEGER[],
    "defaultBenefitValidatorIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "benefitConversionFormulasJson" TEXT,
    "financialAccessRoles" TEXT[] DEFAULT ARRAY['ADMIN', 'RH', 'DIRECTOR']::TEXT[],
    "operationalOnlyRoles" TEXT[] DEFAULT ARRAY['GESTOR', 'LIDER']::TEXT[],
    "alertNoMeasurementDays" INTEGER,
    "alertRoiBelowExpectedPercent" DOUBLE PRECISION,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoiConfig_pkey" PRIMARY KEY ("id")
);
