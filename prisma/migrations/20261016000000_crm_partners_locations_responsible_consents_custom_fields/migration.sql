-- CreateEnum
CREATE TYPE "PartnerLocationType" AS ENUM ('HEADQUARTERS', 'BRANCH', 'DELEGATION', 'OFFICE', 'WAREHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerRelationshipStatus" AS ENUM ('PROSPECTING', 'DEVELOPING', 'CONSOLIDATED', 'AT_RISK', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "PartnerCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "internalDepartment" TEXT,
ADD COLUMN     "internalTeam" TEXT,
ADD COLUMN     "internalUnit" TEXT,
ADD COLUMN     "relationshipStatus" "PartnerRelationshipStatus" NOT NULL DEFAULT 'DEVELOPING';

-- CreateTable
CREATE TABLE "PartnerLocation" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartnerLocationType" NOT NULL DEFAULT 'DELEGATION',
    "country" TEXT NOT NULL DEFAULT 'Angola',
    "province" "AngolaProvince",
    "municipality" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerConsent" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "emailAllowed" BOOLEAN NOT NULL DEFAULT false,
    "whatsappAllowed" BOOLEAN NOT NULL DEFAULT false,
    "smsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "phoneAllowed" BOOLEAN NOT NULL DEFAULT false,
    "institutionalComms" BOOLEAN NOT NULL DEFAULT false,
    "eventInvites" BOOLEAN NOT NULL DEFAULT false,
    "programComms" BOOLEAN NOT NULL DEFAULT false,
    "contactPreferences" TEXT,
    "consentDate" TIMESTAMP(3),
    "notes" TEXT,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "PartnerCustomFieldType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerCustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerLocation_partnerId_idx" ON "PartnerLocation"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerLocation_province_idx" ON "PartnerLocation"("province");

-- CreateIndex
CREATE INDEX "PartnerLocation_deletedAt_idx" ON "PartnerLocation"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerConsent_partnerId_key" ON "PartnerConsent"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCustomFieldDefinition_key_key" ON "PartnerCustomFieldDefinition"("key");

-- CreateIndex
CREATE INDEX "PartnerCustomFieldDefinition_deletedAt_idx" ON "PartnerCustomFieldDefinition"("deletedAt");

-- AddForeignKey
ALTER TABLE "PartnerLocation" ADD CONSTRAINT "PartnerLocation_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerConsent" ADD CONSTRAINT "PartnerConsent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
