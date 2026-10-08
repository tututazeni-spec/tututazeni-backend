-- CreateEnum
CREATE TYPE "PartnershipLevel" AS ENUM ('STRATEGIC', 'INSTITUTIONAL', 'OPERATIONAL', 'TECHNICAL', 'COMMERCIAL', 'TRAINING', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "PartnerOrganizationSize" AS ENUM ('MICRO', 'SMALL', 'MEDIUM', 'LARGE');

-- AlterEnum
ALTER TYPE "PartnerType" ADD VALUE 'COMPANY';
ALTER TYPE "PartnerType" ADD VALUE 'NGO';
ALTER TYPE "PartnerType" ADD VALUE 'PUBLIC_INSTITUTION';
ALTER TYPE "PartnerType" ADD VALUE 'EDUCATION_INSTITUTION';
ALTER TYPE "PartnerType" ADD VALUE 'INTERNATIONAL_ORGANIZATION';
ALTER TYPE "PartnerType" ADD VALUE 'ASSOCIATION';
ALTER TYPE "PartnerType" ADD VALUE 'FOUNDATION';
ALTER TYPE "PartnerType" ADD VALUE 'FINANCIAL_INSTITUTION';
ALTER TYPE "PartnerType" ADD VALUE 'SUPPLIER';
ALTER TYPE "PartnerType" ADD VALUE 'TECHNOLOGY_PARTNER';
ALTER TYPE "PartnerType" ADD VALUE 'TRAINING_PARTNER';

-- AlterEnum
ALTER TYPE "PartnerStatus" ADD VALUE 'POTENTIAL';
ALTER TYPE "PartnerStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "areasOfActivity" TEXT[],
ADD COLUMN     "category" TEXT,
ADD COLUMN     "commercialName" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "mission" TEXT,
ADD COLUMN     "municipality" TEXT,
ADD COLUMN     "organizationSize" "PartnerOrganizationSize",
ADD COLUMN     "organizationType" TEXT,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "partnershipLevel" "PartnershipLevel",
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "sector" TEXT,
ADD COLUMN     "segment" TEXT,
ADD COLUMN     "specializationArea" TEXT;

-- CreateTable
CREATE TABLE "PartnerContact" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "preferredChannel" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerContact_partnerId_idx" ON "PartnerContact"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerContact_isPrimary_idx" ON "PartnerContact"("isPrimary");

-- CreateIndex
CREATE INDEX "PartnerContact_deletedAt_idx" ON "PartnerContact"("deletedAt");

-- AddForeignKey
ALTER TABLE "PartnerContact" ADD CONSTRAINT "PartnerContact_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
