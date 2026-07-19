-- CreateTable
CREATE TABLE "EvaluatorAssignment" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "suggestedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluatorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleParticipant" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "consentGiven" BOOLEAN,
    "consentAt" TIMESTAMP(3),
    "finalScore" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "isEligiblePromotion" BOOLEAN,
    "isEligibleBonus" BOOLEAN,
    "scoreByEvaluatorType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluatorAssignment_cycleId_idx" ON "EvaluatorAssignment"("cycleId");

-- CreateIndex
CREATE INDEX "EvaluatorAssignment_evaluateeId_idx" ON "EvaluatorAssignment"("evaluateeId");

-- CreateIndex
CREATE INDEX "EvaluatorAssignment_evaluatorId_idx" ON "EvaluatorAssignment"("evaluatorId");

-- CreateIndex
CREATE INDEX "EvaluatorAssignment_status_idx" ON "EvaluatorAssignment"("status");

-- CreateIndex
CREATE INDEX "CycleParticipant_cycleId_idx" ON "CycleParticipant"("cycleId");

-- CreateIndex
CREATE INDEX "CycleParticipant_status_idx" ON "CycleParticipant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CycleParticipant_cycleId_userId_key" ON "CycleParticipant"("cycleId", "userId");

-- AddForeignKey
ALTER TABLE "EvaluatorAssignment" ADD CONSTRAINT "EvaluatorAssignment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Eval360Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleParticipant" ADD CONSTRAINT "CycleParticipant_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Eval360Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
