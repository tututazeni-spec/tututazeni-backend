-- CreateEnum
CREATE TYPE "CorrelationType" AS ENUM ('HORAS_FORMACAO_DESEMPENHO', 'COMPETENCIAS_PRODUTIVIDADE', 'PDI_RETENCAO', 'INVESTIMENTO_ROTATIVIDADE', 'ONBOARDING_TEMPO_PRODUTIVIDADE', 'MENTORIA_PROGRESSAO_CARREIRA', 'LIDERANCA_ENGAGEMENT_EQUIPA');

-- CreateTable
CREATE TABLE "Correlation" (
    "id" SERIAL NOT NULL,
    "type" "CorrelationType" NOT NULL,
    "departmentId" INTEGER,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "xLabel" TEXT NOT NULL,
    "yLabel" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "coefficient" DOUBLE PRECISION,
    "pValue" DOUBLE PRECISION,
    "significant" BOOLEAN,
    "dataPoints" JSONB NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correlation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Correlation_type_idx" ON "Correlation"("type");

-- CreateIndex
CREATE INDEX "Correlation_departmentId_idx" ON "Correlation"("departmentId");

-- AddForeignKey
ALTER TABLE "Correlation" ADD CONSTRAINT "Correlation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correlation" ADD CONSTRAINT "Correlation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

