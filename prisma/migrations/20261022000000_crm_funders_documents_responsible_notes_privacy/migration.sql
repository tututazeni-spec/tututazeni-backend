-- CreateEnum
CREATE TYPE "FunderDocumentType" AS ENUM ('CONTRACT', 'GRANT_AGREEMENT', 'APPLICATION', 'PROPOSAL', 'BUDGET', 'REPORT', 'AUDIT', 'PROOF', 'TERMS_OF_REFERENCE', 'EVALUATION', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "FunderDocumentStatus" AS ENUM ('DRAFT', 'VALID', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FunderCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT');

-- AlterTable
ALTER TABLE "Funder" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "financialManagerId" INTEGER,
ADD COLUMN     "internalDepartment" TEXT,
ADD COLUMN     "internalTeam" TEXT,
ADD COLUMN     "internalUnit" TEXT,
ADD COLUMN     "observations" TEXT,
ADD COLUMN     "relationshipStrategy" TEXT,
ADD COLUMN     "relevantHistory" TEXT,
ADD COLUMN     "technicalManagerId" INTEGER,
ADD COLUMN     "updatedById" INTEGER;

-- CreateTable
CREATE TABLE "FunderDocument" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "type" "FunderDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "documentDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" "FunderDocumentStatus" NOT NULL DEFAULT 'VALID',
    "responsibleId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunderConsent" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "emailAllowed" BOOLEAN NOT NULL DEFAULT false,
    "whatsappAllowed" BOOLEAN NOT NULL DEFAULT false,
    "smsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "phoneAllowed" BOOLEAN NOT NULL DEFAULT false,
    "institutionalComms" BOOLEAN NOT NULL DEFAULT false,
    "eventInvites" BOOLEAN NOT NULL DEFAULT false,
    "reportComms" BOOLEAN NOT NULL DEFAULT false,
    "contactPreferences" TEXT,
    "consentDate" TIMESTAMP(3),
    "notes" TEXT,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunderConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunderCustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FunderCustomFieldType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderCustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FunderDocument_funderId_idx" ON "FunderDocument"("funderId");

-- CreateIndex
CREATE INDEX "FunderDocument_type_idx" ON "FunderDocument"("type");

-- CreateIndex
CREATE INDEX "FunderDocument_validUntil_idx" ON "FunderDocument"("validUntil");

-- CreateIndex
CREATE INDEX "FunderDocument_deletedAt_idx" ON "FunderDocument"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FunderDocument_funderId_name_version_key" ON "FunderDocument"("funderId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FunderConsent_funderId_key" ON "FunderConsent"("funderId");

-- CreateIndex
CREATE UNIQUE INDEX "FunderCustomFieldDefinition_key_key" ON "FunderCustomFieldDefinition"("key");

-- CreateIndex
CREATE INDEX "FunderCustomFieldDefinition_deletedAt_idx" ON "FunderCustomFieldDefinition"("deletedAt");

-- AddForeignKey
ALTER TABLE "Funder" ADD CONSTRAINT "Funder_financialManagerId_fkey" FOREIGN KEY ("financialManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funder" ADD CONSTRAINT "Funder_technicalManagerId_fkey" FOREIGN KEY ("technicalManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderDocument" ADD CONSTRAINT "FunderDocument_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderDocument" ADD CONSTRAINT "FunderDocument_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderDocument" ADD CONSTRAINT "FunderDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunderConsent" ADD CONSTRAINT "FunderConsent_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
