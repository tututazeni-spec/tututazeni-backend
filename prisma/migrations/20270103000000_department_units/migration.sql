-- CreateTable
CREATE TABLE "DepartmentUnit" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,

    CONSTRAINT "DepartmentUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentUnit_departmentId_unitId_key" ON "DepartmentUnit"("departmentId", "unitId");

-- AddForeignKey
ALTER TABLE "DepartmentUnit" ADD CONSTRAINT "DepartmentUnit_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentUnit" ADD CONSTRAINT "DepartmentUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
