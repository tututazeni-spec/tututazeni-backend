-- CreateEnum
CREATE TYPE "FunderReportType" AS ENUM ('FINANCIAL', 'TECHNICAL', 'PROGRESS', 'IMPACT', 'AUDIT', 'EXTERNAL_EVALUATION', 'OTHER');

-- CreateEnum
CREATE TYPE "FunderReportPeriodicity" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "FunderContractType" AS ENUM ('FUNDING_CONTRACT', 'GRANT_AGREEMENT', 'COOPERATION_AGREEMENT', 'MEMORANDUM', 'OTHER');

-- CreateEnum
CREATE TYPE "FunderContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED');

-- CreateEnum
CREATE TYPE "FunderContractRenewal" AS ENUM ('NONE', 'MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "FunderIndicatorKey" AS ENUM ('EXPECTED_BENEFICIARIES', 'REACHED_BENEFICIARIES', 'WOMEN', 'MEN', 'YOUTH', 'TRAININGS', 'PARTICIPANTS', 'TRAINING_HOURS', 'JOBS_CREATED', 'ENTREPRENEURS_SUPPORTED', 'COMMUNITIES_REACHED', 'PROVINCES_COVERED', 'CUSTOM');

-- AlterTable
ALTER TABLE "FunderReport" ADD COLUMN     "periodicity" "FunderReportPeriodicity" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN     "responsibleId" INTEGER,
ADD COLUMN     "type" "FunderReportType" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "FunderContract" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "grantId" TEXT,
    "type" "FunderContractType" NOT NULL,
    "contractNumber" TEXT,
    "signedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "responsibleId" INTEGER,
    "funderContactId" TEXT,
    "conditions" TEXT,
    "obligations" TEXT,
    "relevantClauses" TEXT,
    "renewalType" "FunderContractRenewal" NOT NULL DEFAULT 'NONE',
    "renewalNotes" TEXT,
    "status" "FunderContractStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunderIndicator" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "programId" TEXT,
    "grantId" TEXT,
    "key" "FunderIndicatorKey" NOT NULL,
    "name" TEXT,
    "unit" TEXT,
    "target" DOUBLE PRECISION,
    "achieved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FunderContract_funderId_idx" ON "FunderContract"("funderId");

-- CreateIndex
CREATE INDEX "FunderContract_grantId_idx" ON "FunderContract"("grantId");

-- CreateIndex
CREATE INDEX "FunderContract_status_idx" ON "FunderContract"("status");

-- CreateIndex
CREATE INDEX "FunderContract_endDate_idx" ON "FunderContract"("endDate");

-- CreateIndex
CREATE INDEX "FunderContract_deletedAt_idx" ON "FunderContract"("deletedAt");

-- CreateIndex
CREATE INDEX "FunderIndicator_funderId_idx" ON "FunderIndicator"("funderId");

-- CreateIndex
CREATE INDEX "FunderIndicator_programId_idx" ON "FunderIndicator"("programId");

-- CreateIndex
CREATE INDEX "FunderIndicator_grantId_idx" ON "FunderIndicator"("grantId");

-- CreateIndex
CREATE INDEX "FunderIndicator_key_idx" ON "FunderIndicator"("key");

-- CreateIndex
CREATE INDEX "FunderIndicator_deletedAt_idx" ON "FunderIndicator"("deletedAt");

-- CreateIndex
CREATE INDEX "FunderReport_type_idx" ON "FunderReport"("type");

-- CreateIndex
CREATE INDEX "FunderReport_responsibleId_idx" ON "FunderReport"("responsibleId");

-- AddForeignKey
ALTER TABLE "FunderReport" ADD CONSTRAINT "FunderReport_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderContract" ADD CONSTRAINT "FunderContract_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderContract" ADD CONSTRAINT "FunderContract_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "FundingGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderContract" ADD CONSTRAINT "FunderContract_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderContract" ADD CONSTRAINT "FunderContract_funderContactId_fkey" FOREIGN KEY ("funderContactId") REFERENCES "FunderContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderIndicator" ADD CONSTRAINT "FunderIndicator_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderIndicator" ADD CONSTRAINT "FunderIndicator_programId_fkey" FOREIGN KEY ("programId") REFERENCES "FunderProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderIndicator" ADD CONSTRAINT "FunderIndicator_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "FundingGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
