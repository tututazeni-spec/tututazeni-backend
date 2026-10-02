
-- CreateEnum
CREATE TYPE "AvatarTrainingProviderService" AS ENUM ('TTS', 'STT', 'VIDEO');

-- CreateTable
CREATE TABLE "AvatarTrainingProviderConfig" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "serviceType" "AvatarTrainingProviderService" NOT NULL,
    "configuration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "costPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitLimitPerAttempt" INTEGER,
    "monthlyCostLimit" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarTrainingProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarTrainingUsage" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "serviceType" "AvatarTrainingProviderService" NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarTrainingUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvatarTrainingProviderConfig_provider_serviceType_key" ON "AvatarTrainingProviderConfig"("provider", "serviceType");

-- CreateIndex
CREATE INDEX "AvatarTrainingUsage_attemptId_idx" ON "AvatarTrainingUsage"("attemptId");

-- CreateIndex
CREATE INDEX "AvatarTrainingUsage_provider_createdAt_idx" ON "AvatarTrainingUsage"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "AvatarTrainingUsage_userId_idx" ON "AvatarTrainingUsage"("userId");

