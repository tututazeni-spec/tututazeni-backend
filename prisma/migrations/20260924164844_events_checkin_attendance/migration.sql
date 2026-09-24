-- CreateEnum
CREATE TYPE "EventCheckinMethod" AS ENUM ('QR_CODE', 'MOBILE_APP', 'CODE', 'MANUAL');

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN     "checkinMethod" "EventCheckinMethod",
ADD COLUMN     "checkinNote" TEXT;

-- CreateTable
CREATE TABLE "EventSessionAttendance" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "method" "EventCheckinMethod",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSessionAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventSessionAttendance_sessionId_idx" ON "EventSessionAttendance"("sessionId");

-- CreateIndex
CREATE INDEX "EventSessionAttendance_userId_idx" ON "EventSessionAttendance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSessionAttendance_sessionId_userId_key" ON "EventSessionAttendance"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "EventSessionAttendance" ADD CONSTRAINT "EventSessionAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSessionAttendance" ADD CONSTRAINT "EventSessionAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

