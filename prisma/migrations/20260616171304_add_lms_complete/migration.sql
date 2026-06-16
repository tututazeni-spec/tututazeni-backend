-- CreateEnum
CREATE TYPE "PathLevel" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "PathEnrollmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'PAUSED', 'DROPPED');

-- CreateEnum
CREATE TYPE "SessionPlatform" AS ENUM ('ZOOM', 'TEAMS', 'MEET', 'WEBEX', 'OTHER');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED', 'POSTPONED');

-- CreateTable
CREATE TABLE "LmsLearningPath" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "targetRoles" TEXT[],
    "targetDeptIds" TEXT[],
    "skills" TEXT[],
    "courseIds" TEXT[],
    "courseOrder" TEXT[],
    "estimatedHours" INTEGER,
    "level" "PathLevel" NOT NULL DEFAULT 'BASIC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "enrolledCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LmsLearningPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsPathEnrollment" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PathEnrollmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentCourseId" TEXT,
    "completedCourseIds" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LmsPathEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsLiveSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructorId" INTEGER,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Luanda',
    "meetingUrl" TEXT,
    "meetingId" TEXT,
    "platform" "SessionPlatform" NOT NULL DEFAULT 'MEET',
    "maxAttendees" INTEGER,
    "recordingUrl" TEXT,
    "materials" TEXT[],
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isRecorded" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LmsLiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsLiveAttendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "duration" INTEGER,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LmsLiveAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsLearningAnalytics" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coursesStarted" INTEGER NOT NULL DEFAULT 0,
    "coursesCompleted" INTEGER NOT NULL DEFAULT 0,
    "pathsCompleted" INTEGER NOT NULL DEFAULT 0,
    "sessionsAttended" INTEGER NOT NULL DEFAULT 0,
    "avgQuizScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmsLearningAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LmsLearningPath_code_key" ON "LmsLearningPath"("code");

-- CreateIndex
CREATE INDEX "LmsLearningPath_isActive_idx" ON "LmsLearningPath"("isActive");

-- CreateIndex
CREATE INDEX "LmsLearningPath_isFeatured_idx" ON "LmsLearningPath"("isFeatured");

-- CreateIndex
CREATE INDEX "LmsLearningPath_level_idx" ON "LmsLearningPath"("level");

-- CreateIndex
CREATE INDEX "LmsLearningPath_deletedAt_idx" ON "LmsLearningPath"("deletedAt");

-- CreateIndex
CREATE INDEX "LmsPathEnrollment_userId_idx" ON "LmsPathEnrollment"("userId");

-- CreateIndex
CREATE INDEX "LmsPathEnrollment_status_idx" ON "LmsPathEnrollment"("status");

-- CreateIndex
CREATE INDEX "LmsPathEnrollment_deletedAt_idx" ON "LmsPathEnrollment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LmsPathEnrollment_pathId_userId_key" ON "LmsPathEnrollment"("pathId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LmsLiveSession_code_key" ON "LmsLiveSession"("code");

-- CreateIndex
CREATE INDEX "LmsLiveSession_courseId_idx" ON "LmsLiveSession"("courseId");

-- CreateIndex
CREATE INDEX "LmsLiveSession_scheduledAt_idx" ON "LmsLiveSession"("scheduledAt");

-- CreateIndex
CREATE INDEX "LmsLiveSession_status_idx" ON "LmsLiveSession"("status");

-- CreateIndex
CREATE INDEX "LmsLiveSession_deletedAt_idx" ON "LmsLiveSession"("deletedAt");

-- CreateIndex
CREATE INDEX "LmsLiveAttendance_sessionId_idx" ON "LmsLiveAttendance"("sessionId");

-- CreateIndex
CREATE INDEX "LmsLiveAttendance_userId_idx" ON "LmsLiveAttendance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LmsLiveAttendance_sessionId_userId_key" ON "LmsLiveAttendance"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LmsLearningAnalytics_userId_key" ON "LmsLearningAnalytics"("userId");

-- AddForeignKey
ALTER TABLE "LmsLearningPath" ADD CONSTRAINT "LmsLearningPath_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsPathEnrollment" ADD CONSTRAINT "LmsPathEnrollment_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "LmsLearningPath"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsPathEnrollment" ADD CONSTRAINT "LmsPathEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLiveSession" ADD CONSTRAINT "LmsLiveSession_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLiveSession" ADD CONSTRAINT "LmsLiveSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLiveAttendance" ADD CONSTRAINT "LmsLiveAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LmsLiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLiveAttendance" ADD CONSTRAINT "LmsLiveAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LmsLearningAnalytics" ADD CONSTRAINT "LmsLearningAnalytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
