-- CreateEnum
CREATE TYPE "LiveClassType" AS ENUM ('AULA', 'WEBINAR', 'WORKSHOP', 'SESSAO_PRATICA', 'SESSAO_ESCLARECIMENTO', 'MENTORIA', 'TUTORIA', 'SESSAO_REVISAO');

-- CreateEnum
CREATE TYPE "LiveClassStatus" AS ENUM ('AGENDADA', 'EM_PREPARACAO', 'EM_CURSO', 'CONCLUIDA', 'CANCELADA', 'ADIADA');

-- CreateEnum
CREATE TYPE "LiveClassRecurrence" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LiveClassEnrollmentMode" AS ENUM ('AUTO', 'MANUAL', 'SELF', 'APPROVAL');

-- CreateEnum
CREATE TYPE "LiveAttendanceStatus" AS ENUM ('PRESENTE', 'AUSENTE', 'ATRASADO', 'PARCIAL', 'JUSTIFICADO');

-- AlterTable
ALTER TABLE "LiveAttendance" ADD COLUMN     "attendancePercent" DOUBLE PRECISION,
ADD COLUMN     "justification" TEXT,
ADD COLUMN     "sessionId" INTEGER,
ADD COLUMN     "status" "LiveAttendanceStatus";

-- AlterTable
ALTER TABLE "LiveClass" ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "allowRecordingDownload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attendanceAutoRegister" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "attendanceRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "building" TEXT,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "coInstructorId" INTEGER,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "enrollmentMode" "LiveClassEnrollmentMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "evaluationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instructorId" INTEGER,
ADD COLUMN     "lateToleranceMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "lessonId" INTEGER,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "materialDocumentIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "maxParticipants" INTEGER,
ADD COLUMN     "minAttendancePercent" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "modality" "SessionModality" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "moduleId" INTEGER,
ADD COLUMN     "notifySettings" JSONB,
ADD COLUMN     "objectives" TEXT,
ADD COLUMN     "postponedFromAt" TIMESTAMP(3),
ADD COLUMN     "recordSession" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recordingExpiresAt" TIMESTAMP(3),
ADD COLUMN     "recurrence" "LiveClassRecurrence" NOT NULL DEFAULT 'ONCE',
ADD COLUMN     "recurrenceDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "recurrenceEndDate" TIMESTAMP(3),
ADD COLUMN     "room" TEXT,
ADD COLUMN     "status" "LiveClassStatus" NOT NULL DEFAULT 'AGENDADA',
ADD COLUMN     "targetDeptIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "targetPositionIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "targetUnitIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Lisbon',
ADD COLUMN     "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "type" "LiveClassType" NOT NULL DEFAULT 'AULA',
ADD COLUMN     "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LiveClassSession" (
    "id" SERIAL NOT NULL,
    "liveClassId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "instructorId" INTEGER,
    "location" TEXT,
    "meetingUrl" TEXT,
    "status" "LiveClassStatus" NOT NULL DEFAULT 'AGENDADA',
    "notes" TEXT,
    "recordingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveClassSession_liveClassId_idx" ON "LiveClassSession"("liveClassId");

-- CreateIndex
CREATE INDEX "LiveClassSession_sessionDate_idx" ON "LiveClassSession"("sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "LiveClassSession_liveClassId_seq_key" ON "LiveClassSession"("liveClassId", "seq");

-- CreateIndex
CREATE INDEX "LiveAttendance_sessionId_idx" ON "LiveAttendance"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveClass_code_key" ON "LiveClass"("code");

-- CreateIndex
CREATE INDEX "LiveClass_status_idx" ON "LiveClass"("status");

-- CreateIndex
CREATE INDEX "LiveClass_type_idx" ON "LiveClass"("type");

-- CreateIndex
CREATE INDEX "LiveClass_moduleId_idx" ON "LiveClass"("moduleId");

-- CreateIndex
CREATE INDEX "LiveClass_instructorId_idx" ON "LiveClass"("instructorId");

-- AddForeignKey
ALTER TABLE "LiveClass" ADD CONSTRAINT "LiveClass_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClass" ADD CONSTRAINT "LiveClass_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClass" ADD CONSTRAINT "LiveClass_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "TrainingInstructorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClass" ADD CONSTRAINT "LiveClass_coInstructorId_fkey" FOREIGN KEY ("coInstructorId") REFERENCES "TrainingInstructorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClassSession" ADD CONSTRAINT "LiveClassSession_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "LiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveClassSession" ADD CONSTRAINT "LiveClassSession_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "TrainingInstructorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAttendance" ADD CONSTRAINT "LiveAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

