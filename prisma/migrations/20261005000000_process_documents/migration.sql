-- CreateTable
CREATE TABLE "ProcessDocument" (
    "id" SERIAL NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "name" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'ATTACHED',
    "documentId" INTEGER,
    "libraryItemId" INTEGER,
    "generatedContent" TEXT,
    "templateId" INTEGER,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "authorId" INTEGER,
    "authorName" TEXT,
    "issuedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "approverId" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "decidedById" INTEGER,
    "decisionNote" TEXT,
    "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
    "viewRoles" TEXT[],
    "viewerIds" INTEGER[],
    "signatureRequired" BOOLEAN NOT NULL DEFAULT false,
    "signatureStatus" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedById" INTEGER,
    "requestedById" INTEGER,
    "requestedFromId" INTEGER,
    "requestedAt" TIMESTAMP(3),
    "requestNote" TEXT,
    "addedById" INTEGER NOT NULL,
    "retentionUntil" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessDocumentVersion" (
    "id" SERIAL NOT NULL,
    "processDocumentId" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "documentId" INTEGER,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "note" TEXT,
    "validUntil" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessDocument_instanceId_stepId_idx" ON "ProcessDocument"("instanceId", "stepId");

-- CreateIndex
CREATE INDEX "ProcessDocument_validationStatus_idx" ON "ProcessDocument"("validationStatus");

-- CreateIndex
CREATE INDEX "ProcessDocument_validUntil_idx" ON "ProcessDocument"("validUntil");

-- CreateIndex
CREATE INDEX "ProcessDocument_documentId_idx" ON "ProcessDocument"("documentId");

-- CreateIndex
CREATE INDEX "ProcessDocument_requestedFromId_idx" ON "ProcessDocument"("requestedFromId");

-- CreateIndex
CREATE INDEX "ProcessDocumentVersion_processDocumentId_idx" ON "ProcessDocumentVersion"("processDocumentId");

-- AddForeignKey
ALTER TABLE "ProcessDocument" ADD CONSTRAINT "ProcessDocument_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ProcessInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocument" ADD CONSTRAINT "ProcessDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocumentVersion" ADD CONSTRAINT "ProcessDocumentVersion_processDocumentId_fkey" FOREIGN KEY ("processDocumentId") REFERENCES "ProcessDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

