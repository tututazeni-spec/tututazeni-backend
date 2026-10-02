-- AlterTable
ALTER TABLE "DepartmentHeadHistory" ADD COLUMN     "changedById" INTEGER,
ADD COLUMN     "reason" TEXT;

-- AddForeignKey
ALTER TABLE "DepartmentHeadHistory" ADD CONSTRAINT "DepartmentHeadHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
