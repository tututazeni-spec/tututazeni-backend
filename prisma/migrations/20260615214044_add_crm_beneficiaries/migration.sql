-- CreateEnum
CREATE TYPE "BeneficiaryType" AS ENUM ('INDIVIDUAL', 'FAMILY', 'INSTITUTION', 'COMMUNITY', 'GROUP');

-- CreateEnum
CREATE TYPE "BeneficiaryStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'FORMER', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AngolaProvince" AS ENUM ('BENGO', 'BENGUELA', 'BIE', 'CABINDA', 'CUANDO_CUBANGO', 'CUANZA_NORTE', 'CUANZA_SUL', 'CUNENE', 'HUAMBO', 'HUILA', 'LUANDA', 'LUNDA_NORTE', 'LUNDA_SUL', 'MALANJE', 'MOXICO', 'NAMIBE', 'UIGE', 'ZAIRE');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('EMAIL', 'CALL', 'MEETING', 'VISIT', 'EVENT', 'NOTE', 'TASK');

-- CreateEnum
CREATE TYPE "NeedPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NeedStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "type" "BeneficiaryType" NOT NULL,
    "category" TEXT,
    "gender" "Gender",
    "birthDate" TIMESTAMP(3),
    "nationality" TEXT,
    "nif" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" "AngolaProvince",
    "country" TEXT NOT NULL DEFAULT 'Angola',
    "status" "BeneficiaryStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT,
    "tags" TEXT[],
    "segment" TEXT,
    "assignedToId" INTEGER,
    "totalBenefits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "notes" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "satisfactionAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryInteraction" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "InteractionType" NOT NULL,
    "channel" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMin" INTEGER,
    "outcome" TEXT,
    "nextAction" TEXT,
    "nextActionDate" TIMESTAMP(3),
    "satisfaction" INTEGER,
    "attachments" TEXT[],
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BeneficiaryInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryDocument" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BeneficiaryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryNeed" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "NeedPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "NeedStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeneficiaryNeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_code_key" ON "Beneficiary"("code");

-- CreateIndex
CREATE INDEX "Beneficiary_type_idx" ON "Beneficiary"("type");

-- CreateIndex
CREATE INDEX "Beneficiary_status_idx" ON "Beneficiary"("status");

-- CreateIndex
CREATE INDEX "Beneficiary_province_idx" ON "Beneficiary"("province");

-- CreateIndex
CREATE INDEX "Beneficiary_assignedToId_idx" ON "Beneficiary"("assignedToId");

-- CreateIndex
CREATE INDEX "Beneficiary_nextFollowUpAt_idx" ON "Beneficiary"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Beneficiary_createdById_idx" ON "Beneficiary"("createdById");

-- CreateIndex
CREATE INDEX "Beneficiary_deletedAt_idx" ON "Beneficiary"("deletedAt");

-- CreateIndex
CREATE INDEX "BeneficiaryInteraction_beneficiaryId_idx" ON "BeneficiaryInteraction"("beneficiaryId");

-- CreateIndex
CREATE INDEX "BeneficiaryInteraction_type_idx" ON "BeneficiaryInteraction"("type");

-- CreateIndex
CREATE INDEX "BeneficiaryInteraction_date_idx" ON "BeneficiaryInteraction"("date");

-- CreateIndex
CREATE INDEX "BeneficiaryInteraction_deletedAt_idx" ON "BeneficiaryInteraction"("deletedAt");

-- CreateIndex
CREATE INDEX "BeneficiaryDocument_beneficiaryId_idx" ON "BeneficiaryDocument"("beneficiaryId");

-- CreateIndex
CREATE INDEX "BeneficiaryDocument_expiresAt_idx" ON "BeneficiaryDocument"("expiresAt");

-- CreateIndex
CREATE INDEX "BeneficiaryDocument_deletedAt_idx" ON "BeneficiaryDocument"("deletedAt");

-- CreateIndex
CREATE INDEX "BeneficiaryNeed_beneficiaryId_idx" ON "BeneficiaryNeed"("beneficiaryId");

-- CreateIndex
CREATE INDEX "BeneficiaryNeed_status_idx" ON "BeneficiaryNeed"("status");

-- CreateIndex
CREATE INDEX "BeneficiaryNeed_priority_idx" ON "BeneficiaryNeed"("priority");

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryInteraction" ADD CONSTRAINT "BeneficiaryInteraction_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryInteraction" ADD CONSTRAINT "BeneficiaryInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryDocument" ADD CONSTRAINT "BeneficiaryDocument_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryDocument" ADD CONSTRAINT "BeneficiaryDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryNeed" ADD CONSTRAINT "BeneficiaryNeed_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
