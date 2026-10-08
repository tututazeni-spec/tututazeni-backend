-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'INTERNAL', 'RESTRICTED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "address" TEXT,
ADD COLUMN     "allowGuest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "checkinEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "departmentId" INTEGER,
ADD COLUMN     "evaluationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "registrationEndAt" TIMESTAMP(3),
ADD COLUMN     "registrationStartAt" TIMESTAMP(3),
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsibleId" INTEGER,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "targetAudience" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Luanda',
ADD COLUMN     "unitId" INTEGER,
ADD COLUMN     "visibility" "EventVisibility" NOT NULL DEFAULT 'INTERNAL';

-- CreateIndex
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");

-- CreateIndex
CREATE INDEX "Event_responsibleId_idx" ON "Event"("responsibleId");

-- CreateIndex
CREATE INDEX "Event_departmentId_idx" ON "Event"("departmentId");

-- CreateIndex
CREATE INDEX "Event_unitId_idx" ON "Event"("unitId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

