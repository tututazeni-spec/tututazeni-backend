-- CreateEnum
CREATE TYPE "ImpactSubjectType" AS ENUM ('COLABORADOR', 'EQUIPA', 'DEPARTAMENTO');

-- CreateEnum
CREATE TYPE "ImpactCategory" AS ENUM ('PRODUTIVIDADE', 'QUALIDADE', 'ROTATIVIDADE', 'ABSENTISMO', 'SEGURANCA', 'VENDAS_RECEITA', 'SATISFACAO_CLIENTE', 'SATISFACAO_COLABORADOR', 'TEMPO_RESPOSTA', 'CUMPRIMENTO_SLA', 'COMPLIANCE', 'CUSTO_EVITADO');

-- CreateEnum
CREATE TYPE "RoiModelStatus" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateTable
CREATE TABLE "ImpactRecord" (
    "id" SERIAL NOT NULL,
    "subjectType" "ImpactSubjectType" NOT NULL,
    "userId" INTEGER,
    "team" TEXT,
    "departmentId" INTEGER,
    "initiativeType" "RoiInitiativeType" NOT NULL,
    "initiativeId" INTEGER,
    "category" "ImpactCategory" NOT NULL,
    "indicatorName" TEXT NOT NULL,
    "valueBefore" DOUBLE PRECISION,
    "valueAfter" DOUBLE PRECISION,
    "observationPeriodStart" TIMESTAMP(3),
    "observationPeriodEnd" TIMESTAMP(3),
    "attributionPercent" DOUBLE PRECISION,
    "dataSource" TEXT,
    "validatedById" INTEGER,
    "validatedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpactRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoiEvaluationModel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "levels" JSONB NOT NULL,
    "applicability" JSONB,
    "status" "RoiModelStatus" NOT NULL DEFAULT 'ACTIVO',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoiEvaluationModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImpactRecord_initiativeType_initiativeId_idx" ON "ImpactRecord"("initiativeType", "initiativeId");

-- CreateIndex
CREATE INDEX "ImpactRecord_departmentId_idx" ON "ImpactRecord"("departmentId");

-- CreateIndex
CREATE INDEX "ImpactRecord_category_idx" ON "ImpactRecord"("category");

-- CreateIndex
CREATE INDEX "ImpactRecord_userId_idx" ON "ImpactRecord"("userId");

-- CreateIndex
CREATE INDEX "RoiEvaluationModel_status_idx" ON "RoiEvaluationModel"("status");

-- AddForeignKey
ALTER TABLE "ImpactRecord" ADD CONSTRAINT "ImpactRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactRecord" ADD CONSTRAINT "ImpactRecord_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactRecord" ADD CONSTRAINT "ImpactRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoiEvaluationModel" ADD CONSTRAINT "RoiEvaluationModel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

