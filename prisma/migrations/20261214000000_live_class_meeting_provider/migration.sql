-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('JITSI', 'ZOOM', 'TEAMS');

-- AlterTable
ALTER TABLE "LiveClass"
  ADD COLUMN "meetingProvider" "MeetingProvider" NOT NULL DEFAULT 'JITSI',
  ADD COLUMN "meetingUrl" TEXT,
  ADD COLUMN "meetingPasscode" TEXT;

-- AlterTable
ALTER TABLE "LiveClassSession" ADD COLUMN "meetingProvider" "MeetingProvider";
