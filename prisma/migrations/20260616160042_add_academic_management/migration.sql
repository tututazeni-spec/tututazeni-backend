-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('PLANNING', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('SEMESTER', 'QUARTER', 'MODULE', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ProgramLevel" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "ClassModality" AS ENUM ('ONLINE', 'PRESENTIAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AcademicEnrollmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'DROPPED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'PLANNING',
    "description" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicPeriod" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "enrollmentStart" TIMESTAMP(3),
    "enrollmentEnd" TIMESTAMP(3),
    "type" "PeriodType" NOT NULL DEFAULT 'SEMESTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicProgram" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "level" "ProgramLevel" NOT NULL DEFAULT 'BASIC',
    "durationHours" INTEGER NOT NULL,
    "maxStudents" INTEGER,
    "minStudents" INTEGER,
    "passingScore" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "certificateType" TEXT,
    "yearId" TEXT,
    "prerequisites" TEXT[],
    "courseIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "targetRoles" TEXT[],
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicClass" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instructorId" INTEGER,
    "maxStudents" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "modality" "ClassModality" NOT NULL DEFAULT 'ONLINE',
    "location" TEXT,
    "schedule" TEXT,
    "status" "ClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicEnrollment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "programId" TEXT NOT NULL,
    "classId" TEXT,
    "periodId" TEXT,
    "status" "AcademicEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "droppedAt" TIMESTAMP(3),
    "dropReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicGrade" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseName" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "gradedById" INTEGER NOT NULL,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicTranscript" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "gpa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalHours" INTEGER NOT NULL DEFAULT 0,
    "completedPrograms" INTEGER NOT NULL DEFAULT 0,
    "inProgressPrograms" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_name_key" ON "AcademicYear"("name");

-- CreateIndex
CREATE INDEX "AcademicYear_isCurrent_idx" ON "AcademicYear"("isCurrent");

-- CreateIndex
CREATE INDEX "AcademicYear_status_idx" ON "AcademicYear"("status");

-- CreateIndex
CREATE INDEX "AcademicYear_deletedAt_idx" ON "AcademicYear"("deletedAt");

-- CreateIndex
CREATE INDEX "AcademicPeriod_yearId_idx" ON "AcademicPeriod"("yearId");

-- CreateIndex
CREATE INDEX "AcademicPeriod_type_idx" ON "AcademicPeriod"("type");

-- CreateIndex
CREATE INDEX "AcademicPeriod_deletedAt_idx" ON "AcademicPeriod"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicProgram_code_key" ON "AcademicProgram"("code");

-- CreateIndex
CREATE INDEX "AcademicProgram_code_idx" ON "AcademicProgram"("code");

-- CreateIndex
CREATE INDEX "AcademicProgram_level_idx" ON "AcademicProgram"("level");

-- CreateIndex
CREATE INDEX "AcademicProgram_isActive_idx" ON "AcademicProgram"("isActive");

-- CreateIndex
CREATE INDEX "AcademicProgram_isMandatory_idx" ON "AcademicProgram"("isMandatory");

-- CreateIndex
CREATE INDEX "AcademicProgram_deletedAt_idx" ON "AcademicProgram"("deletedAt");

-- CreateIndex
CREATE INDEX "AcademicClass_programId_idx" ON "AcademicClass"("programId");

-- CreateIndex
CREATE INDEX "AcademicClass_status_idx" ON "AcademicClass"("status");

-- CreateIndex
CREATE INDEX "AcademicClass_modality_idx" ON "AcademicClass"("modality");

-- CreateIndex
CREATE INDEX "AcademicClass_deletedAt_idx" ON "AcademicClass"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicEnrollment_code_key" ON "AcademicEnrollment"("code");

-- CreateIndex
CREATE INDEX "AcademicEnrollment_userId_idx" ON "AcademicEnrollment"("userId");

-- CreateIndex
CREATE INDEX "AcademicEnrollment_programId_idx" ON "AcademicEnrollment"("programId");

-- CreateIndex
CREATE INDEX "AcademicEnrollment_status_idx" ON "AcademicEnrollment"("status");

-- CreateIndex
CREATE INDEX "AcademicEnrollment_deletedAt_idx" ON "AcademicEnrollment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicEnrollment_userId_programId_periodId_key" ON "AcademicEnrollment"("userId", "programId", "periodId");

-- CreateIndex
CREATE INDEX "AcademicGrade_enrollmentId_idx" ON "AcademicGrade"("enrollmentId");

-- CreateIndex
CREATE INDEX "AcademicGrade_courseId_idx" ON "AcademicGrade"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicTranscript_userId_key" ON "AcademicTranscript"("userId");

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPeriod" ADD CONSTRAINT "AcademicPeriod_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicProgram" ADD CONSTRAINT "AcademicProgram_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicProgram" ADD CONSTRAINT "AcademicProgram_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicClass" ADD CONSTRAINT "AcademicClass_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicClass" ADD CONSTRAINT "AcademicClass_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicEnrollment" ADD CONSTRAINT "AcademicEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicEnrollment" ADD CONSTRAINT "AcademicEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicEnrollment" ADD CONSTRAINT "AcademicEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "AcademicClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicEnrollment" ADD CONSTRAINT "AcademicEnrollment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AcademicPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicEnrollment" ADD CONSTRAINT "AcademicEnrollment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "AcademicEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicTranscript" ADD CONSTRAINT "AcademicTranscript_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
