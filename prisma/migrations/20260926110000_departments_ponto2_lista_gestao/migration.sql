-- AlterEnum
ALTER TYPE "DepartmentStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "acronym" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closureReason" TEXT;

