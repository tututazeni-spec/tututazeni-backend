-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hrResponsibleId" INTEGER,
ADD COLUMN     "mentorId" INTEGER;

-- CreateIndex
CREATE INDEX "User_mentorId_idx" ON "User"("mentorId");

-- CreateIndex
CREATE INDEX "User_hrResponsibleId_idx" ON "User"("hrResponsibleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hrResponsibleId_fkey" FOREIGN KEY ("hrResponsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
