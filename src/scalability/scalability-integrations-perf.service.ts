// modulo_scalability.md §13-14 — abas Integrações e Performance.
//
// Integrações: IntegrationConfig + IntegrationSyncLog (janela de 24h). Um
// "request" é uma execução de sincronização; a latência é a duração
// (finishedAt - startedAt). Não existe contagem de bytes por integração, por
// isso o volume transferido é medido em registos processados.
// Performance: visão transversal que compõe as métricas já expostas pelas
// abas API, Base de Dados, Conteúdo/Frontend e Filas, com classificação por KPI.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityInfraService } from './scalability-infra.service';
import { ScalabilityQueuesService } from './scalability-queues.service';

const WINDOW_H = 24;
const RETRY_GAP_MS = 60 * 60 * 1000;

export type PerfClass = 'EXCELENTE' | 'NORMAL' | 'ATENCAO' | 'DEGRADACAO' | 'CRITICO';

// Limiares ascendentes: [excelente, normal, atenção, degradação] — acima do
// último é crítico.
const THRESHOLDS = {
  responseMs: [200, 500, 1000, 2000],
  apiLatencyMs: [200, 500, 1000, 2000],
  dbLatencyMs: [20, 100, 250, 500],
  frontendMs: [1500, 2500, 4000, 6000],
  errorRate: [0.1, 1, 3, 5],
  queueLatencyMs: [500, 2000, 5000, 15000],
  jobMs: [1000, 5000, 15000, 60000],
} as const;

