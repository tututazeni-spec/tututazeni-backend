-- CreateEnum
CREATE TYPE "DeductionTypeStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DeductionCalcMethod" AS ENUM ('PERCENT', 'FIXED');

-- CreateTable
CREATE TABLE "DeductionType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "calcMethod" "DeductionCalcMethod" NOT NULL DEFAULT 'PERCENT',
    "value" DOUBLE PRECISION NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "status" "DeductionTypeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" INTEGER,
    "publishedById" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeductionType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeductionType_status_idx" ON "DeductionType"("status");
