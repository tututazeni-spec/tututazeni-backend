-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "WidgetType" AS ENUM ('KPI_CARD', 'LINE_CHART', 'BAR_CHART', 'PIE_CHART', 'TABLE', 'ALERT_LIST', 'RANKING', 'MAP');

-- CreateTable
CREATE TABLE "InstitutionalSnapshot" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "type" "SnapshotType" NOT NULL DEFAULT 'MONTHLY',
    "metrics" TEXT NOT NULL,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "totalEnrollments" INTEGER NOT NULL DEFAULT 0,
    "totalBeneficiaries" INTEGER NOT NULL DEFAULT 0,
    "totalFunding" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCertificates" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InstitutionalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "WidgetType" NOT NULL,
    "title" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "size" TEXT NOT NULL DEFAULT 'medium',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstitutionalSnapshot_type_idx" ON "InstitutionalSnapshot"("type");

-- CreateIndex
CREATE INDEX "InstitutionalSnapshot_createdAt_idx" ON "InstitutionalSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "InstitutionalSnapshot_deletedAt_idx" ON "InstitutionalSnapshot"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalSnapshot_period_type_key" ON "InstitutionalSnapshot"("period", "type");

-- CreateIndex
CREATE INDEX "DashboardWidget_userId_idx" ON "DashboardWidget"("userId");

-- CreateIndex
CREATE INDEX "DashboardWidget_type_idx" ON "DashboardWidget"("type");

-- CreateIndex
CREATE INDEX "DashboardWidget_deletedAt_idx" ON "DashboardWidget"("deletedAt");

-- AddForeignKey
ALTER TABLE "InstitutionalSnapshot" ADD CONSTRAINT "InstitutionalSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
