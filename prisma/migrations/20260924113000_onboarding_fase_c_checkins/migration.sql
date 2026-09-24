-- CreateEnum
CREATE TYPE "OnboardingCheckinType" AS ENUM ('DAY_1', 'WEEK_1', 'DAY_30', 'DAY_60', 'DAY_90', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OnboardingCheckinStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "OnboardingCheckin" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "type" "OnboardingCheckinType" NOT NULL,
    "status" "OnboardingCheckinStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "responsibleId" INTEGER,
    "difficulties" TEXT,
    "positives" TEXT,
    "supportNeeds" TEXT,
    "managerFeedback" TEXT,
    "employeeFeedback" TEXT,
    "nextActions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingCheckin_planId_idx" ON "OnboardingCheckin"("planId");

-- CreateIndex
CREATE INDEX "OnboardingCheckin_status_idx" ON "OnboardingCheckin"("status");

-- AddForeignKey
ALTER TABLE "OnboardingCheckin" ADD CONSTRAINT "OnboardingCheckin_planId_fkey" FOREIGN KEY ("planId") REFERENCES "OnboardingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingCheckin" ADD CONSTRAINT "OnboardingCheckin_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

