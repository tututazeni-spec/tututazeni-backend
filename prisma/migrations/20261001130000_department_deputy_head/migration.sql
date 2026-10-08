-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "deputyHeadId" INTEGER;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_deputyHeadId_fkey" FOREIGN KEY ("deputyHeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
