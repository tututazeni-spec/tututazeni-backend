-- modulo_scalability.md §20-21: testes de carga e custos de infraestrutura
CREATE TYPE "ScalabilityLoadTestStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ScalabilityLoadTestVerdict" AS ENUM ('APPROVED', 'APPROVED_WITH_NOTES', 'FAILED');

CREATE TABLE "scalability_load_tests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ScalabilityLoadTestStatus" NOT NULL DEFAULT 'PLANNED',
    "environment" TEXT NOT NULL,
    "appVersion" TEXT,
    "scenario" TEXT,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "simulatedUsers" INTEGER,
    "targetRps" INTEGER,
    "durationSec" INTEGER,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "throughputRps" DOUBLE PRECISION,
    "p95Ms" INTEGER,
    "p99Ms" INTEGER,
    "errorRate" DOUBLE PRECISION,
    "cpuPeak" DOUBLE PRECISION,
    "ramPeak" DOUBLE PRECISION,
    "dbPeakConn" INTEGER,
    "queuePeak" INTEGER,
    "peakConcurrent" INTEGER,
    "verdict" "ScalabilityLoadTestVerdict",
    "observations" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scalability_load_tests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scalability_load_tests_status_createdAt_idx" ON "scalability_load_tests"("status", "createdAt");
CREATE INDEX "scalability_load_tests_type_idx" ON "scalability_load_tests"("type");

CREATE TABLE "scalability_cost_entries" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scalability_cost_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scalability_cost_entries_month_category_key" ON "scalability_cost_entries"("month", "category");
CREATE INDEX "scalability_cost_entries_month_idx" ON "scalability_cost_entries"("month");

ALTER TABLE "scalability_infra_settings" ADD COLUMN "costCurrency" TEXT NOT NULL DEFAULT 'EUR';
