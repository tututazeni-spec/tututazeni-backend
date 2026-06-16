-- CreateEnum
CREATE TYPE "CertificateTemplateType" AS ENUM ('COURSE', 'PROGRAM', 'COMPETENCY', 'ATTENDANCE', 'PARTICIPATION', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "BadgeLevel" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT', 'MASTER');

-- CreateTable
CREATE TABLE "CertificateTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CertificateTemplateType" NOT NULL DEFAULT 'COURSE',
    "html" TEXT NOT NULL,
    "cssStyle" TEXT,
    "logoUrl" TEXT,
    "signatureUrl" TEXT,
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validityDays" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedCertificate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "hashCode" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "templateId" TEXT,
    "courseId" TEXT,
    "programId" TEXT,
    "title" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL DEFAULT 'INNOVA',
    "type" "CertificateTemplateType" NOT NULL DEFAULT 'COURSE',
    "score" DOUBLE PRECISION,
    "pdfUrl" TEXT,
    "publicUrl" TEXT,
    "linkedInUrl" TEXT,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "revokedById" INTEGER,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "verifyCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "issuedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IssuedCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalBadge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "skills" TEXT[],
    "level" "BadgeLevel" NOT NULL DEFAULT 'BASIC',
    "issuerName" TEXT NOT NULL DEFAULT 'INNOVA',
    "courseId" TEXT,
    "programId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DigitalBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeIssuance" (
    "id" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "assertionId" TEXT NOT NULL,
    "verifyCode" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "shareUrl" TEXT,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "issuedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BadgeIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CertificateTemplate_type_idx" ON "CertificateTemplate"("type");

-- CreateIndex
CREATE INDEX "CertificateTemplate_isDefault_idx" ON "CertificateTemplate"("isDefault");

-- CreateIndex
CREATE INDEX "CertificateTemplate_isActive_idx" ON "CertificateTemplate"("isActive");

-- CreateIndex
CREATE INDEX "CertificateTemplate_deletedAt_idx" ON "CertificateTemplate"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCertificate_code_key" ON "IssuedCertificate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedCertificate_verificationCode_key" ON "IssuedCertificate"("verificationCode");

-- CreateIndex
CREATE INDEX "IssuedCertificate_userId_idx" ON "IssuedCertificate"("userId");

-- CreateIndex
CREATE INDEX "IssuedCertificate_courseId_idx" ON "IssuedCertificate"("courseId");

-- CreateIndex
CREATE INDEX "IssuedCertificate_type_idx" ON "IssuedCertificate"("type");

-- CreateIndex
CREATE INDEX "IssuedCertificate_isRevoked_idx" ON "IssuedCertificate"("isRevoked");

-- CreateIndex
CREATE INDEX "IssuedCertificate_issuedAt_idx" ON "IssuedCertificate"("issuedAt");

-- CreateIndex
CREATE INDEX "IssuedCertificate_deletedAt_idx" ON "IssuedCertificate"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalBadge_code_key" ON "DigitalBadge"("code");

-- CreateIndex
CREATE INDEX "DigitalBadge_level_idx" ON "DigitalBadge"("level");

-- CreateIndex
CREATE INDEX "DigitalBadge_isActive_idx" ON "DigitalBadge"("isActive");

-- CreateIndex
CREATE INDEX "DigitalBadge_deletedAt_idx" ON "DigitalBadge"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeIssuance_assertionId_key" ON "BadgeIssuance"("assertionId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeIssuance_verifyCode_key" ON "BadgeIssuance"("verifyCode");

-- CreateIndex
CREATE INDEX "BadgeIssuance_userId_idx" ON "BadgeIssuance"("userId");

-- CreateIndex
CREATE INDEX "BadgeIssuance_issuedAt_idx" ON "BadgeIssuance"("issuedAt");

-- CreateIndex
CREATE INDEX "BadgeIssuance_deletedAt_idx" ON "BadgeIssuance"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeIssuance_badgeId_userId_key" ON "BadgeIssuance"("badgeId", "userId");

-- AddForeignKey
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCertificate" ADD CONSTRAINT "IssuedCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCertificate" ADD CONSTRAINT "IssuedCertificate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedCertificate" ADD CONSTRAINT "IssuedCertificate_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalBadge" ADD CONSTRAINT "DigitalBadge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeIssuance" ADD CONSTRAINT "BadgeIssuance_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "DigitalBadge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeIssuance" ADD CONSTRAINT "BadgeIssuance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeIssuance" ADD CONSTRAINT "BadgeIssuance_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
