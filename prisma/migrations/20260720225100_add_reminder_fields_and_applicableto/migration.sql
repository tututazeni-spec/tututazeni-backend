-- AlterTable EvaluatorAssignment: add reminderCount and lastReminderAt
ALTER TABLE "EvaluatorAssignment" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EvaluatorAssignment" ADD COLUMN "lastReminderAt" TIMESTAMP(3);

-- AlterTable Eval360Question: add applicableTo
ALTER TABLE "Eval360Question" ADD COLUMN "applicableTo" TEXT[] DEFAULT ARRAY[]::TEXT[];
