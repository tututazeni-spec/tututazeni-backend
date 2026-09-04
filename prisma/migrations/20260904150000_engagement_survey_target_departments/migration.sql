-- AlterTable
ALTER TABLE "EngagementSurvey" ADD COLUMN     "targetDepartmentIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
