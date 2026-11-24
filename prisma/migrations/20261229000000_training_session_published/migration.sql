-- Sessões de formação passam a nascer em rascunho; as existentes ficam publicadas.
ALTER TABLE "TrainingSession" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;
