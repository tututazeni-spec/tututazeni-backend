-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PayrollRunStatus" ADD VALUE 'SIMULATED';
ALTER TYPE "PayrollRunStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "errorCount" INTEGER,
ADD COLUMN     "exceptionsCount" INTEGER,
ADD COLUMN     "payGroup" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedById" INTEGER,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "scope" JSONB,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" INTEGER,
ADD COLUMN     "taxYear" INTEGER,
ADD COLUMN     "totalDeductions" DOUBLE PRECISION,
ADD COLUMN     "totalEmployerCost" DOUBLE PRECISION,
ADD COLUMN     "totalNet" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "calcInputs" JSONB,
ADD COLUMN     "calcSnapshot" JSONB,
ADD COLUMN     "exceptions" JSONB,
ADD COLUMN     "hasExceptions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PayslipItem" ADD COLUMN     "isEmployerCost" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Payslip_runId_hasExceptions_idx" ON "Payslip"("runId", "hasExceptions");

