-- CreateEnum
CREATE TYPE "PayrollPaymentStatus" AS ENUM ('PENDING', 'PREPARED', 'SENT_TO_BANK', 'PROCESSED', 'PAID', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "expectedPaymentDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PayrollPayment" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "bankName" TEXT,
    "paymentAccount" TEXT,
    "employeeCount" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "status" "PayrollPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "bankFileGeneratedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "responsibleId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollClosure" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "hrValidatedAt" TIMESTAMP(3),
    "hrValidatedById" INTEGER,
    "financeValidatedAt" TIMESTAMP(3),
    "financeValidatedById" INTEGER,
    "closedAt" TIMESTAMP(3),
    "closedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollPayment_runId_idx" ON "PayrollPayment"("runId");

-- CreateIndex
CREATE INDEX "PayrollPayment_status_idx" ON "PayrollPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollClosure_runId_key" ON "PayrollClosure"("runId");

-- AddForeignKey
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollClosure" ADD CONSTRAINT "PayrollClosure_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

