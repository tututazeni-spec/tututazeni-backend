-- CreateTable
CREATE TABLE "DepartmentArea" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentArea_departmentId_name_key" ON "DepartmentArea"("departmentId", "name");

-- AddForeignKey
ALTER TABLE "DepartmentArea" ADD CONSTRAINT "DepartmentArea_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
