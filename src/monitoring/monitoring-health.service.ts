// modulo_monitoring.md §9 — Health Check.
//
// Sondas activas (não leituras de contadores): cada componente é testado ao vivo
// com timeout próprio e classificado no mesmo vocabulário de estados do resto do
// Monitoring. Uma sonda que rebenta ou expira dá INDISPONIVEL nesse componente —
// nunca derruba o endpoint. Um componente que não está configurado (ex.: sem
// FRONTEND_URL, sem integrações activas) devolve `status: null`, nunca "Normal".
//
// O cron de 1 em 1 minuto corre as sondas e guarda um histórico em memória
// (24 h) para a disponibilidade %. Limitações: o histórico perde-se no reinício
// e, com várias instâncias, cada uma só conhece as suas próprias sondas.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import type { Queue } from 'bull';
import * as v8 from 'v8';
import { monitorEventLoopDelay, IntervalHistogram } from 'perf_hooks';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ScalabilityInfraService } from '../scalability/scalability-infra.service';
import { ScalabilityStorageService } from '../scalability/scalability-storage.service';
import { LIMITS, rate } from './monitoring-performance.service';
import { MonitoringStatus, STATUS_LABEL, STATUS_RANK, worstStatus } from './monitoring-status';

export type HealthGroup = 'APLICACAO' | 'DADOS' | 'INFRAESTRUTURA' | 'EXTERNO' | 'PROCESSAMENTO';

export interface HealthComponent {
  key: string;
  label: string;
  group: HealthGroup;
  status: MonitoringStatus | null;
  statusLabel: string;
  latencyMs: number | null;
  detail: string;
  metrics: Record<string, unknown>;
  checkedAt: string;
}

type ProbeResult = Pick<HealthComponent, 'status' | 'latencyMs' | 'detail' | 'metrics'>;

const MB = 1024 * 1024;
const HISTORY_MAX = 1440; // 24 h a 1 amostra/minuto
const CACHE_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 3000;
const QUEUE_TIMEOUT_MS = 2000;
const CRON_HEARTBEAT_STALE_MS = 5 * 60_000;

const LATENCY_MS = [200, 800, 2000] as const; // sondas de ligação (BD, Redis, frontend)
const EVENT_LOOP_LAG_MS = [100, 500, 2000] as const;

const DOWN: ProbeResult['status'][] = ['CRITICO', 'INDISPONIVEL'];

