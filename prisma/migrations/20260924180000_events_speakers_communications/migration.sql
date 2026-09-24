-- CreateEnum
CREATE TYPE "EventSpeakerType" AS ENUM ('SPEAKER', 'LECTURER', 'MODERATOR', 'GUEST', 'PANELIST', 'FACILITATOR', 'INSTITUTIONAL_REP');

-- CreateEnum
CREATE TYPE "EventSpeakerStatus" AS ENUM ('INVITED', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventCommunicationType" AS ENUM ('INVITATION', 'CONFIRMATION', 'REMINDER', 'TIME_CHANGE', 'LOCATION_CHANGE', 'CANCELLATION', 'INSTRUCTIONS', 'THANK_YOU', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "EventCommunicationChannel" AS ENUM ('INNOVA_NOTIFICATION', 'EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "EventCommunicationStatus" AS ENUM ('DRAFT', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "EventSpeaker" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EventSpeakerType" NOT NULL,
    "organization" TEXT,
    "position" TEXT,
    "contact" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "topic" TEXT,
    "sessionId" INTEGER,
    "schedule" TEXT,
    "specialNeeds" TEXT,
    "fee" DOUBLE PRECISION,
    "transport" TEXT,
    "accommodation" TEXT,
    "status" "EventSpeakerStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpeaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCommunication" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "type" "EventCommunicationType" NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "EventCommunicationChannel" NOT NULL,
    "recipientIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EventCommunicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventSpeaker_eventId_idx" ON "EventSpeaker"("eventId");

-- CreateIndex
CREATE INDEX "EventSpeaker_sessionId_idx" ON "EventSpeaker"("sessionId");

-- CreateIndex
CREATE INDEX "EventSpeaker_status_idx" ON "EventSpeaker"("status");

-- CreateIndex
CREATE INDEX "EventCommunication_eventId_idx" ON "EventCommunication"("eventId");

-- CreateIndex
CREATE INDEX "EventCommunication_type_idx" ON "EventCommunication"("type");

-- CreateIndex
CREATE INDEX "EventCommunication_channel_idx" ON "EventCommunication"("channel");

-- CreateIndex
CREATE INDEX "EventCommunication_status_idx" ON "EventCommunication"("status");

-- AddForeignKey
ALTER TABLE "EventSpeaker" ADD CONSTRAINT "EventSpeaker_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSpeaker" ADD CONSTRAINT "EventSpeaker_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCommunication" ADD CONSTRAINT "EventCommunication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCommunication" ADD CONSTRAINT "EventCommunication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

