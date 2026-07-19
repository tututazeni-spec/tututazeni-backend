-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION,
    "weightedScore" DOUBLE PRECISION,
    "selfScore" DOUBLE PRECISION,
    "managerScore" DOUBLE PRECISION,
    "peerScore" DOUBLE PRECISION,
    "subordinateScore" DOUBLE PRECISION,
    "externalScore" DOUBLE PRECISION,
    "scoresByCompetency" TEXT,
    "gaps" TEXT,
    "strengths" TEXT,
    "isEligiblePromotion" BOOLEAN NOT NULL DEFAULT false,
    "isEligibleBonus" BOOLEAN NOT NULL DEFAULT false,
    "bonusMultiplier" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Eval360Feedback" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Eval360Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseSurvey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseSurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answersJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationResult_cycleId_idx" ON "EvaluationResult"("cycleId");

-- CreateIndex
CREATE INDEX "EvaluationResult_participantId_idx" ON "EvaluationResult"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_cycleId_participantId_key" ON "EvaluationResult"("cycleId", "participantId");

-- CreateIndex
CREATE INDEX "Eval360Feedback_toUserId_idx" ON "Eval360Feedback"("toUserId");

-- CreateIndex
CREATE INDEX "Eval360Feedback_fromUserId_idx" ON "Eval360Feedback"("fromUserId");

-- CreateIndex
CREATE INDEX "PulseSurveyResponse_surveyId_idx" ON "PulseSurveyResponse"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "PulseSurveyResponse_surveyId_userId_key" ON "PulseSurveyResponse"("surveyId", "userId");

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Eval360Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseSurveyResponse" ADD CONSTRAINT "PulseSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "PulseSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
