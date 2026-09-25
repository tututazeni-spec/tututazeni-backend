-- CreateEnum
CREATE TYPE "Eval360QuestionnaireStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Eval360Cycle" ADD COLUMN     "questionnaireId" TEXT;

-- AlterTable
ALTER TABLE "Eval360CycleCompetency" ADD COLUMN     "expectedLevel" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Eval360Questionnaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "scaleMin" INTEGER NOT NULL DEFAULT 1,
    "scaleMax" INTEGER NOT NULL DEFAULT 5,
    "scaleLabels" TEXT,
    "status" "Eval360QuestionnaireStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Eval360Questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Eval360QuestionnaireCompetency" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Eval360QuestionnaireCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Eval360QuestionnaireQuestion" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "competencyId" INTEGER,
    "text" TEXT NOT NULL,
    "type" "Eval360QuestionType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "allowComment" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "scaleMin" INTEGER,
    "scaleMax" INTEGER,
    "scaleLabels" TEXT,
    "options" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Eval360QuestionnaireQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Eval360Questionnaire_code_key" ON "Eval360Questionnaire"("code");

-- CreateIndex
CREATE INDEX "Eval360Questionnaire_tenantId_idx" ON "Eval360Questionnaire"("tenantId");

-- CreateIndex
CREATE INDEX "Eval360Questionnaire_status_idx" ON "Eval360Questionnaire"("status");

-- CreateIndex
CREATE INDEX "Eval360QuestionnaireCompetency_questionnaireId_idx" ON "Eval360QuestionnaireCompetency"("questionnaireId");

-- CreateIndex
CREATE UNIQUE INDEX "Eval360QuestionnaireCompetency_questionnaireId_competencyId_key" ON "Eval360QuestionnaireCompetency"("questionnaireId", "competencyId");

-- CreateIndex
CREATE INDEX "Eval360QuestionnaireQuestion_questionnaireId_idx" ON "Eval360QuestionnaireQuestion"("questionnaireId");

-- CreateIndex
CREATE INDEX "Eval360QuestionnaireQuestion_competencyId_idx" ON "Eval360QuestionnaireQuestion"("competencyId");

-- CreateIndex
CREATE INDEX "Eval360Cycle_questionnaireId_idx" ON "Eval360Cycle"("questionnaireId");

-- AddForeignKey
ALTER TABLE "Eval360Cycle" ADD CONSTRAINT "Eval360Cycle_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Eval360Questionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eval360QuestionnaireCompetency" ADD CONSTRAINT "Eval360QuestionnaireCompetency_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Eval360Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eval360QuestionnaireCompetency" ADD CONSTRAINT "Eval360QuestionnaireCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eval360QuestionnaireQuestion" ADD CONSTRAINT "Eval360QuestionnaireQuestion_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Eval360Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eval360QuestionnaireQuestion" ADD CONSTRAINT "Eval360QuestionnaireQuestion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

