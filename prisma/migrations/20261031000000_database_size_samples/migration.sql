-- modulo_scalability.md §8-9: histórico do tamanho da BD
CREATE TABLE "database_size_samples" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sizeBytes" BIGINT NOT NULL,
    "tables" JSONB,

    CONSTRAINT "database_size_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "database_size_samples_capturedAt_idx" ON "database_size_samples"("capturedAt");
