-- CreateEnum
CREATE TYPE "LibraryItemType" AS ENUM ('PDF', 'EBOOK', 'VIDEO', 'AUDIO', 'PRESENTATION', 'SPREADSHEET', 'DOCUMENT', 'IMAGE', 'LINK', 'SCORM', 'OTHER');

-- CreateEnum
CREATE TYPE "LibraryAction" AS ENUM ('VIEW', 'DOWNLOAD', 'SHARE', 'PRINT');

-- CreateTable
CREATE TABLE "LibraryCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LibraryCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "collectionId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "type" "LibraryItemType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "thumbnailUrl" TEXT,
    "author" TEXT,
    "publisher" TEXT,
    "isbn" TEXT,
    "issn" TEXT,
    "doi" TEXT,
    "year" INTEGER,
    "edition" TEXT,
    "language" TEXT NOT NULL DEFAULT 'pt',
    "pages" INTEGER,
    "tags" TEXT[],
    "categories" TEXT[],
    "keywords" TEXT[],
    "targetRoles" TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "requiresAuth" BOOLEAN NOT NULL DEFAULT true,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "parentId" TEXT,
    "uploadedById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryAccess" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" "LibraryAction" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryRating" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryComment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LibraryComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryCollection_isPublic_idx" ON "LibraryCollection"("isPublic");

-- CreateIndex
CREATE INDEX "LibraryCollection_deletedAt_idx" ON "LibraryCollection"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryItem_code_key" ON "LibraryItem"("code");

-- CreateIndex
CREATE INDEX "LibraryItem_type_idx" ON "LibraryItem"("type");

-- CreateIndex
CREATE INDEX "LibraryItem_collectionId_idx" ON "LibraryItem"("collectionId");

-- CreateIndex
CREATE INDEX "LibraryItem_isPublic_idx" ON "LibraryItem"("isPublic");

-- CreateIndex
CREATE INDEX "LibraryItem_isApproved_idx" ON "LibraryItem"("isApproved");

-- CreateIndex
CREATE INDEX "LibraryItem_uploadedById_idx" ON "LibraryItem"("uploadedById");

-- CreateIndex
CREATE INDEX "LibraryItem_deletedAt_idx" ON "LibraryItem"("deletedAt");

-- CreateIndex
CREATE INDEX "LibraryAccess_itemId_idx" ON "LibraryAccess"("itemId");

-- CreateIndex
CREATE INDEX "LibraryAccess_userId_idx" ON "LibraryAccess"("userId");

-- CreateIndex
CREATE INDEX "LibraryAccess_action_idx" ON "LibraryAccess"("action");

-- CreateIndex
CREATE INDEX "LibraryAccess_createdAt_idx" ON "LibraryAccess"("createdAt");

-- CreateIndex
CREATE INDEX "LibraryRating_itemId_idx" ON "LibraryRating"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryRating_itemId_userId_key" ON "LibraryRating"("itemId", "userId");

-- CreateIndex
CREATE INDEX "LibraryComment_itemId_idx" ON "LibraryComment"("itemId");

-- CreateIndex
CREATE INDEX "LibraryComment_userId_idx" ON "LibraryComment"("userId");

-- CreateIndex
CREATE INDEX "LibraryComment_deletedAt_idx" ON "LibraryComment"("deletedAt");

-- AddForeignKey
ALTER TABLE "LibraryCollection" ADD CONSTRAINT "LibraryCollection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "LibraryCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryAccess" ADD CONSTRAINT "LibraryAccess_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LibraryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryAccess" ADD CONSTRAINT "LibraryAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryRating" ADD CONSTRAINT "LibraryRating_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LibraryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryRating" ADD CONSTRAINT "LibraryRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryComment" ADD CONSTRAINT "LibraryComment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LibraryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryComment" ADD CONSTRAINT "LibraryComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
