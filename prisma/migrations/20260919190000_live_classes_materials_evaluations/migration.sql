-- AlterTable
ALTER TABLE "LiveClassSession" ADD COLUMN     "materialDocumentIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "PostClassResponse" ADD COLUMN     "applicabilityRating" INTEGER,
ADD COLUMN     "contentRating" INTEGER,
ADD COLUMN     "instructorRating" INTEGER,
ADD COLUMN     "nps" INTEGER,
ADD COLUMN     "organizationRating" INTEGER;
