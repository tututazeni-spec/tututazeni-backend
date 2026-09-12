-- CreateEnum
CREATE TYPE "TrainingAssessmentRole" AS ENUM ('INITIAL', 'FINAL', 'SATISFACTION_SURVEY', 'INSTRUCTOR_EVALUATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrainingParticipantStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "TrainingParticipantStatus" ADD VALUE 'REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrainingType" ADD VALUE 'VIRTUAL_ROOM';
ALTER TYPE "TrainingType" ADD VALUE 'ELEARNING';
ALTER TYPE "TrainingType" ADD VALUE 'WORKSHOP';
ALTER TYPE "TrainingType" ADD VALUE 'SEMINAR';
ALTER TYPE "TrainingType" ADD VALUE 'COACHING';
ALTER TYPE "TrainingType" ADD VALUE 'MENTORING';

-- AlterTable
ALTER TABLE "Training" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "classDescription" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "foodCost" DOUBLE PRECISION,
ADD COLUMN     "instructorCost" DOUBLE PRECISION,
ADD COLUMN     "lodgingCost" DOUBLE PRECISION,
ADD COLUMN     "materialCost" DOUBLE PRECISION,
ADD COLUMN     "modalityDetails" TEXT,
ADD COLUMN     "otherCosts" DOUBLE PRECISION,
ADD COLUMN     "plannedSessionsCount" INTEGER,
ADD COLUMN     "requiredResources" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roomLocation" TEXT,
ADD COLUMN     "schedule" TEXT,
ADD COLUMN     "thematicArea" TEXT,
ADD COLUMN     "trainingEntity" TEXT,
ADD COLUMN     "transportCost" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "TrainingCompetency" (
    "id" SERIAL NOT NULL,
    "trainingId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,

    CONSTRAINT "TrainingCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCoInstructor" (
    "id" SERIAL NOT NULL,
    "trainingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "TrainingCoInstructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingDocument" (
    "id" SERIAL NOT NULL,
    "trainingId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "category" TEXT,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssessment" (
    "id" SERIAL NOT NULL,
    "trainingId" INTEGER NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "role" "TrainingAssessmentRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingCompetency_competencyId_idx" ON "TrainingCompetency"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCompetency_trainingId_competencyId_key" ON "TrainingCompetency"("trainingId", "competencyId");

-- CreateIndex
CREATE INDEX "TrainingCoInstructor_userId_idx" ON "TrainingCoInstructor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCoInstructor_trainingId_userId_key" ON "TrainingCoInstructor"("trainingId", "userId");

-- CreateIndex
CREATE INDEX "TrainingDocument_trainingId_idx" ON "TrainingDocument"("trainingId");

-- CreateIndex
CREATE INDEX "TrainingAssessment_assessmentId_idx" ON "TrainingAssessment"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssessment_trainingId_role_key" ON "TrainingAssessment"("trainingId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Training_code_key" ON "Training"("code");

-- CreateIndex
CREATE INDEX "Training_createdById_idx" ON "Training"("createdById");

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCompetency" ADD CONSTRAINT "TrainingCompetency_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCompetency" ADD CONSTRAINT "TrainingCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCoInstructor" ADD CONSTRAINT "TrainingCoInstructor_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCoInstructor" ADD CONSTRAINT "TrainingCoInstructor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDocument" ADD CONSTRAINT "TrainingDocument_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDocument" ADD CONSTRAINT "TrainingDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssessment" ADD CONSTRAINT "TrainingAssessment_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssessment" ADD CONSTRAINT "TrainingAssessment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

