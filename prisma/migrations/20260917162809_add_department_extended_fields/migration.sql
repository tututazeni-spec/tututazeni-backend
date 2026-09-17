-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "directManagerId" INTEGER,
ADD COLUMN     "functionalArea" TEXT,
ADD COLUMN     "institutionalEmail" TEXT,
ADD COLUMN     "isStrategic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "mainResponsibilities" TEXT,
ADD COLUMN     "maxEmployees" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "operationalStartDate" TIMESTAMP(3),
ADD COLUMN     "phoneExtension" TEXT,
ADD COLUMN     "physicalLocation" TEXT;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_directManagerId_fkey" FOREIGN KEY ("directManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
