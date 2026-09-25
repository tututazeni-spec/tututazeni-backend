-- AlterTable
ALTER TABLE "ProficiencyLevel" ADD COLUMN     "autonomy" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "evaluationCriteria" TEXT,
ADD COLUMN     "expectedBehaviors" TEXT,
ADD COLUMN     "knowledgeDemonstrated" TEXT,
ADD COLUMN     "maxScore" INTEGER,
ADD COLUMN     "minScore" INTEGER,
ADD COLUMN     "observableEvidence" TEXT,
ADD COLUMN     "status" "CompetencyStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "taskComplexity" TEXT;

-- CreateTable
CREATE TABLE "CompetencyModel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "objective" TEXT,
    "type" TEXT,
    "departmentId" INTEGER,
    "positionFamily" TEXT,
    "hierarchyLevel" "SeniorityLevel",
    "status" "CompetencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "ownerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyModelItem" (
    "id" SERIAL NOT NULL,
    "modelId" INTEGER NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "expectedLevel" INTEGER NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompetencyModelItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyModel_code_key" ON "CompetencyModel"("code");

-- CreateIndex
CREATE INDEX "CompetencyModel_departmentId_idx" ON "CompetencyModel"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyModelItem_modelId_competencyId_key" ON "CompetencyModelItem"("modelId", "competencyId");

-- AddForeignKey
ALTER TABLE "CompetencyModel" ADD CONSTRAINT "CompetencyModel_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyModel" ADD CONSTRAINT "CompetencyModel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyModelItem" ADD CONSTRAINT "CompetencyModelItem_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "CompetencyModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyModelItem" ADD CONSTRAINT "CompetencyModelItem_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

