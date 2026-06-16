-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('TECHNOLOGY', 'CONTENT', 'TRAINING', 'FUNDING', 'INSTITUTIONAL', 'COMMERCIAL', 'MEDIA', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerTier" AS ENUM ('PLATINUM', 'GOLD', 'SILVER', 'STANDARD');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'NEGOTIATION', 'SUSPENDED', 'FORMER');

-- CreateEnum
CREATE TYPE "PartnerInteractionType" AS ENUM ('EMAIL', 'CALL', 'MEETING', 'VISIT', 'EVENT', 'NOTE', 'REVIEW');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "type" "PartnerType" NOT NULL,
    "tier" "PartnerTier" NOT NULL DEFAULT 'STANDARD',
    "contactName" TEXT,
    "contactTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "website" TEXT,
    "linkedin" TEXT,
    "nif" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Angola',
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "contractUrl" TEXT,
    "annualValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "revenueSharing" DOUBLE PRECISION,
    "services" TEXT[],
    "tags" TEXT[],
    "kpis" TEXT,
    "rating" DOUBLE PRECISION,
    "assignedToId" INTEGER,
    "notes" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "satisfactionAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerInteraction" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "PartnerInteractionType" NOT NULL,
    "channel" TEXT,
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

    CONSTRAINT "PartnerInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerMilestone" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Partner_code_key" ON "Partner"("code");

-- CreateIndex
CREATE INDEX "Partner_type_idx" ON "Partner"("type");

-- CreateIndex
CREATE INDEX "Partner_tier_idx" ON "Partner"("tier");

-- CreateIndex
CREATE INDEX "Partner_status_idx" ON "Partner"("status");

-- CreateIndex
CREATE INDEX "Partner_assignedToId_idx" ON "Partner"("assignedToId");

-- CreateIndex
CREATE INDEX "Partner_contractEnd_idx" ON "Partner"("contractEnd");

-- CreateIndex
CREATE INDEX "Partner_nextReviewAt_idx" ON "Partner"("nextReviewAt");

-- CreateIndex
CREATE INDEX "Partner_deletedAt_idx" ON "Partner"("deletedAt");

-- CreateIndex
CREATE INDEX "PartnerInteraction_partnerId_idx" ON "PartnerInteraction"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerInteraction_type_idx" ON "PartnerInteraction"("type");

-- CreateIndex
CREATE INDEX "PartnerInteraction_date_idx" ON "PartnerInteraction"("date");

-- CreateIndex
CREATE INDEX "PartnerInteraction_deletedAt_idx" ON "PartnerInteraction"("deletedAt");

-- CreateIndex
CREATE INDEX "PartnerMilestone_partnerId_idx" ON "PartnerMilestone"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerMilestone_status_idx" ON "PartnerMilestone"("status");

-- CreateIndex
CREATE INDEX "PartnerMilestone_dueDate_idx" ON "PartnerMilestone"("dueDate");

-- CreateIndex
CREATE INDEX "PartnerMilestone_deletedAt_idx" ON "PartnerMilestone"("deletedAt");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerInteraction" ADD CONSTRAINT "PartnerInteraction_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerInteraction" ADD CONSTRAINT "PartnerInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerMilestone" ADD CONSTRAINT "PartnerMilestone_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerMilestone" ADD CONSTRAINT "PartnerMilestone_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
