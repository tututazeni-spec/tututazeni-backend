-- AlterTable
ALTER TABLE "SurveyAnswer" ADD COLUMN     "selectedOption" TEXT,
ALTER COLUMN "value" DROP NOT NULL;
