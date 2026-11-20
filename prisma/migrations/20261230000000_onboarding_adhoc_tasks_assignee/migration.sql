-- AlterTable
ALTER TABLE "OnboardingTaskInstance" ADD COLUMN     "assigneeId" INTEGER;

-- AlterTable
ALTER TABLE "OnboardingTemplateTask" ADD COLUMN     "isAdHoc" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "OnboardingTaskInstance_assigneeId_idx" ON "OnboardingTaskInstance"("assigneeId");

-- AddForeignKey
ALTER TABLE "OnboardingTaskInstance" ADD CONSTRAINT "OnboardingTaskInstance_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
