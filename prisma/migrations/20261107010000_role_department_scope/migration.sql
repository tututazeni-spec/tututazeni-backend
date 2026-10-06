-- modulo_settings.md §2: acesso por unidade/departamento por perfil
CREATE TABLE "RoleDepartmentScope" (
  "id" SERIAL NOT NULL,
  "roleId" INTEGER NOT NULL,
  "departmentId" INTEGER NOT NULL,
  CONSTRAINT "RoleDepartmentScope_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoleDepartmentScope_roleId_departmentId_key" ON "RoleDepartmentScope"("roleId", "departmentId");
CREATE INDEX "RoleDepartmentScope_departmentId_idx" ON "RoleDepartmentScope"("departmentId");
ALTER TABLE "RoleDepartmentScope" ADD CONSTRAINT "RoleDepartmentScope_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleDepartmentScope" ADD CONSTRAINT "RoleDepartmentScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
