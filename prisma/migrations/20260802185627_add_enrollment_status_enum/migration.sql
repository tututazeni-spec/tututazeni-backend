-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'OVERDUE');

-- Normaliza valores legados (convenção PT ou outros) antes de mudar o tipo da coluna.
-- A BD local (innova_dev) não tem nenhum destes valores hoje, mas outros ambientes podem ter.
UPDATE "Enrollment" SET "status" = CASE "status"
  WHEN 'EM_ANDAMENTO' THEN 'IN_PROGRESS'
  WHEN 'CONCLUIDO' THEN 'COMPLETED'
  WHEN 'CANCELADO' THEN 'CANCELLED'
  WHEN 'ACTIVE' THEN 'IN_PROGRESS'
  ELSE "status"
END
WHERE "status" NOT IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'OVERDUE');

-- AlterTable
ALTER TABLE "Enrollment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Enrollment" ALTER COLUMN "status" TYPE "EnrollmentStatus" USING ("status"::"EnrollmentStatus");
ALTER TABLE "Enrollment" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';
