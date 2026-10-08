-- AlterEnum
ALTER TYPE "CompetencyCategory" ADD VALUE 'FUNCTIONAL';

-- AlterEnum
ALTER TYPE "CompetencyStatus" ADD VALUE 'IN_REVIEW';

-- AlterTable
ALTER TABLE "Competency" ADD COLUMN     "code" TEXT,
ADD COLUMN     "family" TEXT,
ADD COLUMN     "isAssessable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isCritical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDevelopable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isMandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isStrategic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "ownerId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Competency_code_key" ON "Competency"("code");

-- AddForeignKey
ALTER TABLE "Competency" ADD CONSTRAINT "Competency_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

