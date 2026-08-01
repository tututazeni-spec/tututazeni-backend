-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "requestSignature" BOOLEAN NOT NULL DEFAULT false;
