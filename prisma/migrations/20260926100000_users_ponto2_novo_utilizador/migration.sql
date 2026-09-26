-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "learningProfile" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "contentAccessLevel" TEXT,
ADD COLUMN     "contractType" "ContractType",
ADD COLUMN     "costCenter" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "identificationNumber" TEXT,
ADD COLUMN     "isInstructor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "jobFunction" TEXT,
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "professionalCategory" TEXT,
ADD COLUMN     "systemFunction" TEXT,
ADD COLUMN     "username" TEXT,
ADD COLUMN     "workLocation" TEXT,
ADD COLUMN     "workMode" "WorkMode",
ADD COLUMN     "workSchedule" TEXT;

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPermission_userId_idx" ON "UserPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permissionId_key" ON "UserPermission"("userId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
