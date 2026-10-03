
-- CreateEnum
CREATE TYPE "FunderPartnerRelationType" AS ENUM ('CONSORTIUM', 'CO_FINANCING', 'IMPLEMENTATION', 'TECHNICAL_SUPPORT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FunderInteractionType" ADD VALUE 'CONTACT';
ALTER TYPE "FunderInteractionType" ADD VALUE 'PROJECT_PRESENTATION';
ALTER TYPE "FunderInteractionType" ADD VALUE 'APPLICATION';
ALTER TYPE "FunderInteractionType" ADD VALUE 'NEGOTIATION';
ALTER TYPE "FunderInteractionType" ADD VALUE 'FOLLOW_UP';
ALTER TYPE "FunderInteractionType" ADD VALUE 'EVALUATION';
ALTER TYPE "FunderInteractionType" ADD VALUE 'CONTRACT_SIGNING';
ALTER TYPE "FunderInteractionType" ADD VALUE 'REPORT';
ALTER TYPE "FunderInteractionType" ADD VALUE 'RENEWAL';

-- AlterTable
ALTER TABLE "PartnerFunderLink" ADD COLUMN     "programId" TEXT,
ADD COLUMN     "relationType" "FunderPartnerRelationType" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Funder" ADD COLUMN     "nextContactAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FunderInteraction" ADD COLUMN     "participants" TEXT[],
ADD COLUMN     "responsibleId" INTEGER;

-- CreateIndex
CREATE INDEX "PartnerFunderLink_programId_idx" ON "PartnerFunderLink"("programId");

-- CreateIndex
CREATE INDEX "Funder_nextContactAt_idx" ON "Funder"("nextContactAt");

-- CreateIndex
CREATE INDEX "FunderInteraction_type_idx" ON "FunderInteraction"("type");

-- CreateIndex
CREATE INDEX "FunderInteraction_responsibleId_idx" ON "FunderInteraction"("responsibleId");

-- AddForeignKey
ALTER TABLE "PartnerFunderLink" ADD CONSTRAINT "PartnerFunderLink_programId_fkey" FOREIGN KEY ("programId") REFERENCES "FunderProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderInteraction" ADD CONSTRAINT "FunderInteraction_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

