-- AlterTable
ALTER TABLE "ProcessInstance" ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "currentStepId" INTEGER,
ADD COLUMN     "departmentId" INTEGER,
ADD COLUMN     "unitId" INTEGER;

-- AlterTable
ALTER TABLE "ProcessAuditLog" ADD COLUMN     "actorType" TEXT,
ADD COLUMN     "details" TEXT,
ADD COLUMN     "stepId" INTEGER;

-- CreateTable
CREATE TABLE "ProcessAssignment" (
    "id" SERIAL NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "kind" TEXT NOT NULL,
    "assigneeId" INTEGER,
    "teamDepartmentId" INTEGER,
    "delegatedFromId" INTEGER,
    "assignedById" INTEGER NOT NULL,
    "reason" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProcessAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessAssignment_instanceId_stepId_idx" ON "ProcessAssignment"("instanceId", "stepId");

-- CreateIndex
CREATE INDEX "ProcessAssignment_assigneeId_active_idx" ON "ProcessAssignment"("assigneeId", "active");

-- CreateIndex
CREATE INDEX "ProcessInstance_departmentId_idx" ON "ProcessInstance"("departmentId");

-- CreateIndex
CREATE INDEX "ProcessInstance_correlationId_idx" ON "ProcessInstance"("correlationId");

-- CreateIndex
CREATE INDEX "ProcessAuditLog_correlationId_idx" ON "ProcessAuditLog"("correlationId");

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessAssignment" ADD CONSTRAINT "ProcessAssignment_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ProcessInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
