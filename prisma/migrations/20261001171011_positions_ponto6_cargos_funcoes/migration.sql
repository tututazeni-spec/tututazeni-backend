-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "jobFunction" TEXT,
ADD COLUMN     "jobFamily" TEXT,
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "responsibilities" TEXT,
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "requiredTraining" TEXT,
ADD COLUMN     "requiredExperience" TEXT,
ADD COLUMN     "reportsToPositionId" INTEGER;

-- CreateIndex
CREATE INDEX "Position_departmentId_idx" ON "Position"("departmentId");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_reportsToPositionId_fkey" FOREIGN KEY ("reportsToPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
