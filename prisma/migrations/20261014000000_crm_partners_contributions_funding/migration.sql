-- CreateEnum
CREATE TYPE "PartnerContributionType" AS ENUM ('FINANCIAL', 'HUMAN_RESOURCES', 'EQUIPMENT', 'FACILITIES', 'TRAINING', 'CONTENT', 'TECHNOLOGY', 'SERVICES', 'LOGISTICS', 'SCHOLARSHIPS', 'MATERIALS', 'NETWORK', 'TECHNICAL_KNOWLEDGE', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerContributionPeriodicity" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "isFunder" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PartnerContribution" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "programId" TEXT,
    "type" "PartnerContributionType" NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION,
    "estimatedValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "periodicity" "PartnerContributionPeriodicity" NOT NULL DEFAULT 'ONE_TIME',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerFunderLink" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "fundedPrograms" TEXT[],
    "amountFunded" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerFunderLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerContribution_partnerId_idx" ON "PartnerContribution"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerContribution_programId_idx" ON "PartnerContribution"("programId");

-- CreateIndex
CREATE INDEX "PartnerContribution_type_idx" ON "PartnerContribution"("type");

-- CreateIndex
CREATE INDEX "PartnerContribution_deletedAt_idx" ON "PartnerContribution"("deletedAt");

-- CreateIndex
CREATE INDEX "PartnerFunderLink_partnerId_idx" ON "PartnerFunderLink"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerFunderLink_funderId_idx" ON "PartnerFunderLink"("funderId");

-- CreateIndex
CREATE INDEX "PartnerFunderLink_deletedAt_idx" ON "PartnerFunderLink"("deletedAt");

-- AddForeignKey
ALTER TABLE "PartnerContribution" ADD CONSTRAINT "PartnerContribution_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerContribution" ADD CONSTRAINT "PartnerContribution_programId_fkey" FOREIGN KEY ("programId") REFERENCES "PartnerProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFunderLink" ADD CONSTRAINT "PartnerFunderLink_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFunderLink" ADD CONSTRAINT "PartnerFunderLink_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
