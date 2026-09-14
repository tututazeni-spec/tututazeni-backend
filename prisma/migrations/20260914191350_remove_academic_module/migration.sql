/*
  Warnings:

  - You are about to drop the `AcademicClass` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AcademicEnrollment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AcademicGrade` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AcademicPeriod` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AcademicProgram` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AcademicTranscript` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AcademicYear` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AcademicClass" DROP CONSTRAINT "AcademicClass_instructorId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicClass" DROP CONSTRAINT "AcademicClass_programId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicEnrollment" DROP CONSTRAINT "AcademicEnrollment_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "AcademicEnrollment" DROP CONSTRAINT "AcademicEnrollment_classId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicEnrollment" DROP CONSTRAINT "AcademicEnrollment_periodId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicEnrollment" DROP CONSTRAINT "AcademicEnrollment_programId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicEnrollment" DROP CONSTRAINT "AcademicEnrollment_userId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicGrade" DROP CONSTRAINT "AcademicGrade_enrollmentId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicGrade" DROP CONSTRAINT "AcademicGrade_gradedById_fkey";

-- DropForeignKey
ALTER TABLE "AcademicPeriod" DROP CONSTRAINT "AcademicPeriod_yearId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicProgram" DROP CONSTRAINT "AcademicProgram_createdById_fkey";

-- DropForeignKey
ALTER TABLE "AcademicProgram" DROP CONSTRAINT "AcademicProgram_yearId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicTranscript" DROP CONSTRAINT "AcademicTranscript_userId_fkey";

-- DropForeignKey
ALTER TABLE "AcademicYear" DROP CONSTRAINT "AcademicYear_createdById_fkey";

-- DropTable
DROP TABLE "AcademicClass";

-- DropTable
DROP TABLE "AcademicEnrollment";

-- DropTable
DROP TABLE "AcademicGrade";

-- DropTable
DROP TABLE "AcademicPeriod";

-- DropTable
DROP TABLE "AcademicProgram";

-- DropTable
DROP TABLE "AcademicTranscript";

-- DropTable
DROP TABLE "AcademicYear";

-- DropEnum
DROP TYPE "AcademicEnrollmentStatus";

-- DropEnum
DROP TYPE "AcademicYearStatus";

-- DropEnum
DROP TYPE "ClassModality";

-- DropEnum
DROP TYPE "ClassStatus";

-- DropEnum
DROP TYPE "PeriodType";

-- DropEnum
DROP TYPE "ProgramLevel";
