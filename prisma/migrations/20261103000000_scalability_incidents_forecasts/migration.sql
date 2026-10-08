-- modulo_scalability.md §18-19: incidentes de capacidade e capacidade da BD para previsões
CREATE TYPE "ScalabilityIncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'MITIGATING', 'RESOLVED', 'CLOSED');

CREATE TABLE "scalability_incidents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "ScalabilityIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impact" TEXT,
    "affectedUsers" INTEGER,
    "rootCause" TEXT,
    "actionTaken" TEXT,
    "postMortem" TEXT,
    "ownerId" INTEGER,
    "createdById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scalability_incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scalability_incidents_status_occurredAt_idx" ON "scalability_incidents"("status", "occurredAt");
CREATE INDEX "scalability_incidents_component_idx" ON "scalability_incidents"("component");

ALTER TABLE "scalability_infra_settings" ADD COLUMN "dbCapacityGb" DOUBLE PRECISION;
