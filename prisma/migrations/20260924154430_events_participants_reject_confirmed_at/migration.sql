-- AlterEnum
ALTER TYPE "EventParticipantStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN     "confirmedAt" TIMESTAMP(3);

