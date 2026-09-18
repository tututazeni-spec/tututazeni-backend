-- CreateEnum
CREATE TYPE "CourseVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'EMPLOYEES_ONLY', 'SELECTED_GROUPS');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LessonActivityType" AS ENUM ('TEXT', 'VIDEO', 'DOCUMENT', 'IMAGE', 'AUDIO', 'QUIZ', 'OPEN_QUESTION', 'EXERCISE', 'TASK', 'SURVEY', 'DISCUSSION', 'DOWNLOAD', 'EXTERNAL_LINK');

-- AlterEnum
ALTER TYPE "CourseStatus" ADD VALUE 'PAUSED';

-- AlterEnum
ALTER TYPE "LessonType" ADD VALUE 'LIVE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleStatus" ADD VALUE 'PAUSED';
ALTER TYPE "ModuleStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "certificateCriteria" TEXT,
ADD COLUMN     "certificateEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "estimatedDurationDays" INTEGER,
ADD COLUMN     "knowledgeArea" TEXT,
ADD COLUMN     "minCompletionPercent" INTEGER,
ADD COLUMN     "primaryInstructorId" INTEGER,
ADD COLUMN     "requiredCourseId" INTEGER,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "targetAudience" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "visibility" "CourseVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "CourseModule" ADD COLUMN     "allowSkip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "estimatedDurationMinutes" INTEGER,
ADD COLUMN     "requiredModuleId" INTEGER,
ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "allowSkip" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "availableUntil" TIMESTAMP(3),
ADD COLUMN     "captionsUrl" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "liveDate" TIMESTAMP(3),
ADD COLUMN     "liveInstructorId" INTEGER,
ADD COLUMN     "liveSessionUrl" TEXT,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minWatchSeconds" INTEGER,
ADD COLUMN     "requiredLessonId" INTEGER,
ADD COLUMN     "requiresActivity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresAssessment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "LessonStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "autoFeedback" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showCorrectAnswers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shuffleAnswers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CourseInstructor" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseInstructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAudienceGroup" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "userIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAudienceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleCompetency" (
    "id" SERIAL NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,

    CONSTRAINT "ModuleCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonActivity" (
    "id" SERIAL NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "type" "LessonActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contentUrl" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonResource" (
    "id" SERIAL NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSizeKb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseInstructor_userId_idx" ON "CourseInstructor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseInstructor_courseId_userId_key" ON "CourseInstructor"("courseId", "userId");

-- CreateIndex
CREATE INDEX "CourseAudienceGroup_courseId_idx" ON "CourseAudienceGroup"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleCompetency_moduleId_competencyId_key" ON "ModuleCompetency"("moduleId", "competencyId");

-- CreateIndex
CREATE INDEX "LessonActivity_lessonId_idx" ON "LessonActivity"("lessonId");

-- CreateIndex
CREATE INDEX "LessonResource_lessonId_idx" ON "LessonResource"("lessonId");

-- CreateIndex
CREATE INDEX "Course_primaryInstructorId_idx" ON "Course"("primaryInstructorId");

-- CreateIndex
CREATE INDEX "Course_requiredCourseId_idx" ON "Course"("requiredCourseId");

-- CreateIndex
CREATE INDEX "CourseModule_requiredModuleId_idx" ON "CourseModule"("requiredModuleId");

-- CreateIndex
CREATE INDEX "Lesson_requiredLessonId_idx" ON "Lesson"("requiredLessonId");

-- CreateIndex
CREATE INDEX "Lesson_liveInstructorId_idx" ON "Lesson"("liveInstructorId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_primaryInstructorId_fkey" FOREIGN KEY ("primaryInstructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_requiredCourseId_fkey" FOREIGN KEY ("requiredCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseInstructor" ADD CONSTRAINT "CourseInstructor_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseInstructor" ADD CONSTRAINT "CourseInstructor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAudienceGroup" ADD CONSTRAINT "CourseAudienceGroup_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_requiredModuleId_fkey" FOREIGN KEY ("requiredModuleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleCompetency" ADD CONSTRAINT "ModuleCompetency_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleCompetency" ADD CONSTRAINT "ModuleCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_requiredLessonId_fkey" FOREIGN KEY ("requiredLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_liveInstructorId_fkey" FOREIGN KEY ("liveInstructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonActivity" ADD CONSTRAINT "LessonActivity_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
