-- AlterTable
ALTER TABLE "LiveAttendance"
  ADD COLUMN "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currentJoinedAt" TIMESTAMP(3);

-- Passagens já fechadas: preserva a duração histórica (leftAt - joinedAt)
UPDATE "LiveAttendance"
SET "accumulatedSeconds" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("leftAt" - "joinedAt"))))::INTEGER
WHERE "joinedAt" IS NOT NULL AND "leftAt" IS NOT NULL;
