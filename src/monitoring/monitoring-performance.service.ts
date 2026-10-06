// modulo_monitoring.md §6 — Performance.
//
// Não mede nada de novo: compõe as fontes que o Scalability já recolhe (API via
// prom-client, base de dados via pg_stat, filas Bull, armazenamento, CPU/memória
// via ScalabilityMetric) e classifica cada indicador no mesmo vocabulário de
// estados do resto do Monitoring. Cada bloco falha isoladamente: se uma fonte
// não responde, esse bloco vem `available:false` em vez de rebentar o endpoint.
//
// Limitações conhecidas (devolvidas como `null`, nunca como 0):
//  - os contadores HTTP são desde o arranque do processo (não há janela móvel);
//  - requests/min exige duas leituras consecutivas (a 1.ª após arranque é null);
//  - CPU/memória são os da aplicação (última amostra do cron do Scalability) e
//    ficam `stale` se a amostra tiver mais de 3 minutos.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityInfraService } from '../scalability/scalability-infra.service';
import { ScalabilityQueuesService } from '../scalability/scalability-queues.service';
import { ScalabilityStorageService } from '../scalability/scalability-storage.service';
import { MonitoringStatus, STATUS_LABEL, worstStatus } from './monitoring-status';

const SAMPLE_STALE_MS = 3 * 60_000;
const ENDPOINT_LIST = 15;

/** [atenção, degradado, crítico] — valor ≥ limiar sobe o estado. */
type Limits = readonly [number, number, number];

const LIMITS = {
  p95Ms: [500, 1000, 2000],
  errorRatePercent: [1, 3, 5],
  cpuPercent: [70, 85, 95],
  memoryPercent: [75, 85, 95],
  diskPercent: [75, 85, 95],
  dbConnectionsPercent: [60, 80, 95],
  dbQueryAvgMs: [100, 250, 500],
  queueBacklog: [100, 500, 2000],
  queueFailed: [1, 20, 100],
  storagePercent: [75, 85, 95],
} as const satisfies Record<string, Limits>;

