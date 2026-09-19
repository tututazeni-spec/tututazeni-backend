-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('OBRIGATORIO', 'OPCIONAL', 'COMPLIANCE', 'INTEGRACAO', 'DESENVOLVIMENTO', 'TECNICO', 'COMPORTAMENTAL', 'LIDERANCA');

-- CreateEnum
CREATE TYPE "CourseModality" AS ENUM ('ONLINE', 'PRESENCIAL', 'HIBRIDO', 'AO_VIVO', 'AUTOAPRENDIZAGEM');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "modality" "CourseModality",
ADD COLUMN     "type" "CourseType";

-- CreateIndex
CREATE INDEX "Course_type_idx" ON "Course"("type");

-- CreateIndex
CREATE INDEX "Course_modality_idx" ON "Course"("modality");
