-- CreateTable
CREATE TABLE "OneOnOneMeeting" (
    "id" SERIAL NOT NULL,
    "hostId" INTEGER NOT NULL,
    "participantId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "agenda" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT,
    "meetingUrl" TEXT,
    "minutes" TEXT,
    "actionItems" TEXT,
    "nextMeetingDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneOnOneMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OneOnOneMeeting_hostId_idx" ON "OneOnOneMeeting"("hostId");

-- CreateIndex
CREATE INDEX "OneOnOneMeeting_participantId_idx" ON "OneOnOneMeeting"("participantId");

-- CreateIndex
CREATE INDEX "OneOnOneMeeting_scheduledAt_idx" ON "OneOnOneMeeting"("scheduledAt");

-- CreateIndex
CREATE INDEX "OneOnOneMeeting_status_idx" ON "OneOnOneMeeting"("status");

-- AddForeignKey
ALTER TABLE "OneOnOneMeeting" ADD CONSTRAINT "OneOnOneMeeting_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOneMeeting" ADD CONSTRAINT "OneOnOneMeeting_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
