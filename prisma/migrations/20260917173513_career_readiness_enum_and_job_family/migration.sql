-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'LEADERSHIP_EXPOSURE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReadinessLevel" ADD VALUE 'READY_1_2_YEARS';
ALTER TYPE "ReadinessLevel" ADD VALUE 'READY_2_3_YEARS';

-- AlterTable
ALTER TABLE "CareerPath" ADD COLUMN     "code" TEXT,
ADD COLUMN     "jobFamilyId" INTEGER;

-- AlterTable
ALTER TABLE "CareerPathStep" ADD COLUMN     "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isLateralMove" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minExperienceMonths" INTEGER;

-- AlterTable
ALTER TABLE "CareerRole" ADD COLUMN     "jobFamilyId" INTEGER;

-- AlterTable
ALTER TABLE "DevelopmentPlan" ADD COLUMN     "successionPlanId" INTEGER;

-- AlterTable
ALTER TABLE "InternalVacancy" ADD COLUMN     "careerLevel" "PositionLevel",
ADD COLUMN     "code" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "requiredCertifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiredTraining" TEXT,
ADD COLUMN     "responsibleManagerId" INTEGER,
ADD COLUMN     "unitId" INTEGER;

-- AlterTable
ALTER TABLE "UserCareerPlan" ADD COLUMN     "coachingNotes" TEXT,
ADD COLUMN     "mentoringNotes" TEXT,
ADD COLUMN     "openToMobility" BOOLEAN;

-- CreateTable
CREATE TABLE "JobFamily" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "area" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobFamily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobFamily_name_key" ON "JobFamily"("name");

-- CreateIndex
CREATE UNIQUE INDEX "JobFamily_code_key" ON "JobFamily"("code");

-- CreateIndex
CREATE INDEX "JobFamily_active_idx" ON "JobFamily"("active");

-- CreateIndex
CREATE INDEX "CareerPath_jobFamilyId_idx" ON "CareerPath"("jobFamilyId");

-- CreateIndex
CREATE INDEX "CareerRole_jobFamilyId_idx" ON "CareerRole"("jobFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentPlan_successionPlanId_key" ON "DevelopmentPlan"("successionPlanId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_successionPlanId_idx" ON "DevelopmentPlan"("successionPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalVacancy_code_key" ON "InternalVacancy"("code");

-- CreateIndex
CREATE INDEX "InternalVacancy_unitId_idx" ON "InternalVacancy"("unitId");

-- CreateIndex
CREATE INDEX "InternalVacancy_responsibleManagerId_idx" ON "InternalVacancy"("responsibleManagerId");

-- AddForeignKey
ALTER TABLE "CareerRole" ADD CONSTRAINT "CareerRole_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "JobFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPath" ADD CONSTRAINT "CareerPath_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "JobFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalVacancy" ADD CONSTRAINT "InternalVacancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalVacancy" ADD CONSTRAINT "InternalVacancy_responsibleManagerId_fkey" FOREIGN KEY ("responsibleManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_successionPlanId_fkey" FOREIGN KEY ("successionPlanId") REFERENCES "SuccessionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

