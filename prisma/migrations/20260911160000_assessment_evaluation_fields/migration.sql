-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "targetDepartmentIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Assessment" ADD COLUMN     "availableFrom" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN     "availableUntil" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN     "maxGrade" DOUBLE PRECISION NOT NULL DEFAULT 20;
