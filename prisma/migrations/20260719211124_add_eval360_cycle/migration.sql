-- CreateTable
CREATE TABLE "Eval360Cycle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "model" TEXT NOT NULL DEFAULT '360',
    "type" TEXT NOT NULL DEFAULT 'ANNUAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "anonymityMode" TEXT NOT NULL DEFAULT 'ANONYMOUS',
    "quorumMinimum" INTEGER NOT NULL DEFAULT 3,
    "weightSelf" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "weightManager" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "weightPeer" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "weightSubordinate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "weightExternal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cutoffPromotion" DOUBLE PRECISION,
    "cutoffBonus" DOUBLE PRECISION,
    "cutoffProgram" DOUBLE PRECISION,
    "linkedToPdi" BOOLEAN NOT NULL DEFAULT true,
    "linkedToBonus" BOOLEAN NOT NULL DEFAULT false,
    "linkedToOkrs" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Eval360Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Eval360CycleCompetency" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Eval360CycleCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Eval360Cycle_status_idx" ON "Eval360Cycle"("status");

-- CreateIndex
CREATE INDEX "Eval360Cycle_tenantId_idx" ON "Eval360Cycle"("tenantId");

-- CreateIndex
CREATE INDEX "Eval360CycleCompetency_cycleId_idx" ON "Eval360CycleCompetency"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "Eval360CycleCompetency_cycleId_competencyId_key" ON "Eval360CycleCompetency"("cycleId", "competencyId");

-- AddForeignKey
ALTER TABLE "Eval360CycleCompetency" ADD CONSTRAINT "Eval360CycleCompetency_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Eval360Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eval360CycleCompetency" ADD CONSTRAINT "Eval360CycleCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
