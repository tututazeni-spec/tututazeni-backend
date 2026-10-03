-- CreateEnum
CREATE TYPE "PartnershipKind" AS ENUM ('TRAINING', 'EDUCATION', 'EMPLOYMENT', 'INTERNSHIPS', 'RECRUITMENT', 'FUNDING', 'PROJECT_IMPLEMENTATION', 'TECHNICAL_SUPPORT', 'SUPPLY', 'TECHNOLOGY', 'CONTENT', 'EVENTS', 'MENTORING', 'RESEARCH', 'CERTIFICATION', 'LOGISTICS', 'COMMUNICATION', 'SOCIAL_RESPONSIBILITY', 'COMMUNITY_DEVELOPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerProgramStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartnerAgreementType" AS ENUM ('MOU', 'CONTRACT', 'PROTOCOL', 'PARTNERSHIP_AGREEMENT', 'COLLABORATION_TERMS', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerAgreementStatus" AS ENUM ('DRAFTING', 'NEGOTIATION', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "partnershipTypes" "PartnershipKind"[];

-- CreateTable
CREATE TABLE "PartnerProgram" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "project" TEXT,
    "interventionArea" TEXT,
    "role" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "PartnerProgramStatus" NOT NULL DEFAULT 'PLANNED',
    "responsibleId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAgreement" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PartnerAgreementType" NOT NULL,
    "documentNumber" TEXT,
    "signedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "responsibleId" INTEGER,
    "partnerRepresentative" TEXT,
    "status" "PartnerAgreementStatus" NOT NULL DEFAULT 'DRAFTING',
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "mainConditions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAgreementVersion" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "notes" TEXT,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerAgreementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerProgram_partnerId_idx" ON "PartnerProgram"("partnerId");
CREATE INDEX "PartnerProgram_program_idx" ON "PartnerProgram"("program");
CREATE INDEX "PartnerProgram_status_idx" ON "PartnerProgram"("status");
CREATE INDEX "PartnerProgram_deletedAt_idx" ON "PartnerProgram"("deletedAt");
CREATE INDEX "PartnerAgreement_partnerId_idx" ON "PartnerAgreement"("partnerId");
CREATE INDEX "PartnerAgreement_status_idx" ON "PartnerAgreement"("status");
CREATE INDEX "PartnerAgreement_endDate_idx" ON "PartnerAgreement"("endDate");
CREATE INDEX "PartnerAgreement_deletedAt_idx" ON "PartnerAgreement"("deletedAt");
CREATE INDEX "PartnerAgreementVersion_agreementId_idx" ON "PartnerAgreementVersion"("agreementId");
CREATE UNIQUE INDEX "PartnerAgreementVersion_agreementId_version_key" ON "PartnerAgreementVersion"("agreementId", "version");

-- AddForeignKey
ALTER TABLE "PartnerProgram" ADD CONSTRAINT "PartnerProgram_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerProgram" ADD CONSTRAINT "PartnerProgram_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerAgreement" ADD CONSTRAINT "PartnerAgreement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAgreement" ADD CONSTRAINT "PartnerAgreement_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerAgreementVersion" ADD CONSTRAINT "PartnerAgreementVersion_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PartnerAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAgreementVersion" ADD CONSTRAINT "PartnerAgreementVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
