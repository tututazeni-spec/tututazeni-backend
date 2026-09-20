-- DropIndex
DROP INDEX "LiveAttendance_liveClassId_userId_key";

-- AlterTable
ALTER TABLE "LiveAttendance" ALTER COLUMN "joinedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LiveClass" ADD COLUMN     "recordingPublishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LiveClassSession" ADD COLUMN     "recordingPublishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "LiveAttendance_liveClassId_userId_sessionId_key" ON "LiveAttendance"("liveClassId", "userId", "sessionId");

