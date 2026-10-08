
-- CreateEnum
CREATE TYPE "FunderFundingType" AS ENUM ('GRANT', 'DONATION', 'LOAN', 'INVESTMENT', 'SCHOLARSHIP', 'INSTITUTIONAL_FUNDING', 'PROJECT_FUNDING', 'RESULTS_BASED', 'CO_FINANCING', 'OTHER');

-- CreateEnum
CREATE TYPE "FunderTargetGroup" AS ENUM ('YOUTH', 'WOMEN', 'STUDENTS', 'WORKERS', 'ENTREPRENEURS', 'FARMERS', 'COMMUNITIES', 'COMPANIES', 'INSTITUTIONS', 'SOCIAL_ORGANIZATIONS', 'OTHER');

-- AlterTable
ALTER TABLE "Funder" ADD COLUMN     "cofinancingCriteria" TEXT,
ADD COLUMN     "counterpartRequirement" TEXT,
ADD COLUMN     "eligibleLocations" TEXT[],
ADD COLUMN     "eligibleMaxAge" INTEGER,
ADD COLUMN     "eligibleMaxDurationMonths" INTEGER,
ADD COLUMN     "eligibleMaxProjectSize" DOUBLE PRECISION,
ADD COLUMN     "eligibleMinAge" INTEGER,
ADD COLUMN     "eligibleMinDurationMonths" INTEGER,
ADD COLUMN     "eligibleMinProjectSize" DOUBLE PRECISION,
ADD COLUMN     "eligibleOrganizationTypes" TEXT[],
ADD COLUMN     "eligibleSectors" TEXT[],
ADD COLUMN     "eligibleTargetGroups" "FunderTargetGroup"[],
ADD COLUMN     "fundingTypes" "FunderFundingType"[],
ADD COLUMN     "fundsIndividuals" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fundsOrganizations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fundsPrograms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fundsProjects" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxFundingPercentage" DOUBLE PRECISION,
ADD COLUMN     "otherEligibilityCriteria" TEXT,
ADD COLUMN     "requiresCofinancing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "typicalDurationMonths" INTEGER,
ADD COLUMN     "typicalMaxAmount" DOUBLE PRECISION,
ADD COLUMN     "typicalMinAmount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "FunderProgram" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "project" TEXT,
    "thematicArea" "FunderThematicArea",
    "expectedBeneficiaries" INTEGER,
    "reachedBeneficiaries" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "PartnerProgramStatus" NOT NULL DEFAULT 'PLANNED',
    "responsibleId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderProgram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FunderProgram_funderId_idx" ON "FunderProgram"("funderId");

-- CreateIndex
CREATE INDEX "FunderProgram_program_idx" ON "FunderProgram"("program");

-- CreateIndex
CREATE INDEX "FunderProgram_status_idx" ON "FunderProgram"("status");

-- CreateIndex
CREATE INDEX "FunderProgram_deletedAt_idx" ON "FunderProgram"("deletedAt");

-- AddForeignKey
ALTER TABLE "FunderProgram" ADD CONSTRAINT "FunderProgram_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderProgram" ADD CONSTRAINT "FunderProgram_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

