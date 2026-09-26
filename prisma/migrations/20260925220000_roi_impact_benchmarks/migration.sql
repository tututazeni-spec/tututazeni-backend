-- CreateEnum
CREATE TYPE "BenchmarkType" AS ENUM ('INTERNO', 'EXTERNO');

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BenchmarkType" NOT NULL,
    "source" TEXT NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "kpiDefinitionId" INTEGER,
    "indicatorName" TEXT,
    "observations" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Benchmark_type_idx" ON "Benchmark"("type");

-- CreateIndex
CREATE INDEX "Benchmark_kpiDefinitionId_idx" ON "Benchmark"("kpiDefinitionId");

-- CreateIndex
CREATE INDEX "Benchmark_referenceYear_idx" ON "Benchmark"("referenceYear");

-- AddForeignKey
ALTER TABLE "Benchmark" ADD CONSTRAINT "Benchmark_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

