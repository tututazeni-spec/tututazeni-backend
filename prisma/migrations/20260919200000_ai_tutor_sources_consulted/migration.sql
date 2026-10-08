-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "sourcesConsulted" TEXT;

-- CreateIndex
CREATE INDEX "AiMessage_createdAt_idx" ON "AiMessage"("createdAt");
