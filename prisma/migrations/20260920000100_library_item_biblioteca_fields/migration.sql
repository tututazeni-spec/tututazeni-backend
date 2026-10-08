
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LibraryItemType" ADD VALUE 'ARTIGO';
ALTER TYPE "LibraryItemType" ADD VALUE 'INFOGRAFICO';
ALTER TYPE "LibraryItemType" ADD VALUE 'GUIA';
ALTER TYPE "LibraryItemType" ADD VALUE 'MATERIAL_FORMACAO';
ALTER TYPE "LibraryItemType" ADD VALUE 'FAQ';

-- AlterTable
ALTER TABLE "LibraryItem" ADD COLUMN     "allowDownload" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowShare" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "approverId" INTEGER,
ADD COLUMN     "departmentId" INTEGER,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitId" INTEGER;

-- CreateIndex
CREATE INDEX "LibraryItem_departmentId_idx" ON "LibraryItem"("departmentId");

-- CreateIndex
CREATE INDEX "LibraryItem_mandatory_idx" ON "LibraryItem"("mandatory");

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

