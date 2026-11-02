-- AlterTable
ALTER TABLE "AvatarTrainingProgram" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" INTEGER;

-- CreateIndex
CREATE INDEX "AvatarTrainingProgram_deletedAt_idx" ON "AvatarTrainingProgram"("deletedAt");
