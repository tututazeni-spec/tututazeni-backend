
-- CreateEnum
CREATE TYPE "AbsenceOccurrenceType" AS ENUM ('JUSTIFIED_ABSENCE', 'UNJUSTIFIED_ABSENCE', 'LATE', 'EARLY_DEPARTURE', 'PARTIAL_ABSENCE', 'HEALTH_ABSENCE', 'AUTHORIZED_ABSENCE', 'PERSONAL_ABSENCE', 'NO_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "AbsenceSource" AS ENUM ('MANUAL', 'ATTENDANCE', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "AbsenceJustificationStatus" AS ENUM ('TO_JUSTIFY', 'SUBMITTED', 'VALIDATED', 'REJECTED');

-- AlterTable
ALTER TABLE "LeaveDocument" ADD COLUMN     "isSensitive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "startTime" TEXT;

-- AlterTable
ALTER TABLE "leave_type_configs" ADD COLUMN     "isSensitive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresPayrollValidation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "absence_records" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "durationDays" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "durationHours" DOUBLE PRECISION,
    "occurrenceType" "AbsenceOccurrenceType" NOT NULL,
    "customCategory" TEXT,
    "justification" TEXT,
    "source" "AbsenceSource" NOT NULL DEFAULT 'MANUAL',
    "justificationStatus" "AbsenceJustificationStatus" NOT NULL DEFAULT 'TO_JUSTIFY',
    "validatorId" INTEGER,
    "validatedAt" TIMESTAMP(3),
    "validationNotes" TEXT,
    "attendanceRecordId" INTEGER,
    "forwardedToId" INTEGER,
    "forwardedAt" TIMESTAMP(3),
    "sentToHrAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_attachments" (
    "id" SERIAL NOT NULL,
    "absenceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_revisions" (
    "id" SERIAL NOT NULL,
    "absenceId" INTEGER NOT NULL,
    "changedById" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "absence_records_attendanceRecordId_key" ON "absence_records"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "absence_records_userId_date_idx" ON "absence_records"("userId", "date");

-- CreateIndex
CREATE INDEX "absence_records_date_idx" ON "absence_records"("date");

-- CreateIndex
CREATE INDEX "absence_records_justificationStatus_idx" ON "absence_records"("justificationStatus");

-- CreateIndex
CREATE INDEX "absence_attachments_absenceId_idx" ON "absence_attachments"("absenceId");

-- CreateIndex
CREATE INDEX "absence_revisions_absenceId_idx" ON "absence_revisions"("absenceId");

-- AddForeignKey
ALTER TABLE "absence_records" ADD CONSTRAINT "absence_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_attachments" ADD CONSTRAINT "absence_attachments_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "absence_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_revisions" ADD CONSTRAINT "absence_revisions_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "absence_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tipos de licença já existentes: valores por omissão sensatos (o RH pode
-- alterá-los em Configurações).
UPDATE "leave_type_configs" SET "requiresDocument" = true, "isSensitive" = true
  WHERE "code" IN ('SICK', 'SICK_LEAVE', 'MATERNITY', 'PATERNITY');
UPDATE "leave_type_configs" SET "requiresDocument" = true
  WHERE "code" IN ('BEREAVEMENT');
UPDATE "leave_type_configs" SET "requiresPayrollValidation" = true
  WHERE "isPaid" = false OR "code" IN ('SICK', 'SICK_LEAVE', 'MATERNITY', 'PATERNITY');
