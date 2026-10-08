-- AlterEnum
ALTER TYPE "TaskPhase" ADD VALUE 'INTEGRATION';
ALTER TYPE "TaskPhase" ADD VALUE 'FOLLOW_UP';
ALTER TYPE "TaskPhase" ADD VALUE 'CONCLUSION';

-- CreateIndex
CREATE INDEX "OnboardingTemplateTask_courseId_idx" ON "OnboardingTemplateTask"("courseId");

-- AddForeignKey
ALTER TABLE "OnboardingTemplateTask" ADD CONSTRAINT "OnboardingTemplateTask_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
