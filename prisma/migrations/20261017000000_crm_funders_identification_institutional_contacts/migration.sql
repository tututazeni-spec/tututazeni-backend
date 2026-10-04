-- CreateEnum
CREATE TYPE "FunderContactRole" AS ENUM ('DECISION_MAKER', 'TECHNICAL', 'FINANCIAL', 'LEGAL', 'COMMUNICATION', 'MONITORING', 'OTHER');

-- CreateEnum
CREATE TYPE "FunderThematicArea" AS ENUM ('EDUCATION', 'VOCATIONAL_TRAINING', 'EMPLOYMENT', 'YOUTH', 'AGRICULTURE', 'AGRIBUSINESS', 'HEALTH', 'COMMUNITY_DEVELOPMENT', 'SOCIAL_INCLUSION', 'ENTREPRENEURSHIP', 'TECHNOLOGY', 'INNOVATION', 'SUSTAINABILITY', 'ENVIRONMENT', 'FOOD_SECURITY', 'ECONOMIC_DEVELOPMENT', 'EQUAL_OPPORTUNITIES', 'OTHER');

-- AlterEnum
ALTER TYPE "FunderType" ADD VALUE 'FOUNDATION';
ALTER TYPE "FunderType" ADD VALUE 'BANK';
ALTER TYPE "FunderType" ADD VALUE 'FINANCIAL_INSTITUTION';
ALTER TYPE "FunderType" ADD VALUE 'COOPERATION_AGENCY';
ALTER TYPE "FunderType" ADD VALUE 'INTERNATIONAL_ORGANIZATION';
ALTER TYPE "FunderType" ADD VALUE 'INVESTMENT_FUND';
ALTER TYPE "FunderType" ADD VALUE 'PUBLIC_FUND';
ALTER TYPE "FunderType" ADD VALUE 'EMBASSY';
ALTER TYPE "FunderType" ADD VALUE 'INDIVIDUAL';

-- AlterEnum
ALTER TYPE "FunderStatus" ADD VALUE 'POTENTIAL';
ALTER TYPE "FunderStatus" ADD VALUE 'NEGOTIATION';
ALTER TYPE "FunderStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "Funder" ADD COLUMN     "address" TEXT,
ADD COLUMN     "areasOfActivity" TEXT[],
ADD COLUMN     "commercialName" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "fundingCountries" TEXT[],
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "mission" TEXT,
ADD COLUMN     "municipality" TEXT,
ADD COLUMN     "organizationSize" "PartnerOrganizationSize",
ADD COLUMN     "organizationType" TEXT,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "province" "AngolaProvince",
ADD COLUMN     "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "sector" TEXT,
ADD COLUMN     "thematicAreas" "FunderThematicArea"[];

-- CreateTable
CREATE TABLE "FunderContact" (
    "id" TEXT NOT NULL,
    "funderId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "preferredChannel" TEXT,
    "role" "FunderContactRole" NOT NULL DEFAULT 'OTHER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FunderContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FunderContact_funderId_idx" ON "FunderContact"("funderId");

-- CreateIndex
CREATE INDEX "FunderContact_isPrimary_idx" ON "FunderContact"("isPrimary");

-- CreateIndex
CREATE INDEX "FunderContact_deletedAt_idx" ON "FunderContact"("deletedAt");

-- AddForeignKey
ALTER TABLE "FunderContact" ADD CONSTRAINT "FunderContact_funderId_fkey" FOREIGN KEY ("funderId") REFERENCES "Funder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
