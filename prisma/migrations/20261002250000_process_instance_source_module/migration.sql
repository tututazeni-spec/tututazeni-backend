ALTER TABLE "ProcessInstance" ADD COLUMN "sourceModule" TEXT;

CREATE INDEX "ProcessInstance_sourceModule_idx" ON "ProcessInstance"("sourceModule");
