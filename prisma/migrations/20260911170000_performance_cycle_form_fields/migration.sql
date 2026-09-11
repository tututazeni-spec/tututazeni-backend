-- AlterTable
ALTER TABLE "PerformanceCycle" ADD COLUMN     "code" TEXT;
ALTER TABLE "PerformanceCycle" ADD COLUMN     "description" TEXT;
ALTER TABLE "PerformanceCycle" ADD COLUMN     "targetDepartmentIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "PerformanceCycle" ADD COLUMN     "ownerId" INTEGER;
ALTER TABLE "PerformanceCycle" ADD COLUMN     "rules" TEXT;

-- AlterTable
ALTER TABLE "PerformanceReview" ADD COLUMN     "evidenceUrls" TEXT;
ALTER TABLE "PerformanceReview" ADD COLUMN     "acceptedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PerformanceCycle_ownerId_idx" ON "PerformanceCycle"("ownerId");

-- AddForeignKey
ALTER TABLE "PerformanceCycle" ADD CONSTRAINT "PerformanceCycle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
