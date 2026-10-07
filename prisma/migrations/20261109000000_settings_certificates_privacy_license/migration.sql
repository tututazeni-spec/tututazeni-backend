
-- CreateEnum
CREATE TYPE "DsrType" AS ENUM ('ACCESS', 'RECTIFICATION', 'ERASURE', 'PORTABILITY', 'OBJECTION');

-- CreateEnum
CREATE TYPE "DsrStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- AlterTable
ALTER TABLE "tenant_configs" ADD COLUMN     "certificateSettingsJson" TEXT,
ADD COLUMN     "moduleFlagsJson" TEXT,
ADD COLUMN     "privacySettingsJson" TEXT;

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" INTEGER,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "type" "DsrType" NOT NULL,
    "status" "DsrStatus" NOT NULL DEFAULT 'PENDING',
    "details" TEXT,
    "resolutionNote" TEXT,
    "handledById" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_subject_requests_tenantId_idx" ON "data_subject_requests"("tenantId");

-- CreateIndex
CREATE INDEX "data_subject_requests_status_idx" ON "data_subject_requests"("status");

-- CreateIndex
CREATE INDEX "data_subject_requests_userId_idx" ON "data_subject_requests"("userId");

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

