-- CreateTable
CREATE TABLE "ApiIntegrationLog" (
    "id" SERIAL NOT NULL,
    "integrationId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiIntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiIntegrationLog_integrationId_idx" ON "ApiIntegrationLog"("integrationId");
