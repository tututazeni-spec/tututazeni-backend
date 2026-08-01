-- DropForeignKey
ALTER TABLE "OnboardingSurvey" DROP CONSTRAINT "OnboardingSurvey_planId_fkey";

-- AddForeignKey
ALTER TABLE "OnboardingSurvey" ADD CONSTRAINT "OnboardingSurvey_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OnboardingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
