-- modulo_scalability.md §27/§28: histórico de filas e de performance por endpoint + downsampling horário
CREATE TABLE "scalability_queue_metrics" (
  "id" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "queue" TEXT NOT NULL,
  "pending" INTEGER NOT NULL DEFAULT 0,
  "processing" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "throughput" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avgProcessingMs" DOUBLE PRECISION,
  CONSTRAINT "scalability_queue_metrics_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scalability_queue_metrics_queue_capturedAt_idx" ON "scalability_queue_metrics"("queue", "capturedAt");
CREATE INDEX "scalability_queue_metrics_capturedAt_idx" ON "scalability_queue_metrics"("capturedAt");

CREATE TABLE "scalability_endpoint_metrics" (
  "id" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "service" TEXT NOT NULL DEFAULT 'api',
  "endpoint" TEXT NOT NULL,
  "p50Ms" DOUBLE PRECISION NOT NULL,
  "p95Ms" DOUBLE PRECISION NOT NULL,
  "p99Ms" DOUBLE PRECISION NOT NULL,
  "throughput" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "scalability_endpoint_metrics_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scalability_endpoint_metrics_endpoint_capturedAt_idx" ON "scalability_endpoint_metrics"("endpoint", "capturedAt");
CREATE INDEX "scalability_endpoint_metrics_capturedAt_idx" ON "scalability_endpoint_metrics"("capturedAt");

CREATE TABLE "scalability_metrics_hourly" (
  "id" TEXT NOT NULL,
  "hour" TIMESTAMP(3) NOT NULL,
  "samples" INTEGER NOT NULL,
  "avgCpu" DOUBLE PRECISION NOT NULL,
  "maxCpu" DOUBLE PRECISION NOT NULL,
  "avgMemory" DOUBLE PRECISION NOT NULL,
  "maxMemory" DOUBLE PRECISION NOT NULL,
  "avgDisk" DOUBLE PRECISION NOT NULL,
  "maxActiveUsers" INTEGER NOT NULL,
  "maxConcurrent" INTEGER NOT NULL,
  "avgLatencyMs" DOUBLE PRECISION NOT NULL,
  "maxP95Ms" INTEGER NOT NULL,
  "maxP99Ms" INTEGER NOT NULL,
  "avgRpm" DOUBLE PRECISION NOT NULL,
  "maxRpm" INTEGER NOT NULL,
  "avgErrorRate" DOUBLE PRECISION NOT NULL,
  "maxStorageGb" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "scalability_metrics_hourly_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scalability_metrics_hourly_hour_key" ON "scalability_metrics_hourly"("hour");