export function rate(value: number | null | undefined, limits: Limits): MonitoringStatus | null {
  if (value === null || value === undefined) return null;
  if (value >= limits[2]) return 'CRITICO';
  if (value >= limits[1]) return 'DEGRADADO';
  if (value >= limits[0]) return 'ATENCAO';
  return 'NORMAL';
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

@Injectable()
export class MonitoringPerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly infra: ScalabilityInfraService,
    private readonly queues: ScalabilityQueuesService,
    private readonly storage: ScalabilityStorageService,
  ) {}

  async getPerformance() {
    const now = new Date();
    const [api, db, queue, storage, sample] = await Promise.all([
      safe(() => this.infra.getApiMetrics()),
      safe(() => this.infra.getDatabaseMetrics()),
      safe(() => this.queues.getQueueMetrics()),
      safe(() => this.storage.getStorageMetrics()),
      safe(() =>
        this.prisma.read.scalabilityMetric.findFirst({
          orderBy: { capturedAt: 'desc' },
          select: {
            capturedAt: true,
            cpuUsagePercent: true,
            memoryUsagePercent: true,
            diskUsagePercent: true,
          },
        }),
      ),
    ]);

    const hasTraffic = !!api && api.totals.requests > 0;
    const stale = !sample || now.getTime() - sample.capturedAt.getTime() > SAMPLE_STALE_MS;

    const apiStatus = hasTraffic
      ? worstStatus(
          [
            rate(api.totals.p95Ms, LIMITS.p95Ms),
            rate(api.totals.errorRate, LIMITS.errorRatePercent),
          ].filter((s): s is MonitoringStatus => s !== null),
        )
      : null;

    const system = {
      available: !!sample,
      stale,
      capturedAt: sample?.capturedAt ?? null,
      cpuPercent: sample?.cpuUsagePercent ?? null,
      memoryPercent: sample?.memoryUsagePercent ?? null,
      diskPercent: sample?.diskUsagePercent ?? null,
      status: sample
        ? worstStatus(
            [
              rate(sample.cpuUsagePercent, LIMITS.cpuPercent),
              rate(sample.memoryUsagePercent, LIMITS.memoryPercent),
              rate(sample.diskUsagePercent, LIMITS.diskPercent),
            ].filter((s): s is MonitoringStatus => s !== null),
          )
        : null,
    };

    const dbBlock = db
      ? {
          available: true,
          connections: db.connections,
          waitingLocks: db.health.waitingLocks,
          deadlocks: db.health.deadlocks,
          cacheHitRatio: db.health.cacheHitRatio,
          queriesPerSecond: db.throughput.queriesPerSecond,
          appAvgQueryMs: db.queries.appTotal ? db.queries.appAvgMs : null,
          appP95QueryMs: db.queries.appTotal ? db.queries.appP95Ms : null,
          slowQueries: db.queries.slowCount,
          slowThresholdMs: db.queries.slowThresholdMs,
          sizeGb: db.storage.sizeGb,
          status: worstStatus(
            [
              rate(db.connections.usagePercent, LIMITS.dbConnectionsPercent),
              db.queries.appTotal ? rate(db.queries.appAvgMs, LIMITS.dbQueryAvgMs) : null,
              db.health.waitingLocks > 0 ? ('ATENCAO' as const) : null,
            ].filter((s): s is MonitoringStatus => s !== null),
          ),
        }
      : { available: false };

    const queueBlock = queue
      ? {
          available: true,
          mode: queue.mode,
          redisAvailable: queue.redisAvailable,
          totals: queue.totals,
          queues: queue.queues.map(q => ({
            key: q.key,
            label: q.label,
            waiting: q.waiting,
            active: q.active,
            failed: q.failed,
            avgDurationMs: q.avgDurationMs,
            throughputPerMin: q.throughputPerMin,
          })),
          status: !queue.redisAvailable
            ? ('INDISPONIVEL' as const)
            : worstStatus(
                [
                  rate(queue.totals.queueSize, LIMITS.queueBacklog),
                  rate(queue.totals.failed, LIMITS.queueFailed),
                ].filter((s): s is MonitoringStatus => s !== null),
              ),
        }
      : { available: false };

    const storageBlock = storage
      ? {
          available: true,
          usedGb: storage.usedGb,
          totalGb: storage.totalGb,
          usagePercent: storage.usagePercent,
          monthlyGrowthMb: storage.monthlyGrowthMb,
          files: storage.files,
          status: rate(storage.usagePercent, LIMITS.storagePercent),
          note: storage.note,
        }
      : { available: false };

    const apiBlock = api
      ? {
          available: true,
          sinceProcessStartSeconds: api.sinceProcessStartSeconds,
          requests: api.totals.requests,
          avgLatencyMs: hasTraffic ? api.totals.avgLatencyMs : null,
          p50Ms: hasTraffic ? api.totals.p50Ms : null,
          p95Ms: hasTraffic ? api.totals.p95Ms : null,
          p99Ms: hasTraffic ? api.totals.p99Ms : null,
          errorRatePercent: hasTraffic ? api.totals.errorRate : null,
          http4xx: api.totals.http4xx,
          http5xx: api.totals.http5xx,
          timeouts: api.totals.timeouts,
          slowRequests: api.totals.slowRequests,
          slowThresholdMs: api.totals.slowThresholdMs,
          requestsPerMinute: api.rates.requestsPerMinute,
          errors5xxPerMinute: api.rates.errors5xxPerMinute,
          status: apiStatus,
        }
      : { available: false };

    const blocks = [
      apiBlock.available ? apiStatus : null,
      system.status,
      'status' in dbBlock ? dbBlock.status : null,
      'status' in queueBlock ? queueBlock.status : null,
      'status' in storageBlock ? storageBlock.status : null,
    ].filter((s): s is MonitoringStatus => s !== null);
    const unavailable = [
      !api && 'API',
      !db && 'Base de dados',
      !queue && 'Filas',
      !storage && 'Armazenamento',
      !sample && 'CPU/Memória',
    ].filter((x): x is string => !!x);
    const overall = worstStatus(blocks);

    // Performance por endpoint: os mais lentos (p95) e os com mais erros 5xx.
    const endpoints = api?.endpoints ?? [];
    const slowest = [...endpoints].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, ENDPOINT_LIST);
    const failing = endpoints
      .filter(e => e.errors5xx > 0)
      .sort((a, b) => b.errors5xx - a.errors5xx)
      .slice(0, ENDPOINT_LIST);

    return {
      generatedAt: now.toISOString(),
      overall: {
        status: overall,
        statusLabel: STATUS_LABEL[overall],
        unavailableSources: unavailable,
      },
      api: apiBlock,
      system,
      database: dbBlock,
      queues: queueBlock,
      storage: storageBlock,
      endpoints: {
        total: endpoints.length,
        slowest,
        failing,
      },
    };
  }
}
