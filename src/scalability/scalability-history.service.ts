// modulo_scalability.md §27-28 — histórico durável, agregação e retenção.
//
// - QueueMetric / PerformanceMetric: amostras periódicas persistidas (antes só em memória).
// - Downsampling: ScalabilityMetric (1/min) → ScalabilityMetricHourly (1/h), que sobrevive às
//   amostras brutas (§28.1).
// - Retenção: filas/endpoints conforme metricRetentionDays; horárias 4× esse período.
// Separado do Audit (§28.2): aqui mede-se o sistema, não quem fez o quê.

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityInfraService } from './scalability-infra.service';
import { ScalabilityQueuesService } from './scalability-queues.service';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const ENDPOINT_TOP_N = 50;
const HOURLY_RETENTION_FACTOR = 4;

export interface RawMetricRow {
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
  activeUsers: number;
  concurrentSessions: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  requestsPerMinute: number;
  errorRate: number;
  storageUsedGb: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Agrega as amostras de uma hora numa linha (médias para taxas, máximos para picos). */
export function rollupHour(hour: Date, rows: RawMetricRow[]) {
  const n = rows.length;
  const avg = (pick: (r: RawMetricRow) => number) => r2(rows.reduce((s, r) => s + pick(r), 0) / n);
  const max = (pick: (r: RawMetricRow) => number) => Math.max(...rows.map(pick));
  return {
    hour,
    samples: n,
    avgCpu: avg(r => r.cpuUsagePercent),
    maxCpu: max(r => r.cpuUsagePercent),
    avgMemory: avg(r => r.memoryUsagePercent),
    maxMemory: max(r => r.memoryUsagePercent),
    avgDisk: avg(r => r.diskUsagePercent),
    maxActiveUsers: max(r => r.activeUsers),
    maxConcurrent: max(r => r.concurrentSessions),
    avgLatencyMs: avg(r => r.avgLatencyMs),
    maxP95Ms: max(r => r.p95LatencyMs),
    maxP99Ms: max(r => r.p99LatencyMs),
    avgRpm: avg(r => r.requestsPerMinute),
    maxRpm: max(r => r.requestsPerMinute),
    avgErrorRate: avg(r => r.errorRate),
    maxStorageGb: max(r => r.storageUsedGb),
  };
}

@Injectable()
export class ScalabilityHistoryService {
  private readonly logger = new Logger(ScalabilityHistoryService.name);
  private prevEndpoint = new Map<string, { count: number; errors: number; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly infra: ScalabilityInfraService,
    private readonly queues: ScalabilityQueuesService,
  ) {}

