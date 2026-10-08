-- CreateEnum
CREATE TYPE "AvatarTrainingAvatarType" AS ENUM ('IMAGE', 'AVATAR_2D', 'AVATAR_3D', 'VIDEO');

-- CreateEnum
CREATE TYPE "AvatarTrainingAvatarStatus" AS ENUM ('ACTIVE', 'TESTING', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AvatarTrainingStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AvatarTrainingExperienceType" AS ENUM ('GUIDED_LESSON', 'Q_AND_A', 'ROLE_PLAY', 'PROCEDURE_DEMO', 'PRACTICAL_ASSESSMENT', 'PERSONALIZED_REVIEW');

-- CreateEnum
CREATE TYPE "AvatarTrainingAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AvatarTrainingAttemptStatus" AS ENUM ('IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'COMPLETED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "AvatarTrainingInteractionType" AS ENUM ('AVATAR_MESSAGE', 'USER_MESSAGE', 'USER_ANSWER', 'STEP_ADVANCE', 'FEEDBACK', 'PAUSE', 'RESUME', 'HELP_REQUEST', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AvatarTrainingSourceType" AS ENUM ('COURSE', 'LESSON', 'DOCUMENT', 'LIBRARY_ITEM');

-- CreateTable
CREATE TABLE "TrainingAvatar" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatarType" "AvatarTrainingAvatarType" NOT NULL DEFAULT 'IMAGE',
    "imageUrl" TEXT,
    "voiceConfig" TEXT,
    "language" TEXT NOT NULL DEFAULT 'pt',
    "languageVariant" TEXT,
    "tone" TEXT,
    "specialty" TEXT,
    "provider" TEXT,
    "providerModel" TEXT,
    "status" "AvatarTrainingAvatarStatus" NOT NULL DEFAULT 'TESTING',
    "responsibleId" INTEGER,
    "createdById" INTEGER,
    "lastTestedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAvatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarTrainingProgram" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objectives" TEXT[],
    "category" TEXT,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'BEGINNER',
    "experienceType" "AvatarTrainingExperienceType" NOT NULL DEFAULT 'GUIDED_LESSON',
    "courseId" INTEGER,
    "moduleId" INTEGER,
    "avatarId" INTEGER,
    "responsibleId" INTEGER,
    "targetDepartmentIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "targetRoleNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'pt',
    "durationMinutes" INTEGER,
    "prerequisiteCourseIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "AvatarTrainingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewSubmittedAt" TIMESTAMP(3),
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarTrainingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarTrainingSession" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "avatarId" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 1,
    "experienceType" "AvatarTrainingExperienceType" NOT NULL DEFAULT 'GUIDED_LESSON',
    "objectives" TEXT[],
    "welcomeMessage" TEXT,
    "contentConfig" TEXT,
    "durationMinutes" INTEGER,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" "AvatarTrainingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarTrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarTrainingAssignment" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "enrollmentId" INTEGER,
    "assignedById" INTEGER,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "status" "AvatarTrainingAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AvatarTrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarTrainingAttempt" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AvatarTrainingAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "textOnly" BOOLEAN NOT NULL DEFAULT true,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "feedback" TEXT,
    "reviewedById" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AvatarTrainingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarTrainingInteraction" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "interactionType" "AvatarTrainingInteractionType" NOT NULL,
    "stepKey" TEXT,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarTrainingInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarTrainingAssessment" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "assessmentId" INTEGER,
    "rubricConfig" TEXT,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "maxAttempts" INTEGER NOT NULL DEFAULT 0,
    "requireFormalAssessment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarTrainingAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarTrainingKnowledgeSource" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "sourceType" "AvatarTrainingSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarTrainingKnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingAvatar_status_idx" ON "TrainingAvatar"("status");

-- CreateIndex
CREATE INDEX "TrainingAvatar_language_idx" ON "TrainingAvatar"("language");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarTrainingProgram_code_key" ON "AvatarTrainingProgram"("code");

-- CreateIndex
CREATE INDEX "AvatarTrainingProgram_status_idx" ON "AvatarTrainingProgram"("status");

-- CreateIndex
CREATE INDEX "AvatarTrainingProgram_courseId_idx" ON "AvatarTrainingProgram"("courseId");

-- CreateIndex
CREATE INDEX "AvatarTrainingProgram_avatarId_idx" ON "AvatarTrainingProgram"("avatarId");

-- CreateIndex
CREATE INDEX "AvatarTrainingSession_programId_idx" ON "AvatarTrainingSession"("programId");

-- CreateIndex
CREATE INDEX "AvatarTrainingSession_status_idx" ON "AvatarTrainingSession"("status");

-- CreateIndex
CREATE INDEX "AvatarTrainingAssignment_userId_idx" ON "AvatarTrainingAssignment"("userId");

-- CreateIndex
CREATE INDEX "AvatarTrainingAssignment_status_idx" ON "AvatarTrainingAssignment"("status");

-- CreateIndex
CREATE INDEX "AvatarTrainingAssignment_dueDate_idx" ON "AvatarTrainingAssignment"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarTrainingAssignment_sessionId_userId_key" ON "AvatarTrainingAssignment"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "AvatarTrainingAttempt_userId_idx" ON "AvatarTrainingAttempt"("userId");

-- CreateIndex
CREATE INDEX "AvatarTrainingAttempt_status_idx" ON "AvatarTrainingAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarTrainingAttempt_assignmentId_attemptNumber_key" ON "AvatarTrainingAttempt"("assignmentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarTrainingInteraction_attemptId_sequence_key" ON "AvatarTrainingInteraction"("attemptId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarTrainingAssessment_sessionId_key" ON "AvatarTrainingAssessment"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarTrainingKnowledgeSource_sessionId_sourceType_sourceId_key" ON "AvatarTrainingKnowledgeSource"("sessionId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "AvatarTrainingProgram" ADD CONSTRAINT "AvatarTrainingProgram_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingProgram" ADD CONSTRAINT "AvatarTrainingProgram_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "TrainingAvatar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingSession" ADD CONSTRAINT "AvatarTrainingSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AvatarTrainingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingSession" ADD CONSTRAINT "AvatarTrainingSession_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "TrainingAvatar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingAssignment" ADD CONSTRAINT "AvatarTrainingAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AvatarTrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingAssignment" ADD CONSTRAINT "AvatarTrainingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingAssignment" ADD CONSTRAINT "AvatarTrainingAssignment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingAttempt" ADD CONSTRAINT "AvatarTrainingAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AvatarTrainingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingAttempt" ADD CONSTRAINT "AvatarTrainingAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingInteraction" ADD CONSTRAINT "AvatarTrainingInteraction_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AvatarTrainingAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingAssessment" ADD CONSTRAINT "AvatarTrainingAssessment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AvatarTrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingAssessment" ADD CONSTRAINT "AvatarTrainingAssessment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarTrainingKnowledgeSource" ADD CONSTRAINT "AvatarTrainingKnowledgeSource_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AvatarTrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

