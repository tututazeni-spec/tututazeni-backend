-- AlterEnum
BEGIN;
CREATE TYPE "EvalCampaignStatus_new" AS ENUM ('DRAFT', 'PUBLISHED', 'ACTIVE', 'CALIBRATING', 'COMPLETED', 'ARCHIVED');
ALTER TABLE "public"."EvaluationCampaign" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "EvaluationCampaign" ALTER COLUMN "status" TYPE "EvalCampaignStatus_new" USING ("status"::text::"EvalCampaignStatus_new");
ALTER TYPE "EvalCampaignStatus" RENAME TO "EvalCampaignStatus_old";
ALTER TYPE "EvalCampaignStatus_new" RENAME TO "EvalCampaignStatus";
DROP TYPE "public"."EvalCampaignStatus_old";
ALTER TABLE "EvaluationCampaign" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

