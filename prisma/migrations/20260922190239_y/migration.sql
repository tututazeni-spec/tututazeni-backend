/*
  Warnings:

  - A unique constraint covering the columns `[integrationEvalRequestId]` on the table `OnboardingPlan` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "EvalPurpose" ADD VALUE 'ONBOARDING';

-- AlterTable
ALTER TABLE "OnboardingPlan" ADD COLUMN     "integrationEvalRequestId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingPlan_integrationEvalRequestId_key" ON "OnboardingPlan"("integrationEvalRequestId");

-- AddForeignKey
ALTER TABLE "OnboardingPlan" ADD CONSTRAINT "OnboardingPlan_integrationEvalRequestId_fkey" FOREIGN KEY ("integrationEvalRequestId") REFERENCES "EvaluationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