function down(detail: string, metrics: Record<string, unknown> = {}): ProbeResult {
  return { status: 'INDISPONIVEL', latencyMs: null, detail, metrics };
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : typeof e === 'string' ? e : 'erro desconhecido';
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<never>((_, rej) => {
      t = setTimeout(() => rej(new Error(`timeout (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

/** Disponibilidade = amostras fora de Crítico/Indisponível; null sem amostras. */
export function uptimePercent(history: { status: MonitoringStatus }[]): number | null {
  if (!history.length) return null;
  const up = history.filter(h => !DOWN.includes(h.status)).length;
  return Math.round((up / history.length) * 1000) / 10;
}

@Injectable()
export class MonitoringHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringHealthService.name);
  private readonly queues: { key: string; queue: Queue }[];
  private readonly loop: IntervalHistogram = monitorEventLoopDelay({ resolution: 20 });
  private readonly history = new Map<string, { at: number; status: MonitoringStatus }[]>();
  private last: { at: number; components: HealthComponent[] } | null = null;
  private inflight: Promise<HealthComponent[]> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly infra: ScalabilityInfraService,
    private readonly storage: ScalabilityStorageService,
    private readonly scheduler: SchedulerRegistry,
    @InjectQueue('audit') audit: Queue,
    @InjectQueue('email') email: Queue,
    @InjectQueue('notifications') notifications: Queue,
    @InjectQueue('webhooks') webhooks: Queue,
  ) {
    this.queues = [
      { key: 'audit', queue: audit },
      { key: 'email', queue: email },
      { key: 'notifications', queue: notifications },
      { key: 'webhooks', queue: webhooks },
    ];
  }

  onModuleInit() {
    this.loop.enable();
  }

  onModuleDestroy() {
    this.loop.disable();
  }

  // ── Sondas ────────────────────────────────────────────────────────────────

  private async probeApi(): Promise<ProbeResult> {
    const api = await this.infra.getApiMetrics().catch(() => null);
    const uptimeSeconds = Math.round(process.uptime());
    const base = { uptimeSeconds, version: process.env.BUILD_SHA ?? 'unknown' };
    if (!api || api.totals.requests === 0) {
      return {
        status: 'NORMAL',
        latencyMs: null,
        detail: 'API a responder; sem tráfego suficiente para medir latência/erros',
        metrics: { ...base, requests: api?.totals.requests ?? 0 },
      };
    }
    const status = worstStatus(
      [
        rate(api.totals.p95Ms, LIMITS.p95Ms),
        rate(api.totals.errorRate, LIMITS.errorRatePercent),
      ].filter((s): s is MonitoringStatus => s !== null),
    );
    return {
      status,
      latencyMs: api.totals.p95Ms,
      detail: `p95 ${api.totals.p95Ms}ms · erros ${api.totals.errorRate}%`,
      metrics: {
        ...base,
        requests: api.totals.requests,
        p95Ms: api.totals.p95Ms,
        errorRatePercent: api.totals.errorRate,
        http5xx: api.totals.http5xx,
      },
    };
  }

  private async probeBackend(): Promise<ProbeResult> {
    const mem = process.memoryUsage();
    const heapLimit = v8.getHeapStatistics().heap_size_limit;
    const heapPercent = Math.round((mem.heapUsed / heapLimit) * 1000) / 10;
    const lagP99 = Math.round((this.loop.percentile(99) / 1e6) * 10) / 10;
    const lagMean = Math.round((this.loop.mean / 1e6) * 10) / 10;
    this.loop.reset();
    const status = worstStatus(
      [rate(heapPercent, LIMITS.memoryPercent), rate(lagP99, EVENT_LOOP_LAG_MS)].filter(
        (s): s is MonitoringStatus => s !== null,
      ),
    );
    return {
      status,
      latencyMs: lagP99,
      detail: `Heap ${heapPercent}% · event-loop p99 ${lagP99}ms`,
      metrics: {
        pid: process.pid,
        node: process.version,
        heapUsedMb: Math.round(mem.heapUsed / MB),
        heapLimitMb: Math.round(heapLimit / MB),
        heapPercent,
        rssMb: Math.round(mem.rss / MB),
        eventLoopLagP99Ms: lagP99,
        eventLoopLagMeanMs: lagMean,
      },
    };
  }

  private async probeFrontend(): Promise<ProbeResult> {
    const url = process.env.FRONTEND_URL?.split(',')[0]?.trim();
    if (!url) {
      return {
        status: null,
        latencyMs: null,
        detail: 'FRONTEND_URL não configurado — frontend não monitorizado',
        metrics: {},
      };
    }
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      await res.body?.cancel().catch(() => undefined);
      const ms = Date.now() - t0;
      const status =
        res.status >= 500
          ? 'CRITICO'
          : res.status >= 400
            ? 'DEGRADADO'
            : (rate(ms, LATENCY_MS) ?? 'NORMAL');
      return {
        status,
        latencyMs: ms,
        detail: `HTTP ${res.status} em ${ms}ms`,
        metrics: { url, httpStatus: res.status },
      };
    } catch (e) {
      return down(`Sem resposta de ${url}: ${errMsg(e)}`, { url });
    }
  }

  private async probePostgres(): Promise<ProbeResult> {
    const t0 = Date.now();
    try {
      await withTimeout(this.prisma.read.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS);
      const ms = Date.now() - t0;
      return {
        status: rate(ms, LATENCY_MS) ?? 'NORMAL',
        latencyMs: ms,
        detail: `SELECT 1 em ${ms}ms`,
        metrics: {},
      };
    } catch (e) {
      return down(`PostgreSQL sem resposta: ${errMsg(e)}`);
    }
  }

  private async probeRedis(): Promise<ProbeResult> {
    const t0 = Date.now();
    try {
      await withTimeout(this.cache.ping(), PROBE_TIMEOUT_MS);
      const ms = Date.now() - t0;
      return {
        status: rate(ms, LATENCY_MS) ?? 'NORMAL',
        latencyMs: ms,
        detail: `PING em ${ms}ms`,
        metrics: {},
      };
    } catch (e) {
      return down(`Redis sem resposta: ${errMsg(e)}`);
    }
  }

  private async probeStorage(): Promise<ProbeResult> {
    try {
      const s = await withTimeout(this.storage.getStorageMetrics(), PROBE_TIMEOUT_MS * 2);
      const status = rate(s.usagePercent, LIMITS.storagePercent);
      return {
        status,
        latencyMs: null,
        detail:
          s.usagePercent === null
            ? 'Capacidade total não configurada — sem percentagem de ocupação'
            : `${s.usagePercent}% ocupado (${s.usedGb} de ${s.totalGb} GB)`,
        metrics: { usedGb: s.usedGb, totalGb: s.totalGb, usagePercent: s.usagePercent },
      };
    } catch (e) {
      return down(`Armazenamento não medido: ${errMsg(e)}`);
    }
  }

  private async probeExternal(): Promise<ProbeResult> {
    try {
      const [total, bad] = await Promise.all([
        this.prisma.read.integrationConfig.count({ where: { active: true } }),
        this.prisma.read.integrationConfig.count({
          where: { active: true, status: { in: ['ERROR', 'RATE_LIMITED', 'PENDING_AUTH'] } },
        }),
      ]);
      if (total === 0) {
        return {
          status: null,
          latencyMs: null,
          detail: 'Sem integrações activas',
          metrics: { active: 0, failing: 0 },
        };
      }
      const status: MonitoringStatus =
        bad === 0
          ? 'NORMAL'
          : bad === total
            ? 'CRITICO'
            : bad * 2 >= total
              ? 'DEGRADADO'
              : 'ATENCAO';
      return {
        status,
        latencyMs: null,
        detail:
          bad === 0
            ? `${total} integração(ões) activa(s) sem falhas`
            : `${bad} de ${total} integração(ões) com falha`,
        metrics: { active: total, failing: bad },
      };
    } catch (e) {
      return down(`Estado das integrações não obtido: ${errMsg(e)}`);
    }
  }

  private async queueSnapshot() {
    return Promise.all(
      this.queues.map(async ({ key, queue }) => {
        try {
          const counts = await withTimeout(queue.getJobCounts(), QUEUE_TIMEOUT_MS);
          // getWorkers depende de CLIENT LIST (alguns Redis geridos bloqueiam-no):
          // falha isolada = número de workers desconhecido, não fila em baixo.
          const workers = await withTimeout(queue.getWorkers(), QUEUE_TIMEOUT_MS)
            .then(w => w.length)
            .catch(() => null);
          return {
            key,
            available: true,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
            workers,
          };
        } catch {
          return {
            key,
            available: false,
            waiting: 0,
            active: 0,
            failed: 0,
            delayed: 0,
            workers: null,
          };
        }
      }),
    );
  }

  private probeQueues(snap: Awaited<ReturnType<MonitoringHealthService['queueSnapshot']>>) {
    const unavailable = snap.filter(q => !q.available);
    if (unavailable.length === snap.length) {
      return down('Filas inacessíveis (Redis em baixo?)', { queues: snap });
    }
    const waiting = snap.reduce((s, q) => s + q.waiting, 0);
    const failed = snap.reduce((s, q) => s + q.failed, 0);
    const parts = [
      rate(waiting, LIMITS.queueBacklog),
      rate(failed, LIMITS.queueFailed),
      unavailable.length ? ('DEGRADADO' as const) : null,
    ].filter((s): s is MonitoringStatus => s !== null);
    return {
      status: worstStatus(parts),
      latencyMs: null,
      detail: `${waiting} em espera · ${failed} falhados${
        unavailable.length ? ` · ${unavailable.length} fila(s) inacessível(eis)` : ''
      }`,
      metrics: { waiting, failed, queues: snap },
    } satisfies ProbeResult;
  }

  private probeWorkers(snap: Awaited<ReturnType<MonitoringHealthService['queueSnapshot']>>) {
    const reachable = snap.filter(q => q.available);
    if (!reachable.length) return down('Filas inacessíveis — workers não verificáveis');
    const known = reachable.filter(q => q.workers !== null);
    if (!known.length) {
      return {
        status: null,
        latencyMs: null,
        detail: 'O Redis não permite listar workers (CLIENT LIST) — não verificável',
        metrics: { queues: snap.map(q => ({ key: q.key, workers: q.workers })) },
      } satisfies ProbeResult;
    }
    const stuck = known.filter(q => q.workers === 0 && q.waiting > 0);
    const idle = known.filter(q => q.workers === 0 && q.waiting === 0);
    const status: MonitoringStatus = stuck.length ? 'CRITICO' : idle.length ? 'ATENCAO' : 'NORMAL';
    return {
      status,
      latencyMs: null,
      detail: stuck.length
        ? `Sem worker com trabalho em espera: ${stuck.map(q => q.key).join(', ')}`
        : idle.length
          ? `Sem worker registado (fila vazia): ${idle.map(q => q.key).join(', ')}`
          : `${known.reduce((s, q) => s + (q.workers ?? 0), 0)} worker(s) registado(s)`,
      metrics: { queues: snap.map(q => ({ key: q.key, workers: q.workers, waiting: q.waiting })) },
    } satisfies ProbeResult;
  }

  private async probeCron(): Promise<ProbeResult> {
    const jobs = [...this.scheduler.getCronJobs().entries()].map(([name, job]) => {
      let nextRun: string | null = null;
      try {
        nextRun = job.nextDate().toJSDate().toISOString();
      } catch {
        /* cron sem próxima data */
      }
      return {
        name,
        running: job.running,
        lastRun: job.lastDate()?.toISOString() ?? null,
        nextRun,
      };
    });
    if (!jobs.length) {
      return { status: null, latencyMs: null, detail: 'Sem cron jobs registados', metrics: {} };
    }
    const stopped = jobs.filter(j => !j.running);

    // Batimento: o cron do Scalability grava uma amostra por minuto.
    const beat = await this.prisma.read.scalabilityMetric
      .findFirst({ orderBy: { capturedAt: 'desc' }, select: { capturedAt: true } })
      .catch(() => null);
    const beatAgeMs = beat ? Date.now() - beat.capturedAt.getTime() : null;
    const beatStale = beatAgeMs !== null && beatAgeMs > CRON_HEARTBEAT_STALE_MS;

    const status: MonitoringStatus = beatStale
      ? 'DEGRADADO'
      : stopped.length
        ? 'ATENCAO'
        : 'NORMAL';
    return {
      status,
      latencyMs: null,
      detail: beatStale
        ? `Última amostra do cron há ${Math.round((beatAgeMs ?? 0) / 60_000)} min — crons possivelmente parados`
        : stopped.length
          ? `${stopped.length} de ${jobs.length} cron job(s) parado(s)`
          : `${jobs.length} cron job(s) activo(s)`,
      metrics: {
        total: jobs.length,
        stopped: stopped.length,
        heartbeatAgeSeconds: beatAgeMs === null ? null : Math.round(beatAgeMs / 1000),
        jobs: jobs.slice(0, 60),
      },
    };
  }

  // ── Execução e histórico ──────────────────────────────────────────────────

  private async runProbes(): Promise<HealthComponent[]> {
    const checkedAt = new Date().toISOString();
    const queueSnap = await this.queueSnapshot();
    const defs: {
      key: string;
      label: string;
      group: HealthGroup;
      run: () => ProbeResult | Promise<ProbeResult>;
    }[] = [
      { key: 'api', label: 'API', group: 'APLICACAO', run: () => this.probeApi() },
      {
        key: 'backend',
        label: 'Backend (processo)',
        group: 'APLICACAO',
        run: () => this.probeBackend(),
      },
      { key: 'frontend', label: 'Frontend', group: 'APLICACAO', run: () => this.probeFrontend() },
      { key: 'postgres', label: 'PostgreSQL', group: 'DADOS', run: () => this.probePostgres() },
      { key: 'redis', label: 'Redis', group: 'DADOS', run: () => this.probeRedis() },
      { key: 'storage', label: 'Storage', group: 'INFRAESTRUTURA', run: () => this.probeStorage() },
      {
        key: 'external',
        label: 'Serviços externos',
        group: 'EXTERNO',
        run: () => this.probeExternal(),
      },
      {
        key: 'workers',
        label: 'Workers',
        group: 'PROCESSAMENTO',
        run: () => this.probeWorkers(queueSnap),
      },
      {
        key: 'queues',
        label: 'Filas',
        group: 'PROCESSAMENTO',
        run: () => this.probeQueues(queueSnap),
      },
      { key: 'cron', label: 'Cron jobs', group: 'PROCESSAMENTO', run: () => this.probeCron() },
    ];
    return Promise.all(
      defs.map(async d => {
        let r: ProbeResult;
        try {
          r = await d.run();
        } catch (e) {
          r = down(`Sonda falhou: ${errMsg(e)}`);
        }
        return {
          key: d.key,
          label: d.label,
          group: d.group,
          ...r,
          statusLabel: r.status ? STATUS_LABEL[r.status] : 'Não monitorizado',
          checkedAt,
        };
      }),
    );
  }

  private record(components: HealthComponent[]) {
    const at = Date.now();
    for (const c of components) {
      if (!c.status) continue;
      const h = this.history.get(c.key) ?? [];
      h.push({ at, status: c.status });
      if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
      this.history.set(c.key, h);
    }
  }

  /** Corre as sondas (partilha a execução em curso) e regista no histórico. */
  async refresh(): Promise<HealthComponent[]> {
    if (this.inflight === null) {
      this.inflight = this.runProbes()
        .then(components => {
          this.last = { at: Date.now(), components };
          this.record(components);
          return components;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  /** Último resultado com no máximo CACHE_TTL_MS; `fresh` força novas sondas. */
  async current(fresh = false): Promise<{ components: HealthComponent[]; at: number }> {
    if (!fresh && this.last && Date.now() - this.last.at < CACHE_TTL_MS) return this.last;
    const components = await this.refresh();
    return { components, at: this.last?.at ?? Date.now() };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledProbe() {
    try {
      await this.refresh();
    } catch (err) {
      this.logger.warn(`Health check agendado falhou: ${errMsg(err)}`);
    }
  }

  async getHealth(fresh = false) {
    const { components, at } = await this.current(fresh);
    const monitored = components.filter(c => c.status !== null);
    const overall = worstStatus(monitored.map(c => c.status));
    const reasons = monitored
      .filter(c => STATUS_RANK[c.status] >= STATUS_RANK.DEGRADADO)
      .map(c => `${c.label}: ${c.statusLabel.toLowerCase()} — ${c.detail}`);

    const counts = monitored.reduce<Record<MonitoringStatus, number>>(
      (acc, c) => ({
        ...acc,
        [c.status]: acc[c.status] + 1,
      }),
      { NORMAL: 0, ATENCAO: 0, DEGRADADO: 0, CRITICO: 0, INDISPONIVEL: 0 },
    );

    return {
      generatedAt: new Date(at).toISOString(),
      overall: { status: overall, statusLabel: STATUS_LABEL[overall], reasons },
      summary: {
        total: components.length,
        monitored: monitored.length,
        notMonitored: components.length - monitored.length,
        counts,
      },
      components: components.map(c => {
        const h = this.history.get(c.key) ?? [];
        return {
          ...c,
          uptimePercent24h: uptimePercent(h),
          samples24h: h.length,
        };
      }),
      note: 'A disponibilidade 24 h usa as amostras desde o último arranque desta instância (1/min); não é um SLA contratual.',
    };
  }
}
