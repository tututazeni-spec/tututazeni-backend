-- modulo_scalability.md §10: métricas reais de frontend (Web Vitals, bundle, cache, erros)
CREATE TABLE "frontend_perf_samples" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" TEXT NOT NULL,
    "ttfbMs" DOUBLE PRECISION,
    "fcpMs" DOUBLE PRECISION,
    "lcpMs" DOUBLE PRECISION,
    "inpMs" DOUBLE PRECISION,
    "loadMs" DOUBLE PRECISION,
    "jsBytes" INTEGER NOT NULL DEFAULT 0,
    "cssBytes" INTEGER NOT NULL DEFAULT 0,
    "imageBytes" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "frontend_perf_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "frontend_perf_samples_createdAt_idx" ON "frontend_perf_samples"("createdAt");
CREATE INDEX "frontend_perf_samples_path_createdAt_idx" ON "frontend_perf_samples"("path", "createdAt");
