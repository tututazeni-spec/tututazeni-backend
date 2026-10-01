-- CreateEnum
CREATE TYPE "DepartmentVisibility" AS ENUM ('PUBLIC', 'DEPARTMENT_ONLY', 'RESTRICTED');

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "approverIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "businessArea" TEXT,
ADD COLUMN     "dataVisibility" "DepartmentVisibility" NOT NULL DEFAULT 'DEPARTMENT_ONLY',
ADD COLUMN     "expectedEmployees" INTEGER,
ADD COLUMN     "institutionalContact" TEXT,
ADD COLUMN     "processOwnerDepartmentId" INTEGER;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_processOwnerDepartmentId_fkey" FOREIGN KEY ("processOwnerDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

