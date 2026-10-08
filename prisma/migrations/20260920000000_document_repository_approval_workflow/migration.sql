
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocCategoryType" ADD VALUE 'CIRCULAR';
ALTER TYPE "DocCategoryType" ADD VALUE 'ORDEM_SERVICO';
ALTER TYPE "DocCategoryType" ADD VALUE 'LEGISLACAO';
ALTER TYPE "DocCategoryType" ADD VALUE 'INSTRUCAO_TRABALHO';
ALTER TYPE "DocCategoryType" ADD VALUE 'MODELO';
ALTER TYPE "DocCategoryType" ADD VALUE 'CODIGO';
ALTER TYPE "DocCategoryType" ADD VALUE 'DIRETIVA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocStatus" ADD VALUE 'EM_REVISAO';
ALTER TYPE "DocStatus" ADD VALUE 'PENDENTE_APROVACAO';
ALTER TYPE "DocStatus" ADD VALUE 'APROVADO';
ALTER TYPE "DocStatus" ADD VALUE 'SUSPENSO';
ALTER TYPE "DocStatus" ADD VALUE 'SUBSTITUIDO';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approverId" INTEGER,
ADD COLUMN     "documentCode" TEXT,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "effectiveAt" TIMESTAMP(3),
ADD COLUMN     "elaboratedById" INTEGER,
ADD COLUMN     "readDeadlineDays" INTEGER,
ADD COLUMN     "relatedDocumentId" INTEGER,
ADD COLUMN     "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresReadConfirmation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewAt" TIMESTAMP(3),
ADD COLUMN     "reviewPeriodicityMonths" INTEGER,
ADD COLUMN     "supersedesId" INTEGER,
ADD COLUMN     "targetAudience" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "DocReadConfirmation" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocReadConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocReadConfirmation_userId_idx" ON "DocReadConfirmation"("userId");

-- CreateIndex
CREATE INDEX "DocReadConfirmation_documentId_idx" ON "DocReadConfirmation"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocReadConfirmation_documentId_userId_key" ON "DocReadConfirmation"("documentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_documentCode_key" ON "Document"("documentCode");

-- CreateIndex
CREATE INDEX "Document_requiresReadConfirmation_status_idx" ON "Document"("requiresReadConfirmation", "status");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_elaboratedById_fkey" FOREIGN KEY ("elaboratedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_relatedDocumentId_fkey" FOREIGN KEY ("relatedDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocReadConfirmation" ADD CONSTRAINT "DocReadConfirmation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocReadConfirmation" ADD CONSTRAINT "DocReadConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