  private warn(what: string, err: unknown) {
    this.logger.warn(`${what}: ${err instanceof Error ? err.message : err}`);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async recordQueueMetrics() {
    try {
      const snap = await this.queues.snapshotForHistory();
      if (!snap.length) return;
      await this.prisma.scalabilityQueueMetric.createMany({ data: snap });
    } catch (err) {
      this.warn('Histórico de filas falhou', err);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async recordEndpointMetrics() {
    try {
      const now = Date.now();
      const aggs = await this.infra.endpointAggregates();
      const rows = [];
      for (const a of aggs) {
        const prev = this.prevEndpoint.get(a.endpoint);
        this.prevEndpoint.set(a.endpoint, { count: a.count, errors: a.errors, at: now });
        // Sem amostra anterior (ou contadores reiniciados) não há delta fiável.
        if (!prev || a.count < prev.count) continue;
        const dCount = a.count - prev.count;
        const dt = (now - prev.at) / 1000;
        if (dCount <= 0 || dt < 5) continue;
        rows.push({
          endpoint: a.endpoint,
          p50Ms: a.p50Ms,
          p95Ms: a.p95Ms,
          p99Ms: a.p99Ms,
          throughput: r2(dCount / dt),
          errorRate: r2(((a.errors - prev.errors) / dCount) * 100),
        });
      }
      rows.sort((x, y) => y.throughput - x.throughput);
      const top = rows.slice(0, ENDPOINT_TOP_N);
      if (top.length) await this.prisma.scalabilityEndpointMetric.createMany({ data: top });
    } catch (err) {
      this.warn('Histórico de endpoints falhou', err);
    }
  }

  /** Agrega em horas completas (idempotente: a unique em `hour` evita duplicados). */
  async rollupHourly(): Promise<number> {
    const last = await this.prisma.scalabilityMetricHourly.findFirst({
      orderBy: { hour: 'desc' },
      select: { hour: true },
    });
    const currentHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    let from: number;
    if (last) {
      from = last.hour.getTime() + HOUR_MS;
    } else {
      const first = await this.prisma.scalabilityMetric.findFirst({
        orderBy: { capturedAt: 'asc' },
        select: { capturedAt: true },
      });
      if (!first) return 0;
      from = Math.floor(first.capturedAt.getTime() / HOUR_MS) * HOUR_MS;
    }
    if (from >= currentHour) return 0;

    const raw = await this.prisma.scalabilityMetric.findMany({
      where: { capturedAt: { gte: new Date(from), lt: new Date(currentHour) } },
      select: {
        capturedAt: true,
        cpuUsagePercent: true,
        memoryUsagePercent: true,
        diskUsagePercent: true,
        activeUsers: true,
        concurrentSessions: true,
        avgLatencyMs: true,
        p95LatencyMs: true,
        p99LatencyMs: true,
        requestsPerMinute: true,
        errorRate: true,
        storageUsedGb: true,
      },
    });
    const buckets = new Map<number, RawMetricRow[]>();
    for (const m of raw) {
      const h = Math.floor(m.capturedAt.getTime() / HOUR_MS) * HOUR_MS;
      const list = buckets.get(h) ?? [];
      list.push(m);
      buckets.set(h, list);
    }
    const data = [...buckets.entries()].map(([h, rows]) => rollupHour(new Date(h), rows));
    if (!data.length) return 0;
    const res = await this.prisma.scalabilityMetricHourly.createMany({
      data,
      skipDuplicates: true,
    });
    return res.count;
  }

  /** Corre antes da retenção das brutas (03:00, em ScalabilitySettingsService), para nada se perder. */
  @Cron('0 20 2 * * *')
  async nightlyRollup() {
    try {
      const n = await this.rollupHourly();
      if (n) this.logger.log(`Downsampling: ${n} hora(s) agregada(s)`);
    } catch (err) {
      this.warn('Downsampling horário falhou', err);
    }
  }

  @Cron('0 30 3 * * *')
  async purgeHistory() {
    try {
      const s = await this.prisma.scalabilityInfraSettings.findUnique({
        where: { id: 'default' },
        select: { metricRetentionDays: true },
      });
      const days = s?.metricRetentionDays ?? 90;
      const cutoff = new Date(Date.now() - days * DAY_MS);
      const [q, e, h] = await Promise.all([
        this.prisma.scalabilityQueueMetric.deleteMany({ where: { capturedAt: { lt: cutoff } } }),
        this.prisma.scalabilityEndpointMetric.deleteMany({ where: { capturedAt: { lt: cutoff } } }),
        this.prisma.scalabilityMetricHourly.deleteMany({
          where: { hour: { lt: new Date(Date.now() - days * HOURLY_RETENTION_FACTOR * DAY_MS) } },
        }),
      ]);
      if (q.count + e.count + h.count) {
        this.logger.log(`Retenção: ${q.count} filas, ${e.count} endpoints, ${h.count} horárias`);
      }
    } catch (err) {
      this.warn('Retenção do histórico falhou', err);
    }
  }

  // ---------- leitura ----------

  private since(hours: number) {
    return new Date(Date.now() - Math.min(Math.max(hours, 1), 24 * 90) * HOUR_MS);
  }

  getQueueHistory(hours = 24, queue?: string) {
    return this.prisma.scalabilityQueueMetric.findMany({
      where: { capturedAt: { gte: this.since(hours) }, ...(queue ? { queue } : {}) },
      orderBy: { capturedAt: 'asc' },
      take: 10_000,
    });
  }

  getEndpointHistory(hours = 24, endpoint?: string) {
    return this.prisma.scalabilityEndpointMetric.findMany({
      where: { capturedAt: { gte: this.since(hours) }, ...(endpoint ? { endpoint } : {}) },
      orderBy: { capturedAt: 'asc' },
      take: 10_000,
    });
  }

  getHourlyHistory(days = 30) {
    return this.prisma.scalabilityMetricHourly.findMany({
      where: { hour: { gte: new Date(Date.now() - Math.min(Math.max(days, 1), 365) * DAY_MS) } },
      orderBy: { hour: 'asc' },
    });
  }

  /** §28: estado da retenção/downsampling para a aba Configurações. */
  async getRetentionStatus() {
    const s = await this.prisma.scalabilityInfraSettings.findUnique({
      where: { id: 'default' },
      select: { metricRetentionDays: true },
    });
    const days = s?.metricRetentionDays ?? 90;
    const [raw, queue, endpoint, hourly, oldestRaw, lastHour] = await Promise.all([
      this.prisma.scalabilityMetric.count(),
      this.prisma.scalabilityQueueMetric.count(),
      this.prisma.scalabilityEndpointMetric.count(),
      this.prisma.scalabilityMetricHourly.count(),
      this.prisma.scalabilityMetric.findFirst({
        orderBy: { capturedAt: 'asc' },
        select: { capturedAt: true },
      }),
      this.prisma.scalabilityMetricHourly.findFirst({
        orderBy: { hour: 'desc' },
        select: { hour: true },
      }),
    ]);
    return {
      retentionDays: days,
      hourlyRetentionDays: days * HOURLY_RETENTION_FACTOR,
      rows: { raw, queue, endpoint, hourly },
      oldestRawAt: oldestRaw?.capturedAt ?? null,
      lastRolledUpHour: lastHour?.hour ?? null,
    };
  }
}
