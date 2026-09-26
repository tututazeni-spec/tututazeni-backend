-- CreateTable
CREATE TABLE "Scenario" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "initiativeType" "RoiInitiativeType" NOT NULL,
    "description" TEXT,
    "departmentId" INTEGER,
    "targetAudienceCount" INTEGER,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "basedOnAnalysisId" INTEGER,
    "expectedBenefit" DOUBLE PRECISION,
    "assumptions" TEXT,
    "note" TEXT,
    "roiPercent" DOUBLE PRECISION,
    "paybackMonths" DOUBLE PRECISION,
    "projections" JSONB,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scenario_initiativeType_idx" ON "Scenario"("initiativeType");

-- CreateIndex
CREATE INDEX "Scenario_departmentId_idx" ON "Scenario"("departmentId");

-- CreateIndex
CREATE INDEX "Scenario_basedOnAnalysisId_idx" ON "Scenario"("basedOnAnalysisId");

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
