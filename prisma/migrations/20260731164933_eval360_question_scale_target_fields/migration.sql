-- AlterTable
ALTER TABLE "Eval360Question" ADD COLUMN     "options" TEXT,
ADD COLUMN     "scaleLabels" TEXT,
ADD COLUMN     "scaleMax" INTEGER,
ADD COLUMN     "scaleMin" INTEGER,
ADD COLUMN     "targetLevels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetPositions" TEXT[] DEFAULT ARRAY[]::TEXT[];
