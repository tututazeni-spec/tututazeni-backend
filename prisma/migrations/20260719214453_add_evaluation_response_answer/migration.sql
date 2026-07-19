-- CreateTable
CREATE TABLE "EvaluationResponse" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluatorRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
    "sentimentScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "numericValue" DOUBLE PRECISION,
    "textValue" TEXT,
    "choiceValue" TEXT,

    CONSTRAINT "EvaluationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResponse_assignmentId_key" ON "EvaluationResponse"("assignmentId");

-- CreateIndex
CREATE INDEX "EvaluationResponse_cycleId_idx" ON "EvaluationResponse"("cycleId");

-- CreateIndex
CREATE INDEX "EvaluationResponse_evaluateeId_idx" ON "EvaluationResponse"("evaluateeId");

-- CreateIndex
CREATE INDEX "EvaluationResponse_status_idx" ON "EvaluationResponse"("status");

-- CreateIndex
CREATE INDEX "EvaluationAnswer_responseId_idx" ON "EvaluationAnswer"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationAnswer_responseId_questionId_key" ON "EvaluationAnswer"("responseId", "questionId");

-- AddForeignKey
ALTER TABLE "EvaluationResponse" ADD CONSTRAINT "EvaluationResponse_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Eval360Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResponse" ADD CONSTRAINT "EvaluationResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "EvaluatorAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAnswer" ADD CONSTRAINT "EvaluationAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "EvaluationResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAnswer" ADD CONSTRAINT "EvaluationAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Eval360Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
