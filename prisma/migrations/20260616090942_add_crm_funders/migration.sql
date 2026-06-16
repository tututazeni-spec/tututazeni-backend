-- CreateEnum
CREATE TYPE "FunderType" AS ENUM ('GOVERNMENT', 'BILATERAL', 'MULTILATERAL', 'NGO', 'PRIVATE_FOUNDATION', 'CORPORATE', 'OTHER');

-- CreateEnum
CREATE TYPE "FunderStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'FORMER', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FunderInteractionType" AS ENUM ('EMAIL', 'CALL', 'MEETING', 'VISIT', 'EVENT', 'NOTE', 'REVIEW');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OVERDUE');

-- CreateTable
CREATE TABLE "Funder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "type" "FunderType" NOT NULL,
    "category" TEXT,
    "contactName" TEXT,
    "contactTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "website" TEXT,
    "country" TEXT,
    "region" TEXT,
    "nif" TEXT,
    "status" "FunderStatus" NOT NULL DEFAULT 'ACTIVE',
    "relationshipStart" TIMESTAMP(3),
    "totalCommitted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPending" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "focusAreas" TEXT[],
    "tags" TEXT[],
    "reportingReqs" TEXT,
    "assignedToId" INTEGER,
    "notes" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "nextReportDue" TIMESTAMP(3),
    "satisfactionAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Funder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingGrant" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "disbursed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "exchangeRate" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "GrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "objectives" TEXT[],
    "conditions" TEXT,
    "reportingCycle" TEXT NOT NULL DEFAULT 'quarterly',
    "nextReportDue" TIMESTAMP(3),
    "programIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FundingGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantDisbursement" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "bankRef" TEXT,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GrantDisbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunderInteraction" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "grantId" TEXT,
    "type" "FunderInteractionType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMin" INTEGER,
    "outcome" TEXT,
    "nextAction" TEXT,
    "nextDate" TIMESTAMP(3),
    "satisfaction" INTEGER,
    "attachments" TEXT[],
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunderReport" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "grantId" TEXT,
    "title" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "fileUrl" TEXT,
    "feedback" TEXT,
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Funder_code_key" ON "Funder"("code");

-- CreateIndex
CREATE INDEX "Funder_type_idx" ON "Funder"("type");

-- CreateIndex
CREATE INDEX "Funder_status_idx" ON "Funder"("status");

-- CreateIndex
CREATE INDEX "Funder_assignedToId_idx" ON "Funder"("assignedToId");

-- CreateIndex
CREATE INDEX "Funder_nextReportDue_idx" ON "Funder"("nextReportDue");

-- CreateIndex
CREATE INDEX "Funder_deletedAt_idx" ON "Funder"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundingGrant_code_key" ON "FundingGrant"("code");

-- CreateIndex
CREATE INDEX "FundingGrant_funderId_idx" ON "FundingGrant"("funderId");

-- CreateIndex
CREATE INDEX "FundingGrant_status_idx" ON "FundingGrant"("status");

-- CreateIndex
CREATE INDEX "FundingGrant_nextReportDue_idx" ON "FundingGrant"("nextReportDue");

-- CreateIndex
CREATE INDEX "FundingGrant_deletedAt_idx" ON "FundingGrant"("deletedAt");

-- CreateIndex
CREATE INDEX "GrantDisbursement_grantId_idx" ON "GrantDisbursement"("grantId");

-- CreateIndex
CREATE INDEX "GrantDisbursement_receivedAt_idx" ON "GrantDisbursement"("receivedAt");

-- CreateIndex
CREATE INDEX "GrantDisbursement_deletedAt_idx" ON "GrantDisbursement"("deletedAt");

-- CreateIndex
CREATE INDEX "FunderInteraction_funderId_idx" ON "FunderInteraction"("funderId");

-- CreateIndex
CREATE INDEX "FunderInteraction_grantId_idx" ON "FunderInteraction"("grantId");

-- CreateIndex
CREATE INDEX "FunderInteraction_date_idx" ON "FunderInteraction"("date");

-- CreateIndex
CREATE INDEX "FunderInteraction_deletedAt_idx" ON "FunderInteraction"("deletedAt");

-- CreateIndex
CREATE INDEX "FunderReport_funderId_idx" ON "FunderReport"("funderId");

-- CreateIndex
CREATE INDEX "FunderReport_grantId_idx" ON "FunderReport"("grantId");

-- CreateIndex
CREATE INDEX "FunderReport_status_idx" ON "FunderReport"("status");

-- CreateIndex
CREATE INDEX "FunderReport_dueDate_idx" ON "FunderReport"("dueDate");

-- CreateIndex
CREATE INDEX "FunderReport_deletedAt_idx" ON "FunderReport"("deletedAt");

-- AddForeignKey
ALTER TABLE "Funder" ADD CONSTRAINT "Funder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funder" ADD CONSTRAINT "Funder_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingGrant" ADD CONSTRAINT "FundingGrant_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDisbursement" ADD CONSTRAINT "GrantDisbursement_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "FundingGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDisbursement" ADD CONSTRAINT "GrantDisbursement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderInteraction" ADD CONSTRAINT "FunderInteraction_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderInteraction" ADD CONSTRAINT "FunderInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderInteraction" ADD CONSTRAINT "FunderInteraction_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "FundingGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderReport" ADD CONSTRAINT "FunderReport_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderReport" ADD CONSTRAINT "FunderReport_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "FundingGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderReport" ADD CONSTRAINT "FunderReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
