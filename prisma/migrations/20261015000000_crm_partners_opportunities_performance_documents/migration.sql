◇ injected env (35) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
-- CreateEnum
CREATE TYPE "PartnerOpportunityStatus" AS ENUM ('IDENTIFIED', 'CONTACTED', 'IN_DISCUSSION', 'PROPOSAL_SENT', 'IN_NEGOTIATION', 'AGREEMENT_REACHED', 'NOT_CONCLUDED');

-- CreateEnum
CREATE TYPE "PartnerDocumentType" AS ENUM ('CONTRACT', 'PROTOCOL', 'MEMORANDUM', 'CERTIFICATE_OF_REGISTRATION', 'PROPOSAL', 'REPORT', 'PROOF', 'CERTIFICATE', 'INSTITUTIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerDocumentStatus" AS ENUM ('DRAFT', 'VALID', 'EXPIRED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "PartnerOpportunity" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "program" TEXT,
    "partnershipType" "PartnershipKind",
    "responsibleId" INTEGER,
    "potentialValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "probability" INTEGER,
    "expectedDate" TIMESTAMP(3),
    "status" "PartnerOpportunityStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerImpactIndicator" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION,
    "unit" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerImpactIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDocument" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PartnerDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "documentDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" "PartnerDocumentStatus" NOT NULL DEFAULT 'VALID',
    "responsibleId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerOpportunity_partnerId_idx" ON "PartnerOpportunity"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerOpportunity_status_idx" ON "PartnerOpportunity"("status");

-- CreateIndex
CREATE INDEX "PartnerOpportunity_expectedDate_idx" ON "PartnerOpportunity"("expectedDate");

-- CreateIndex
CREATE INDEX "PartnerOpportunity_deletedAt_idx" ON "PartnerOpportunity"("deletedAt");

-- CreateIndex
CREATE INDEX "PartnerImpactIndicator_partnerId_idx" ON "PartnerImpactIndicator"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerImpactIndicator_deletedAt_idx" ON "PartnerImpactIndicator"("deletedAt");

-- CreateIndex
CREATE INDEX "PartnerDocument_partnerId_idx" ON "PartnerDocument"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerDocument_validUntil_idx" ON "PartnerDocument"("validUntil");

-- CreateIndex
CREATE INDEX "PartnerDocument_deletedAt_idx" ON "PartnerDocument"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerDocument_partnerId_name_version_key" ON "PartnerDocument"("partnerId", "name", "version");

-- AddForeignKey
ALTER TABLE "PartnerOpportunity" ADD CONSTRAINT "PartnerOpportunity_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOpportunity" ADD CONSTRAINT "PartnerOpportunity_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerImpactIndicator" ADD CONSTRAINT "PartnerImpactIndicator_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

