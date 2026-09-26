-- CreateEnum
CREATE TYPE "CostSubCategory" AS ENUM ('FORMADOR_CONSULTOR', 'MATERIAL_DIDATICO', 'PLATAFORMA_LICENCAS', 'SALA_LOGISTICA', 'DESLOCACAO_ALOJAMENTO', 'CERTIFICACAO', 'HORAS_TRABALHO_PERDIDAS', 'SUBSTITUICAO_COBERTURA', 'COORDENACAO_GESTAO_RH', 'PRODUCAO_NAO_REALIZADA', 'ATRASO_PROJETOS');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('DIRETO', 'INDIRETO', 'OPORTUNIDADE');

-- CreateEnum
CREATE TYPE "KpiCategory" AS ENUM ('PRODUTIVIDADE', 'QUALIDADE', 'PESSOAS', 'FINANCEIRO', 'CLIENTE', 'SEGURANCA', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "KpiFrequency" AS ENUM ('DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "KpiDefinitionStatus" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" SERIAL NOT NULL,
    "initiativeType" "RoiInitiativeType" NOT NULL,
    "initiativeId" INTEGER,
    "category" "CostCategory" NOT NULL,
    "subCategory" "CostSubCategory" NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "incurredAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiDefinition" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "KpiCategory" NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "formula" TEXT,
    "dataSource" TEXT,
    "frequency" "KpiFrequency" NOT NULL,
    "targetValue" DOUBLE PRECISION,
    "benchmarkNote" TEXT,
    "responsibleId" INTEGER,
    "status" "KpiDefinitionStatus" NOT NULL DEFAULT 'ACTIVO',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostEntry_initiativeType_initiativeId_idx" ON "CostEntry"("initiativeType", "initiativeId");

-- CreateIndex
CREATE INDEX "CostEntry_category_idx" ON "CostEntry"("category");

-- CreateIndex
CREATE INDEX "CostEntry_subCategory_idx" ON "CostEntry"("subCategory");

-- CreateIndex
CREATE UNIQUE INDEX "KpiDefinition_code_key" ON "KpiDefinition"("code");

-- CreateIndex
CREATE INDEX "KpiDefinition_category_idx" ON "KpiDefinition"("category");

-- CreateIndex
CREATE INDEX "KpiDefinition_status_idx" ON "KpiDefinition"("status");

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDefinition" ADD CONSTRAINT "KpiDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

