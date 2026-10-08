-- CreateEnum
CREATE TYPE "CourseCohortStatus" AS ENUM ('DRAFT', 'OPEN', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CourseCohort" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "instructorId" INTEGER,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "room" TEXT,
    "schedule" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "status" "CourseCohortStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCohortParticipant" (
    "id" SERIAL NOT NULL,
    "cohortId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseCohortParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseCohort_courseId_idx" ON "CourseCohort"("courseId");

-- CreateIndex
CREATE INDEX "CourseCohort_instructorId_idx" ON "CourseCohort"("instructorId");

-- CreateIndex
CREATE INDEX "CourseCohort_status_idx" ON "CourseCohort"("status");

-- CreateIndex
CREATE INDEX "CourseCohortParticipant_cohortId_idx" ON "CourseCohortParticipant"("cohortId");

-- CreateIndex
CREATE INDEX "CourseCohortParticipant_userId_idx" ON "CourseCohortParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCohortParticipant_cohortId_userId_key" ON "CourseCohortParticipant"("cohortId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCategory_name_key" ON "CourseCategory"("name");

-- AddForeignKey
ALTER TABLE "CourseCohort" ADD CONSTRAINT "CourseCohort_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohort" ADD CONSTRAINT "CourseCohort_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohortParticipant" ADD CONSTRAINT "CourseCohortParticipant_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "CourseCohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohortParticipant" ADD CONSTRAINT "CourseCohortParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

