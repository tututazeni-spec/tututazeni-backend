-- Reciclagem de formações: várias realizações por matrícula, um certificado por realização.
-- Aditiva: nenhuma matrícula/certificado existente é alterado (cycle/enrollmentCycle = 1).

CREATE TYPE "RecyclingMode" AS ENUM ('OFF', 'MANUAL', 'AUTOMATIC');
CREATE TYPE "EnrollmentRunReason" AS ENUM ('INITIAL', 'EXPIRY_AUTO', 'MANUAL');

ALTER TABLE "Course" ADD COLUMN "recyclingMode" "RecyclingMode" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Course" ADD COLUMN "recyclingLeadDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Enrollment" ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Enrollment" ADD COLUMN "cycleStartedAt" TIMESTAMP(3);

ALTER TABLE "Certificate" ADD COLUMN "enrollmentCycle" INTEGER NOT NULL DEFAULT 1;
-- A unicidade 1:1 impedia o 2.º certificado da mesma matrícula; o índice não único já existe.
DROP INDEX "Certificate_enrollmentId_key";

CREATE TABLE "EnrollmentRun" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL,
    "reason" "EnrollmentRunReason" NOT NULL DEFAULT 'INITIAL',
    "triggeredById" INTEGER,
    "fromCertificateId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "finalProgress" INTEGER,
    CONSTRAINT "EnrollmentRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnrollmentRun_enrollmentId_cycle_key" ON "EnrollmentRun"("enrollmentId", "cycle");
CREATE INDEX "EnrollmentRun_enrollmentId_idx" ON "EnrollmentRun"("enrollmentId");
ALTER TABLE "EnrollmentRun" ADD CONSTRAINT "EnrollmentRun_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Realização inicial para as matrículas existentes (preserva o histórico).
INSERT INTO "EnrollmentRun" ("enrollmentId", "cycle", "reason", "startedAt", "completedAt")
SELECT "id", 1, 'INITIAL', COALESCE("startedAt", "enrolledAt"), "completedAt" FROM "Enrollment";
