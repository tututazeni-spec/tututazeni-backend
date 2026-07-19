-- AlterTable
ALTER TABLE "Competency" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isGlobal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scaleMax" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "scaleMin" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tenantId" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'BEHAVIORAL';

-- CreateTable
CREATE TABLE "CompetencyIndicator" (
    "id" TEXT NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "examples" TEXT,

    CONSTRAINT "CompetencyIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetencyIndicator_competencyId_idx" ON "CompetencyIndicator"("competencyId");

-- CreateIndex
CREATE INDEX "Competency_isActive_idx" ON "Competency"("isActive");

-- AddForeignKey
ALTER TABLE "CompetencyIndicator" ADD CONSTRAINT "CompetencyIndicator_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
