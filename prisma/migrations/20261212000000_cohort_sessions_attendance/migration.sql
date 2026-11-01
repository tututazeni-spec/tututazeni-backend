-- CreateEnum
CREATE TYPE "CohortSessionModality" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "CohortSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CohortAttendanceState" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'JUSTIFIED');

-- CreateEnum
CREATE TYPE "CohortCheckInMethod" AS ENUM ('MANUAL', 'QR_CODE', 'ONLINE');

-- AlterTable
ALTER TABLE "CourseCohort" ADD COLUMN     "excludeExcusedFromTotal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minAttendancePercent" INTEGER NOT NULL DEFAULT 75;

-- CreateTable
CREATE TABLE "CourseCohortSession" (
    "id" SERIAL NOT NULL,
    "cohortId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "instructorId" INTEGER,
    "modality" "CohortSessionModality" NOT NULL DEFAULT 'IN_PERSON',
    "status" "CohortSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCohortSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCohortAttendance" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "CohortAttendanceState" NOT NULL,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "note" TEXT,
    "method" "CohortCheckInMethod" NOT NULL DEFAULT 'MANUAL',
    "recordedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCohortAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCohortAttendanceLog" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "previousStatus" "CohortAttendanceState",
    "newStatus" "CohortAttendanceState",
    "reason" TEXT,
    "changedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseCohortAttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseCohortSession_cohortId_date_idx" ON "CourseCohortSession"("cohortId", "date");

-- CreateIndex
CREATE INDEX "CourseCohortSession_instructorId_idx" ON "CourseCohortSession"("instructorId");

-- CreateIndex
CREATE INDEX "CourseCohortAttendance_userId_idx" ON "CourseCohortAttendance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCohortAttendance_sessionId_userId_key" ON "CourseCohortAttendance"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "CourseCohortAttendanceLog_sessionId_idx" ON "CourseCohortAttendanceLog"("sessionId");

-- CreateIndex
CREATE INDEX "CourseCohortAttendanceLog_userId_idx" ON "CourseCohortAttendanceLog"("userId");

-- AddForeignKey
ALTER TABLE "CourseCohortSession" ADD CONSTRAINT "CourseCohortSession_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "CourseCohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohortSession" ADD CONSTRAINT "CourseCohortSession_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohortAttendance" ADD CONSTRAINT "CourseCohortAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseCohortSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohortAttendance" ADD CONSTRAINT "CourseCohortAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohortAttendanceLog" ADD CONSTRAINT "CourseCohortAttendanceLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseCohortSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: cada dia com presenças LMS já marcadas numa turma passa a ser uma
-- sessão concluída (horário lido de "HH:MM-HH:MM" no horário da turma, se existir).
INSERT INTO "CourseCohortSession" ("cohortId", "title", "date", "startTime", "endTime", "instructorId", "status", "updatedAt")
SELECT c."id",
       'Sessão de ' || to_char(a."date", 'DD/MM/YYYY'),
       a."date",
       COALESCE(substring(c."schedule" from '(\d{1,2}:\d{2})\s*-\s*\d{1,2}:\d{2}'), '09:00'),
       COALESCE(substring(c."schedule" from '\d{1,2}:\d{2}\s*-\s*(\d{1,2}:\d{2})'), '10:00'),
       c."instructorId",
       'COMPLETED',
       CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "sessionId", "date"::date AS "date"
  FROM "attendance_records"
  WHERE "context" = 'LMS' AND "sessionId" IS NOT NULL
) a
JOIN "CourseCohort" c ON c."id" = a."sessionId";

INSERT INTO "CourseCohortAttendance" ("sessionId", "userId", "status", "note", "method", "updatedAt")
SELECT s."id", r."userId",
       CASE WHEN r."status" = 'PRESENT' THEN 'PRESENT'::"CohortAttendanceState"
            ELSE 'ABSENT'::"CohortAttendanceState" END,
       r."notes",
       'MANUAL',
       CURRENT_TIMESTAMP
FROM "attendance_records" r
JOIN "CourseCohortSession" s ON s."cohortId" = r."sessionId" AND s."date" = r."date"::date
WHERE r."context" = 'LMS' AND r."sessionId" IS NOT NULL
ON CONFLICT ("sessionId", "userId") DO NOTHING;
