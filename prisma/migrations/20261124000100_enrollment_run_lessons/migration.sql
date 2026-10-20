-- Detalhe por aula de cada realização (preservado ao reciclar).
CREATE TABLE "EnrollmentRunLesson" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "completedAt" TIMESTAMP(3),
    "watchedSeconds" INTEGER,
    CONSTRAINT "EnrollmentRunLesson_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnrollmentRunLesson_runId_lessonId_key" ON "EnrollmentRunLesson"("runId", "lessonId");
CREATE INDEX "EnrollmentRunLesson_runId_idx" ON "EnrollmentRunLesson"("runId");
ALTER TABLE "EnrollmentRunLesson" ADD CONSTRAINT "EnrollmentRunLesson_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "EnrollmentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deriva antiga: createdById passou a anulável mas a FK ficou em RESTRICT (o schema espera SET NULL).
ALTER TABLE "CertificateTemplate" DROP CONSTRAINT "CertificateTemplate_createdById_fkey";
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
