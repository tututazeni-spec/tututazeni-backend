-- AlterEnum
ALTER TYPE "GrantStatus" ADD VALUE 'PREPARING';
ALTER TYPE "GrantStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "GrantStatus" ADD VALUE 'UNDER_EVALUATION';
ALTER TYPE "GrantStatus" ADD VALUE 'APPROVED';
ALTER TYPE "GrantStatus" ADD VALUE 'CONTRACTED';
ALTER TYPE "GrantStatus" ADD VALUE 'IN_EXECUTION';
ALTER TYPE "GrantStatus" ADD VALUE 'REJECTED';

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('PREDICTED', 'RECEIVED', 'DELAYED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FunderOpportunityStatus" AS ENUM ('IDENTIFIED', 'UNDER_ANALYSIS', 'PREPARING', 'SUBMITTED', 'UNDER_EVALUATION', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FunderOpportunityDocumentType" AS ENUM ('TERMS_OF_REFERENCE', 'CALL_FOR_PROPOSALS', 'FORM', 'BUDGET', 'TECHNICAL_PROPOSAL', 'OTHER');

-- AlterTable
ALTER TABLE "FundingGrant" ADD COLUMN     "approvalDate" TIMESTAMP(3),
ADD COLUMN     "fundingType" "FunderFundingType",
ADD COLUMN     "programId" TEXT,
ADD COLUMN     "requestedAmount" DOUBLE PRECISION,
ADD COLUMN     "usedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GrantDisbursement" ADD COLUMN     "expectedDate" TIMESTAMP(3),
ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "proofUrl" TEXT,
ADD COLUMN     "status" "DisbursementStatus" NOT NULL DEFAULT 'RECEIVED',
ALTER COLUMN "receivedAt" DROP NOT NULL;

-- Backfill: numera as parcelas já existentes por financiamento, pela ordem de recebimento
UPDATE "GrantDisbursement" d
SET "installmentNumber" = n.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "grantId" ORDER BY "receivedAt", "createdAt") AS rn
  FROM "GrantDisbursement"
) n
WHERE d."id" = n."id";

-- CreateTable
CREATE TABLE "FunderOpportunity" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programId" TEXT,
    "thematicArea" "FunderThematicArea",
    "potentialValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "openingDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "expectedDecisionDate" TIMESTAMP(3),
    "responsibleId" INTEGER,
    "status" "FunderOpportunityStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunderOpportunityDocument" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "type" "FunderOpportunityDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderOpportunityDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FunderOpportunity_funderId_idx" ON "FunderOpportunity"("funderId");
CREATE INDEX "FunderOpportunity_programId_idx" ON "FunderOpportunity"("programId");
CREATE INDEX "FunderOpportunity_status_idx" ON "FunderOpportunity"("status");
CREATE INDEX "FunderOpportunity_deadline_idx" ON "FunderOpportunity"("deadline");
CREATE INDEX "FunderOpportunity_deletedAt_idx" ON "FunderOpportunity"("deletedAt");
CREATE INDEX "FunderOpportunityDocument_opportunityId_idx" ON "FunderOpportunityDocument"("opportunityId");
CREATE INDEX "FunderOpportunityDocument_deletedAt_idx" ON "FunderOpportunityDocument"("deletedAt");
CREATE INDEX "FundingGrant_programId_idx" ON "FundingGrant"("programId");
CREATE INDEX "GrantDisbursement_status_idx" ON "GrantDisbursement"("status");

-- AddForeignKey
ALTER TABLE "FundingGrant" ADD CONSTRAINT "FundingGrant_programId_fkey" FOREIGN KEY ("programId") REFERENCES "FunderProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FunderOpportunity" ADD CONSTRAINT "FunderOpportunity_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FunderOpportunity" ADD CONSTRAINT "FunderOpportunity_programId_fkey" FOREIGN KEY ("programId") REFERENCES "FunderProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FunderOpportunity" ADD CONSTRAINT "FunderOpportunity_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FunderOpportunityDocument" ADD CONSTRAINT "FunderOpportunityDocument_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "FunderOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
