-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'COMMON_LAW');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DocumentValidationStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BenefitKind" AS ENUM ('BENEFIT', 'SERVICE', 'PROGRAM', 'TRAINING', 'COURSE', 'SCHOLARSHIP', 'SUPPORT');

-- CreateEnum
CREATE TYPE "BenefitStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BeneficiaryStatus" ADD VALUE 'UNDER_FOLLOW_UP';
ALTER TYPE "BeneficiaryStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "BeneficiaryStatus" ADD VALUE 'ELIGIBLE';
ALTER TYPE "BeneficiaryStatus" ADD VALUE 'NOT_ELIGIBLE';
ALTER TYPE "BeneficiaryStatus" ADD VALUE 'BENEFIT_ACTIVE';
ALTER TYPE "BeneficiaryStatus" ADD VALUE 'BENEFIT_ENDED';
ALTER TYPE "BeneficiaryStatus" ADD VALUE 'ARCHIVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InteractionType" ADD VALUE 'WHATSAPP';
ALTER TYPE "InteractionType" ADD VALUE 'SMS';
ALTER TYPE "InteractionType" ADD VALUE 'IN_PERSON';
ALTER TYPE "InteractionType" ADD VALUE 'VIDEO_CALL';
ALTER TYPE "InteractionType" ADD VALUE 'PORTAL';
ALTER TYPE "InteractionType" ADD VALUE 'MOBILE_APP';
ALTER TYPE "InteractionType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Beneficiary" ADD COLUMN     "accountManagerId" INTEGER,
ADD COLUMN     "alternativePhone" TEXT,
ADD COLUMN     "authorizedChannels" TEXT[],
ADD COLUMN     "beneficiaryNumber" TEXT,
ADD COLUMN     "commune" TEXT,
ADD COLUMN     "communicationPreferences" TEXT,
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentCommunications" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentDataProcessing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentDataSharing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentRevokedAt" TIMESTAMP(3),
ADD COLUMN     "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "dependentsCount" INTEGER,
ADD COLUMN     "eligibilityCriteria" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelation" TEXT,
ADD COLUMN     "employer" TEXT,
ADD COLUMN     "employmentStatus" TEXT,
ADD COLUMN     "followUpPlan" TEXT,
ADD COLUMN     "followUpResult" TEXT,
ADD COLUMN     "followUpStatus" "FollowUpStatus",
ADD COLUMN     "goals" TEXT,
ADD COLUMN     "householdHeadName" TEXT,
ADD COLUMN     "householdHeadRelation" TEXT,
ADD COLUMN     "householdSize" INTEGER,
ADD COLUMN     "housingSituation" TEXT,
ADD COLUMN     "idDocumentCountry" TEXT,
ADD COLUMN     "idDocumentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "idDocumentIssuedAt" TIMESTAMP(3),
ADD COLUMN     "idDocumentNumber" TEXT,
ADD COLUMN     "idDocumentType" TEXT,
ADD COLUMN     "incomeSource" TEXT,
ADD COLUMN     "isEligible" BOOLEAN,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "maritalStatus" "MaritalStatus",
ADD COLUMN     "monthlyIncome" DOUBLE PRECISION,
ADD COLUMN     "municipality" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "nextActions" TEXT,
ADD COLUMN     "originInstitution" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "priority" "NeedPriority",
ADD COLUMN     "profile" TEXT,
ADD COLUMN     "programName" TEXT,
ADD COLUMN     "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "responsibleUnit" TEXT,
ADD COLUMN     "updatedById" INTEGER;

-- AlterTable
ALTER TABLE "BeneficiaryDocument" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validatedById" INTEGER,
ADD COLUMN     "validationStatus" "DocumentValidationStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "BeneficiaryInteraction" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "relatedBeneficiaryId" TEXT;

-- CreateTable
CREATE TABLE "BeneficiaryBenefit" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "kind" "BenefitKind" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "awardedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "BenefitStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BeneficiaryBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryParticipation" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "project" TEXT,
    "province" "AngolaProvince",
    "municipality" TEXT,
    "locality" TEXT,
    "cohort" TEXT,
    "programEdition" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "ParticipationStatus" NOT NULL DEFAULT 'ENROLLED',
    "attendanceRate" DOUBLE PRECISION,
    "performance" TEXT,
    "certification" TEXT,
    "employability" TEXT,
    "referral" TEXT,
    "finalResult" TEXT,
    "impact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BeneficiaryParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BeneficiaryBenefit_beneficiaryId_idx" ON "BeneficiaryBenefit"("beneficiaryId");

-- CreateIndex
CREATE INDEX "BeneficiaryBenefit_kind_idx" ON "BeneficiaryBenefit"("kind");

-- CreateIndex
CREATE INDEX "BeneficiaryBenefit_status_idx" ON "BeneficiaryBenefit"("status");

-- CreateIndex
CREATE INDEX "BeneficiaryBenefit_deletedAt_idx" ON "BeneficiaryBenefit"("deletedAt");

-- CreateIndex
CREATE INDEX "BeneficiaryParticipation_beneficiaryId_idx" ON "BeneficiaryParticipation"("beneficiaryId");

-- CreateIndex
CREATE INDEX "BeneficiaryParticipation_program_idx" ON "BeneficiaryParticipation"("program");

-- CreateIndex
CREATE INDEX "BeneficiaryParticipation_status_idx" ON "BeneficiaryParticipation"("status");

-- CreateIndex
CREATE INDEX "BeneficiaryParticipation_deletedAt_idx" ON "BeneficiaryParticipation"("deletedAt");

-- CreateIndex
CREATE INDEX "Beneficiary_accountManagerId_idx" ON "Beneficiary"("accountManagerId");

-- CreateIndex
CREATE INDEX "Beneficiary_beneficiaryNumber_idx" ON "Beneficiary"("beneficiaryNumber");

-- CreateIndex
CREATE INDEX "Beneficiary_municipality_idx" ON "Beneficiary"("municipality");

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryInteraction" ADD CONSTRAINT "BeneficiaryInteraction_relatedBeneficiaryId_fkey" FOREIGN KEY ("relatedBeneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryDocument" ADD CONSTRAINT "BeneficiaryDocument_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryBenefit" ADD CONSTRAINT "BeneficiaryBenefit_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryBenefit" ADD CONSTRAINT "BeneficiaryBenefit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryParticipation" ADD CONSTRAINT "BeneficiaryParticipation_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
