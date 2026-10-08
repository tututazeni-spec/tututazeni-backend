-- CreateEnum
CREATE TYPE "EventSessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventLogisticsStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventEquipmentType" AS ENUM ('PROJECTOR', 'SCREEN', 'SOUND_SYSTEM', 'MICROPHONES', 'CHAIRS', 'TABLES', 'COMPUTERS', 'INTERNET', 'MATERIALS', 'SIGNAGE');

-- CreateTable
CREATE TABLE "EventSession" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "room" TEXT,
    "responsibleId" INTEGER,
    "speaker" TEXT,
    "capacity" INTEGER,
    "status" "EventSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLogistics" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "responsibleId" INTEGER,
    "equipment" "EventEquipmentType"[] DEFAULT ARRAY[]::"EventEquipmentType"[],
    "resourcesNeeded" TEXT,
    "suppliers" TEXT,
    "catering" TEXT,
    "transport" TEXT,
    "accommodation" TEXT,
    "security" TEXT,
    "decoration" TEXT,
    "budget" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "status" "EventLogisticsStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventLogistics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventSession_eventId_idx" ON "EventSession"("eventId");

-- CreateIndex
CREATE INDEX "EventSession_responsibleId_idx" ON "EventSession"("responsibleId");

-- CreateIndex
CREATE INDEX "EventSession_startAt_idx" ON "EventSession"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventLogistics_eventId_key" ON "EventLogistics"("eventId");

-- CreateIndex
CREATE INDEX "EventLogistics_responsibleId_idx" ON "EventLogistics"("responsibleId");

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLogistics" ADD CONSTRAINT "EventLogistics_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLogistics" ADD CONSTRAINT "EventLogistics_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

