-- AlterTable
ALTER TABLE "EvaluationRequest" ADD COLUMN     "oneOnOneMeetingId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationRequest_oneOnOneMeetingId_key" ON "EvaluationRequest"("oneOnOneMeetingId");

-- AddForeignKey
ALTER TABLE "EvaluationRequest" ADD CONSTRAINT "EvaluationRequest_oneOnOneMeetingId_fkey" FOREIGN KEY ("oneOnOneMeetingId") REFERENCES "OneOnOneMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
