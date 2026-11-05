ALTER TABLE "LiveClass" ADD COLUMN "materialLibraryItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LiveClassSession" ADD COLUMN "materialLibraryItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
