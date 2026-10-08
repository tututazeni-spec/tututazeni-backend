-- CreateEnum
CREATE TYPE "RoiInitiativeType" AS ENUM ('CURSO', 'FORMACAO', 'PERCURSO', 'PDI', 'MENTORIA', 'EVENTO');

-- CreateEnum
CREATE TYPE "RoiAnalysisStatus" AS ENUM ('EM_PREPARACAO', 'EM_MEDICAO', 'DADOS_INSUFICIENTES', 'CALCULADO', 'VALIDADO', 'REVISTO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "RoiBenefitType" AS ENUM ('PRODUTIVIDADE', 'QUALIDADE', 'REDUCAO_ERROS', 'REDUCAO_ROTATIVIDADE', 'REDUCAO_ACIDENTES', 'AUMENTO_VENDAS', 'REDUCAO_TEMPO_CICLO', 'SATISFACAO_CLIENTE', 'OUTRO');

-- CreateTable
CREATE TABLE "RoiAnalysis" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "initiativeType" "RoiInitiativeType" NOT NULL,
    "initiativeId" INTEGER,
    "departmentId" INTEGER,
    "unit" TEXT,
    "responsibleId" INTEGER,
    "referencePeriodStart" TIMESTAMP(3),
    "referencePeriodEnd" TIMESTAMP(3),
    "measurementPeriodDays" INTEGER,
    "costDirect" DOUBLE PRECISION,
    "costIndirect" DOUBLE PRECISION,
    "costOpportunity" DOUBLE PRECISION,
    "benefitType" "RoiBenefitType",
    "benefitIndicator" TEXT,
    "benefitBaselineValue" DOUBLE PRECISION,
    "benefitExpectedValue" DOUBLE PRECISION,
    "benefitConversionNote" TEXT,
    "benefitValidatorId" INTEGER,
    "evaluationModelUsed" TEXT,
    "isolationFactor" DOUBLE PRECISION,
    "dataSource" TEXT,
    "hasControlGroup" BOOLEAN NOT NULL DEFAULT false,
    "assumptions" TEXT,
    "status" "RoiAnalysisStatus" NOT NULL DEFAULT 'EM_PREPARACAO',
    "computedBenefit" DOUBLE PRECISION,
    "computedCost" DOUBLE PRECISION,
    "roiPercent" DOUBLE PRECISION,
    "bcr" DOUBLE PRECISION,
    "paybackMonths" DOUBLE PRECISION,
    "confidenceLevel" TEXT,
    "observations" TEXT,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoiAnalysis_initiativeType_initiativeId_idx" ON "RoiAnalysis"("initiativeType", "initiativeId");

-- CreateIndex
CREATE INDEX "RoiAnalysis_departmentId_idx" ON "RoiAnalysis"("departmentId");

-- CreateIndex
CREATE INDEX "RoiAnalysis_status_idx" ON "RoiAnalysis"("status");

-- AddForeignKey
ALTER TABLE "RoiAnalysis" ADD CONSTRAINT "RoiAnalysis_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoiAnalysis" ADD CONSTRAINT "RoiAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