@Injectable()
export class ScalabilityIntegrationsPerfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly infra: ScalabilityInfraService,
    private readonly queues: ScalabilityQueuesService,
  ) {}

  private round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  private classify(value: number | null, limits: readonly number[]): PerfClass | null {
    if (value === null) return null;
    if (value <= limits[0]) return 'EXCELENTE';
    if (value <= limits[1]) return 'NORMAL';
    if (value <= limits[2]) return 'ATENCAO';
    if (value <= limits[3]) return 'DEGRADACAO';
    return 'CRITICO';
  }

  // ============================================================
  // §13 Integrações
  // ============================================================

  async getIntegrationMetrics() {
    const since = new Date(Date.now() - WINDOW_H * 60 * 60 * 1000);
    const [integrations, logs, queueMetrics] = await Promise.all([
      this.prisma.integrationConfig.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          category: true,
          status: true,
          isActive: true,
          lastSyncAt: true,
          lastSyncStatus: true,
          lastSyncError: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.integrationSyncLog.findMany({
        where: { startedAt: { gte: since } },
        orderBy: { startedAt: 'asc' },
        select: {
          integrationId: true,
          startedAt: true,
          finishedAt: true,
          status: true,
          recordsProcessed: true,
          recordsFailed: true,
        },
      }),
      this.queues.getQueueMetrics().catch(() => null),
    ]);

    const logsBy = new Map<number, typeof logs>();
    for (const l of logs) {
      const list = logsBy.get(l.integrationId) ?? [];
      list.push(l);
      logsBy.set(l.integrationId, list);
    }

    const rows = integrations.map(i => {
      const list = logsBy.get(i.id) ?? [];
      const finished = list.filter(l => l.finishedAt);
      const durations = finished.map(l => (l.finishedAt as Date).getTime() - l.startedAt.getTime());
      const failed = list.filter(l => l.status === 'FAILED').length;
      const partial = list.filter(l => l.status === 'PARTIAL').length;
      let retries = 0;
      for (let k = 1; k < list.length; k++) {
        if (
          list[k - 1].status === 'FAILED' &&
          list[k].startedAt.getTime() - list[k - 1].startedAt.getTime() <= RETRY_GAP_MS
        ) {
          retries++;
        }
      }
      const errorRate = list.length ? this.round1(((failed + partial) / list.length) * 100) : 0;
      const latencyMs = durations.length
        ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
        : null;
      const state: 'OK' | 'ATENCAO' | 'CRITICO' | 'INACTIVA' =
        !i.isActive || i.status === 'INACTIVE'
          ? 'INACTIVA'
          : i.status === 'ERROR' || errorRate >= 5
            ? 'CRITICO'
            : errorRate >= 1 || i.status === 'RATE_LIMITED' || i.status === 'PENDING_AUTH'
              ? 'ATENCAO'
              : 'OK';
      return {
        id: i.id,
        name: i.name,
        type: i.type,
        category: i.category,
        status: i.status,
        requests: list.length,
        errors: failed + partial,
        errorRate,
        latencyMs,
        retries,
        pendingJobs: list.filter(l => l.status === 'RUNNING' && !l.finishedAt).length,
        recordsProcessed: list.reduce((s, l) => s + l.recordsProcessed, 0),
        recordsFailed: list.reduce((s, l) => s + l.recordsFailed, 0),
        lastSyncAt: i.lastSyncAt ? i.lastSyncAt.toISOString() : null,
        lastSyncStatus: i.lastSyncStatus,
        lastError: i.lastSyncError,
        state,
      };
    });

    const totalRequests = rows.reduce((s, r) => s + r.requests, 0);
    const totalErrors = rows.reduce((s, r) => s + r.errors, 0);
    const allDurations = logs
      .filter(l => l.finishedAt)
      .map(l => (l.finishedAt as Date).getTime() - l.startedAt.getTime());
    const webhooks = queueMetrics?.queues.find(q => q.key === 'webhooks');

    return {
      windowHours: WINDOW_H,
      totals: {
        active: integrations.filter(i => i.isActive && i.status === 'ACTIVE').length,
        total: integrations.length,
        requests: totalRequests,
        syncs: totalRequests,
        failures: totalErrors,
        errorRate: totalRequests ? this.round1((totalErrors / totalRequests) * 100) : 0,
        avgLatencyMs: allDurations.length
          ? Math.round(allDurations.reduce((s, v) => s + v, 0) / allDurations.length)
          : null,
        retries: rows.reduce((s, r) => s + r.retries, 0) + (webhooks?.retries ?? 0),
        pendingJobs: rows.reduce((s, r) => s + r.pendingJobs, 0) + (webhooks?.waiting ?? 0),
        recordsTransferred: rows.reduce((s, r) => s + r.recordsProcessed, 0),
        // Sem contagem de bytes por integração — o volume é em registos.
        bytesTransferred: null as number | null,
      },
      webhooksQueue: webhooks
        ? {
            waiting: webhooks.waiting,
            active: webhooks.active,
            failed: webhooks.failed,
            retries: webhooks.retries,
          }
        : null,
      integrations: rows.sort((a, b) => b.requests - a.requests),
    };
  }

  // ============================================================
  // §14 Performance
  // ============================================================

  async getPerformanceMetrics() {
    const [api, db, frontend, queue] = await Promise.all([
      this.infra.getApiMetrics().catch(() => null),
      this.infra.getDatabaseMetrics().catch(() => null),
      this.infra.getFrontendMetrics().catch(() => null),
      this.queues.getQueueMetrics().catch(() => null),
    ]);

    const responseMs = api && api.totals.requests ? api.totals.p95Ms : null;
    const apiMs = api && api.totals.requests ? api.totals.avgLatencyMs : null;
    const dbMs = db && db.queries.appTotal ? db.queries.appAvgMs : null;
    const frontMs = frontend?.vitals.pageLoadMs ?? null;
    const errorRate = api && api.totals.requests ? api.totals.errorRate : null;
    const queueMs = queue ? queue.totals.avgDurationMs : null;

    const kpi = (
      key: string,
      label: string,
      value: number | null,
      unit: string,
      limits: readonly number[] | null,
      note?: string,
    ) => ({
      key,
      label,
      value,
      unit,
      classification: limits ? this.classify(value, limits) : null,
      note: note ?? null,
    });

    const kpis = [
      kpi('response', 'Response time (p95)', responseMs, 'ms', THRESHOLDS.responseMs),
      kpi('api', 'API latency (média)', apiMs, 'ms', THRESHOLDS.apiLatencyMs),
      kpi('db', 'Database latency (média)', dbMs, 'ms', THRESHOLDS.dbLatencyMs),
      kpi(
        'frontend',
        'Frontend latency (p75 carga)',
        frontMs,
        'ms',
        THRESHOLDS.frontendMs,
        frontend && !frontend.samples ? 'Sem amostras de browser nas últimas 24h' : undefined,
      ),
      kpi('errors', 'Error rate', errorRate, '%', THRESHOLDS.errorRate),
      kpi('throughput', 'Throughput', api?.rates.throughputRps ?? null, 'req/s', null),
      kpi('rps', 'Requests/sec', api?.rates.requestsPerSecond ?? null, 'req/s', null),
      // Latência de fila = duração média dos jobs concluídos (Bull não expõe
      // tempo de espera agregado).
      kpi('queueLatency', 'Queue latency', queueMs, 'ms', THRESHOLDS.queueLatencyMs),
      kpi('jobTime', 'Job execution time', queueMs, 'ms', THRESHOLDS.jobMs),
    ];

    const order: PerfClass[] = ['EXCELENTE', 'NORMAL', 'ATENCAO', 'DEGRADACAO', 'CRITICO'];
    const worst = kpis.reduce<PerfClass | null>((w, k) => {
      if (!k.classification) return w;
      if (!w) return k.classification;
      return order.indexOf(k.classification) > order.indexOf(w) ? k.classification : w;
    }, null);

    return {
      overall: worst,
      kpis,
      slowEndpoints: (api?.endpoints ?? [])
        .filter(e => e.status !== 'OK')
        .slice(0, 10)
        .map(e => ({ endpoint: e.endpoint, p95Ms: e.p95Ms, errorRate: e.errorRate, status: e.status })),
      thresholds: THRESHOLDS,
    };
  }
}
