-- CreateEnum
CREATE TYPE "TrainingInstructorType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "TrainingInstructorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TrainingResourceKind" AS ENUM ('ROOM', 'EQUIPMENT', 'MATERIAL', 'CATERING', 'TRANSPORT', 'ACCOMMODATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TrainingResourceStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "Training" ADD COLUMN     "externalInstructorId" INTEGER;

-- CreateTable
CREATE TABLE "TrainingInstructorProfile" (
    "id" SERIAL NOT NULL,
    "type" "TrainingInstructorType" NOT NULL,
    "userId" INTEGER,
    "name" TEXT NOT NULL,
    "entity" TEXT,
    "nif" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trainingAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "competencyIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "certifications" TEXT,
    "professionalExperience" TEXT,
    "trainerExperience" TEXT,
    "availability" TEXT,
    "hourlyCost" DOUBLE PRECISION,
    "documentUrl" TEXT,
    "status" "TrainingInstructorStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingInstructorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingResource" (
    "id" SERIAL NOT NULL,
    "kind" "TrainingResourceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT,
    "location" TEXT,
    "unitId" INTEGER,
    "capacity" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cost" DOUBLE PRECISION,
    "responsibleId" INTEGER,
    "status" "TrainingResourceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingResourceBooking" (
    "id" SERIAL NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "trainingId" INTEGER,
    "sessionId" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingResourceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingInstructorProfile_userId_key" ON "TrainingInstructorProfile"("userId");

-- CreateIndex
CREATE INDEX "TrainingInstructorProfile_status_idx" ON "TrainingInstructorProfile"("status");

-- CreateIndex
CREATE INDEX "TrainingInstructorProfile_type_idx" ON "TrainingInstructorProfile"("type");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingResource_code_key" ON "TrainingResource"("code");

-- CreateIndex
CREATE INDEX "TrainingResource_kind_idx" ON "TrainingResource"("kind");

-- CreateIndex
CREATE INDEX "TrainingResource_status_idx" ON "TrainingResource"("status");

-- CreateIndex
CREATE INDEX "TrainingResourceBooking_resourceId_idx" ON "TrainingResourceBooking"("resourceId");

-- CreateIndex
CREATE INDEX "TrainingResourceBooking_trainingId_idx" ON "TrainingResourceBooking"("trainingId");

-- CreateIndex
CREATE INDEX "TrainingResourceBooking_sessionId_idx" ON "TrainingResourceBooking"("sessionId");

-- CreateIndex
CREATE INDEX "Training_externalInstructorId_idx" ON "Training"("externalInstructorId");

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_externalInstructorId_fkey" FOREIGN KEY ("externalInstructorId") REFERENCES "TrainingInstructorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingInstructorProfile" ADD CONSTRAINT "TrainingInstructorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingResource" ADD CONSTRAINT "TrainingResource_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingResourceBooking" ADD CONSTRAINT "TrainingResourceBooking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "TrainingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingResourceBooking" ADD CONSTRAINT "TrainingResourceBooking_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingResourceBooking" ADD CONSTRAINT "TrainingResourceBooking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingResourceBooking" ADD CONSTRAINT "TrainingResourceBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

