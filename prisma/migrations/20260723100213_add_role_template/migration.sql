-- CreateTable RoleTemplate
CREATE TABLE "RoleTemplate" (
    "id" SERIAL NOT NULL,
    "positionName" VARCHAR(100) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "positionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoleTemplate_roleId_idx" ON "RoleTemplate"("roleId");

-- CreateIndex
CREATE INDEX "RoleTemplate_positionId_idx" ON "RoleTemplate"("positionId");

-- AddForeignKey
ALTER TABLE "RoleTemplate" ADD CONSTRAINT "RoleTemplate_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleTemplate" ADD CONSTRAINT "RoleTemplate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
