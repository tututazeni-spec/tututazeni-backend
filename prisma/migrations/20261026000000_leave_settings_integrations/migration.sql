-- AlterTable
ALTER TABLE "LeaveBalance" ADD COLUMN     "reserved" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LeaveBalanceHistory" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'ADJUSTMENT';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" INTEGER,
ADD COLUMN     "requestNumber" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "leave_setting_versions" (
    "id" SERIAL NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "values" JSONB NOT NULL,
    "changeNote" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_setting_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_holidays" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_delegations" (
    "id" SERIAL NOT NULL,
    "delegatorId" INTEGER NOT NULL,
    "delegateId" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_setting_versions_effectiveFrom_idx" ON "leave_setting_versions"("effectiveFrom");

-- CreateIndex
CREATE INDEX "leave_holidays_date_idx" ON "leave_holidays"("date");

-- CreateIndex
CREATE INDEX "leave_holidays_location_idx" ON "leave_holidays"("location");

-- CreateIndex
CREATE INDEX "leave_delegations_delegatorId_active_idx" ON "leave_delegations"("delegatorId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_requestNumber_key" ON "LeaveRequest"("requestNumber");


-- Backfill (docs/Modulo_Leave.md §12/§13): nº do pedido, data de submissão e
-- reservas de saldo dos pedidos que já estão PENDING.
UPDATE "LeaveRequest"
SET "requestNumber" = 'LV-' || EXTRACT(YEAR FROM "createdAt")::int || '-' || LPAD("id"::text, 6, '0'),
    "submittedAt" = CASE WHEN "status"::text <> 'DRAFT' THEN "createdAt" ELSE NULL END
WHERE "requestNumber" IS NULL;

UPDATE "LeaveBalance" b
SET "reserved" = COALESCE((
  SELECT SUM(r."workDays") FROM "LeaveRequest" r
  WHERE r."userId" = b."userId" AND r."leaveTypeCode" = b."leaveTypeCode" AND r."status"::text = 'PENDING'
), 0);
