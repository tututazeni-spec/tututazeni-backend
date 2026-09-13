-- AlterTable
ALTER TABLE "DevelopmentPlanAction" ADD COLUMN     "competencyIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
