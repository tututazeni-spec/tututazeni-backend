// modulo_scalability.md §7-9 — abas API & Backend e Base de Dados.
//
// API: lê o histograma Prometheus `http_request_duration_seconds` (já
// alimentado pelo MetricsInterceptor global) — acumulado desde o arranque do
// processo; os débitos (req/s, req/min) vêm do delta entre amostras em memória.
// BD: consultas a pg_stat_* + histórico de tamanho em DatabaseSizeSample.

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { register } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';

interface HistogramValue {
  labels: Record<string, string | number>;
  value: number;
  metricName?: string;
}

interface RouteAgg {
  method: string;
  route: string;
  count: number;
  sum: number;
  c4xx: number;
  c5xx: number;
  timeouts: number;
  buckets: Map<number, number>; // le → contagem cumulativa
}

interface CountSample {
  at: number;
  requests: number;
  errors5xx: number;
  queries: number;
  txs: number;
  blksRead: number;
}

const WINDOW_MS = 5 * 60 * 1000;
const SLOW_REQUEST_S = 1;

@Injectable()
export class ScalabilityInfraService {
  private readonly logger = new Logger(ScalabilityInfraService.name);
  private samples: CountSample[] = [];

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // helpers
  // ============================================================

  private async histogram(name: string): Promise<HistogramValue[]> {
    const metric = register.getSingleMetric(name);
    if (!metric) return [];
    const data = await (metric as unknown as {
      get: () => Promise<{ values: HistogramValue[] }>;
    }).get();
    return data.values;
  }

  /** Percentil por interpolação linear dentro do bucket (como o histogram_quantile). */
  private quantile(q: number, buckets: Map<number, number>, count: number): number {
    if (count <= 0) return 0;
    const rank = q * count;
    const les = [...buckets.keys()].sort((a, b) => a - b);
    let prevLe = 0;
    let prevCount = 0;
    for (const le of les) {
      const c = buckets.get(le) ?? 0;
      if (c >= rank) {
        if (!Number.isFinite(le)) return prevLe;
        const span = c - prevCount;
        return span <= 0 ? le : prevLe + ((le - prevLe) * (rank - prevCount)) / span;
      }
      prevLe = Number.isFinite(le) ? le : prevLe;
      prevCount = c;
    }
    return prevLe;
  }

  private ms(seconds: number): number {
    return Math.round(seconds * 1000 * 10) / 10;
  }

  private round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  private async countersNow(): Promise<CountSample> {
    const http = await this.histogram('http_request_duration_seconds');
    let requests = 0;
    let errors5xx = 0;
    for (const v of http) {
      if (v.metricName !== 'http_request_duration_seconds_count') continue;
      requests += v.value;
      if (Number(v.labels.status_code) >= 500) errors5xx += v.value;
    }
    const prismaVals = await this.histogram('prisma_query_duration_seconds');
    const queries = prismaVals
      .filter((v) => v.metricName === 'prisma_query_duration_seconds_count')
      .reduce((s, v) => s + v.value, 0);
    let txs = 0;
    let blksRead = 0;
    try {
      const rows = await this.prisma.$queryRaw<
        { tx: bigint; blks_read: bigint }[]
      >`SELECT (xact_commit + xact_rollback) AS tx, blks_read
        FROM pg_stat_database WHERE datname = current_database()`;
      txs = Number(rows[0]?.tx ?? 0);
      blksRead = Number(rows[0]?.blks_read ?? 0);
    } catch {
      /* sem acesso a pg_stat_database */
    }
    return { at: Date.now(), requests, errors5xx, queries, txs, blksRead };
  }

  private pushSample(s: CountSample) {
    this.samples.push(s);
    const cutoff = s.at - 60 * 60 * 1000;
    this.samples = this.samples.filter((x) => x.at >= cutoff);
  }

  /** Taxa por segundo entre a amostra mais antiga dentro da janela e a actual. */
  private rate(
    now: CountSample,
    pick: (s: CountSample) => number,
  ): number | null {
    const base = this.samples.find((s) => now.at - s.at <= WINDOW_MS && s.at < now.at);
    if (!base) return null;
    const dt = (now.at - base.at) / 1000;
    const delta = pick(now) - pick(base);
    if (dt < 5 || delta < 0) return null; // reinício de contadores
    return delta / dt;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sampleCounters() {
    try {
      this.pushSample(await this.countersNow());
    } catch (err: unknown) {
      this.logger.warn(`Falha a amostrar contadores: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ============================================================
  // §7 API & Backend
  // ============================================================

  async getApiMetrics() {
    const values = await this.histogram('http_request_duration_seconds');
    const byRoute = new Map<string, RouteAgg>();
    for (const v of values) {
      const { method, route, status_code, le } = v.labels;
      const key = `${method} ${route}`;
      let agg = byRoute.get(key);
      if (!agg) {
        agg = {
          method: String(method),
          route: String(route),
          count: 0,
          sum: 0,
          c4xx: 0,
          c5xx: 0,
          timeouts: 0,
          buckets: new Map(),
        };
        byRoute.set(key, agg);
      }
      const status = Number(status_code);
      if (v.metricName === 'http_request_duration_seconds_count') {
        agg.count += v.value;
        if (status >= 500) agg.c5xx += v.value;
        else if (status >= 400) agg.c4xx += v.value;
        if (status === 408 || status === 504) agg.timeouts += v.value;
      } else if (v.metricName === 'http_request_duration_seconds_sum') {
        agg.sum += v.value;
      } else if (v.metricName === 'http_request_duration_seconds_bucket') {
        const bound = le === '+Inf' ? Infinity : Number(le);
        agg.buckets.set(bound, (agg.buckets.get(bound) ?? 0) + v.value);
      }
    }

    const global = {
      count: 0,
      sum: 0,
      c4xx: 0,
      c5xx: 0,
      timeouts: 0,
      slow: 0,
      buckets: new Map<number, number>(),
    };
    const endpoints = [...byRoute.values()]
      .filter((a) => a.count > 0 && a.route !== 'unknown')
      .map((a) => {
        const p95 = this.quantile(0.95, a.buckets, a.count);
        const underSlow = a.buckets.get(SLOW_REQUEST_S) ?? a.count;
        const errorRate = ((a.c4xx + a.c5xx) / a.count) * 100;
        const serverErrorRate = (a.c5xx / a.count) * 100;
        const status: 'OK' | 'ATENCAO' | 'CRITICO' =
          p95 > 1.5 || serverErrorRate >= 5
            ? 'CRITICO'
            : p95 > 0.5 || serverErrorRate >= 1
              ? 'ATENCAO'
              : 'OK';
        return {
          endpoint: `${a.method} ${a.route}`,
          requests: a.count,
          avgMs: this.ms(a.sum / a.count),
          p95Ms: this.ms(p95),
          errorRate: this.round1(errorRate),
          errors5xx: a.c5xx,
          slowRequests: Math.max(a.count - underSlow, 0),
          status,
        };
      })
      .sort((x, y) => y.requests - x.requests);

    for (const a of byRoute.values()) {
      global.count += a.count;
      global.sum += a.sum;
      global.c4xx += a.c4xx;
      global.c5xx += a.c5xx;
      global.timeouts += a.timeouts;
      global.slow += Math.max(a.count - (a.buckets.get(SLOW_REQUEST_S) ?? a.count), 0);
      for (const [le, c] of a.buckets) global.buckets.set(le, (global.buckets.get(le) ?? 0) + c);
    }

    const now = await this.countersNow();
    const rps = this.rate(now, (s) => s.requests);
    this.pushSample(now);
    const errRps = this.rate(now, (s) => s.errors5xx);

    return {
      sinceProcessStartSeconds: Math.round(process.uptime()),
      totals: {
        requests: global.count,
        avgLatencyMs: global.count ? this.ms(global.sum / global.count) : 0,
        p50Ms: this.ms(this.quantile(0.5, global.buckets, global.count)),
        p95Ms: this.ms(this.quantile(0.95, global.buckets, global.count)),
        p99Ms: this.ms(this.quantile(0.99, global.buckets, global.count)),
        http4xx: global.c4xx,
        http5xx: global.c5xx,
        errorRate: global.count
          ? this.round1(((global.c4xx + global.c5xx) / global.count) * 100)
          : 0,
        timeouts: global.timeouts,
        slowRequests: global.slow,
        slowThresholdMs: SLOW_REQUEST_S * 1000,
        // O tempo de processamento é a própria duração medida pelo interceptor.
        avgProcessingMs: global.count ? this.ms(global.sum / global.count) : 0,
      },
      rates: {
        requestsPerSecond: rps === null ? null : this.round1(rps),
        requestsPerMinute: rps === null ? null : Math.round(rps * 60),
        // Throughput em pedidos/s (não há contagem de bytes servidos).
        throughputRps: rps === null ? null : this.round1(rps),
        errors5xxPerMinute: errRps === null ? null : this.round1(errRps * 60),
        windowSeconds: WINDOW_MS / 1000,
      },
      // Sem gauge de pedidos em curso no interceptor.
      concurrentRequests: null as number | null,
      endpoints: endpoints.slice(0, 50),
    };
  }

  // ============================================================
  // §8-9 Base de Dados
  // ============================================================

  @Cron(CronExpression.EVERY_HOUR)
  async sampleDatabaseSize() {
    try {
      await this.recordSizeSample();
    } catch (err: unknown) {
      this.logger.warn(`Falha a amostrar tamanho da BD: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async recordSizeSample() {
    const [size] = await this.prisma.$queryRaw<{ bytes: bigint }[]>`
      SELECT pg_database_size(current_database()) AS bytes`;
    const tables = await this.prisma.$queryRaw<{ name: string; bytes: bigint }[]>`
      SELECT relname AS name, pg_total_relation_size(relid) AS bytes
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 30`;
    await this.prisma.databaseSizeSample.create({
      data: {
        sizeBytes: size.bytes,
        tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes) })),
      },
    });
  }

  async getDatabaseMetrics() {
    // Garante pelo menos uma amostra recente (o cron é horário).
    const last = await this.prisma.databaseSizeSample.findFirst({
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true },
    });
    if (!last || Date.now() - last.capturedAt.getTime() > 60 * 60 * 1000) {
      await this.recordSizeSample().catch(() => undefined);
    }

    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err: unknown) {
        this.logger.warn(`Consulta pg_stat falhou: ${err instanceof Error ? err.message : err}`);
        return fallback;
      }
    };

    const [conn, dbStat, locks, tables, indexes, unusedIdx, slow] = await Promise.all([
      safe(
        () =>
          this.prisma.$queryRaw<{ total: number; active: number; idle: number; max: number }[]>`
            SELECT count(*)::int AS total,
                   count(*) FILTER (WHERE state = 'active')::int AS active,
                   count(*) FILTER (WHERE state = 'idle')::int AS idle,
                   current_setting('max_connections')::int AS max
            FROM pg_stat_activity WHERE datname = current_database()`,
        [],
      ),
      safe(
        () =>
          this.prisma.$queryRaw<
            { deadlocks: bigint; blks_hit: bigint; blks_read: bigint; size: bigint }[]
          >`SELECT deadlocks, blks_hit, blks_read, pg_database_size(datname) AS size
            FROM pg_stat_database WHERE datname = current_database()`,
        [],
      ),
      safe(
        () =>
          this.prisma.$queryRaw<{ waiting: number }[]>`
            SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`,
        [],
      ),
      safe(
        () =>
          this.prisma.$queryRaw<{ name: string; bytes: bigint; rows: bigint }[]>`
            SELECT relname AS name, pg_total_relation_size(relid) AS bytes, n_live_tup AS rows
            FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10`,
        [],
      ),
      safe(
        () =>
          this.prisma.$queryRaw<{ total: number }[]>`
            SELECT count(*)::int AS total FROM pg_stat_user_indexes`,
        [],
      ),
      safe(
        () =>
          this.prisma.$queryRaw<{ table: string; index: string; bytes: bigint }[]>`
            SELECT s.relname AS "table", s.indexrelname AS "index",
                   pg_relation_size(s.indexrelid) AS bytes
            FROM pg_stat_user_indexes s
            JOIN pg_index i ON i.indexrelid = s.indexrelid
            WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
            ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 10`,
        [],
      ),
      safe(
        () =>
          this.prisma.$queryRaw<
            { query: string; calls: bigint; mean_ms: number; max_ms: number; total_ms: number }[]
          >`SELECT left(query, 160) AS query, calls, mean_exec_time AS mean_ms,
                   max_exec_time AS max_ms, total_exec_time AS total_ms
            FROM pg_stat_statements
            WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
            ORDER BY mean_exec_time DESC LIMIT 10`,
        null,
      ),
    ]);

    const now = await this.countersNow();
    const txPerSec = this.rate(now, (s) => s.txs);
    const queriesPerSec = this.rate(now, (s) => s.queries);
    const blksReadPerSec = this.rate(now, (s) => s.blksRead);
    this.pushSample(now);

    // Prisma: duração agregada de todas as queries da aplicação desde o arranque.
    const prismaVals = await this.histogram('prisma_query_duration_seconds');
    const pBuckets = new Map<number, number>();
    let pCount = 0;
    let pSum = 0;
    for (const v of prismaVals) {
      if (v.metricName === 'prisma_query_duration_seconds_count') pCount += v.value;
      else if (v.metricName === 'prisma_query_duration_seconds_sum') pSum += v.value;
      else if (v.metricName === 'prisma_query_duration_seconds_bucket') {
        const bound = v.labels.le === '+Inf' ? Infinity : Number(v.labels.le);
        pBuckets.set(bound, (pBuckets.get(bound) ?? 0) + v.value);
      }
    }
    const slowUnder = pBuckets.get(0.5) ?? pCount;

    const c = conn[0];
    const d = dbStat[0];
    const hit = d ? Number(d.blks_hit) : 0;
    const read = d ? Number(d.blks_read) : 0;
    const poolMax = parseInt(process.env.DB_POOL_MAX || '50', 10);

    // ─── Crescimento (§9) ───
    const samples = await this.prisma.databaseSizeSample.findMany({
      where: { capturedAt: { gte: new Date(Date.now() - 366 * 86_400_000) } },
      orderBy: { capturedAt: 'asc' },
      select: { capturedAt: true, sizeBytes: true, tables: true },
    });
    const GB = 1024 ** 3;
    const toGb = (b: number) => Math.round((b / GB) * 1000) / 1000;
    const latest = samples[samples.length - 1];
    const windowGrowth = (days: number) => {
      if (!latest) return null;
      const from = latest.capturedAt.getTime() - days * 86_400_000;
      const base = samples.find((s) => s.capturedAt.getTime() >= from);
      if (!base || base === latest) return null;
      const covered = (latest.capturedAt.getTime() - base.capturedAt.getTime()) / 86_400_000;
      return {
        growthGb: toGb(Number(latest.sizeBytes) - Number(base.sizeBytes)),
        coverageDays: Math.round(covered * 10) / 10,
      };
    };
    const windows = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 } as const;
    const series = Object.fromEntries(
      Object.entries(windows).map(([key, days]) => {
        const from = Date.now() - days * 86_400_000;
        const perDay = new Map<string, number>();
        for (const s of samples) {
          if (s.capturedAt.getTime() < from) continue;
          perDay.set(s.capturedAt.toISOString().slice(0, 10), toGb(Number(s.sizeBytes)));
        }
        return [key, [...perDay.entries()].map(([day, gb]) => ({ day, gb }))];
      }),
    );

    const first = samples[0];
    let forecast: {
      currentGb: number;
      avgGrowthGbPerMonth: number;
      projectedGb12m: number;
      basedOnDays: number;
    } | null = null;
    if (first && latest && first !== latest) {
      const days = (latest.capturedAt.getTime() - first.capturedAt.getTime()) / 86_400_000;
      if (days >= 1) {
        const perMonth =
          ((Number(latest.sizeBytes) - Number(first.sizeBytes)) / GB / days) * 30;
        const currentGb = toGb(Number(latest.sizeBytes));
        forecast = {
          currentGb,
          avgGrowthGbPerMonth: Math.round(perMonth * 1000) / 1000,
          projectedGb12m: Math.round((currentGb + perMonth * 12) * 100) / 100,
          basedOnDays: Math.round(days * 10) / 10,
        };
      }
    }

    // Tabelas que mais crescem: diferença entre a amostra mais antiga e a última.
    type TableSize = { name: string; bytes: number };
    const tableMap = (s?: { tables: unknown }) =>
      new Map(((s?.tables as TableSize[] | null) ?? []).map((t) => [t.name, t.bytes]));
    const firstTables = tableMap(first);
    const growingTables =
      first && latest && first !== latest
        ? [...tableMap(latest).entries()]
            .map(([name, bytes]) => ({
              name,
              growthMb: Math.round(((bytes - (firstTables.get(name) ?? 0)) / 1024 ** 2) * 100) / 100,
            }))
            .filter((t) => t.growthMb > 0)
            .sort((a, b) => b.growthMb - a.growthMb)
            .slice(0, 10)
        : [];

    return {
      // CPU/RAM/IOPS reais do servidor de BD não são acessíveis por SQL.
      host: { cpuPercent: null as number | null, ramPercent: null as number | null },
      storage: { sizeGb: d ? toGb(Number(d.size)) : 0 },
      connections: {
        active: c?.active ?? 0,
        idle: c?.idle ?? 0,
        total: c?.total ?? 0,
        max: c?.max ?? 0,
        usagePercent: c && c.max > 0 ? this.round1((c.total / c.max) * 100) : 0,
      },
      pool: { max: poolMax },
      throughput: {
        queriesPerSecond: queriesPerSec === null ? null : this.round1(queriesPerSec),
        transactionsPerSecond: txPerSec === null ? null : this.round1(txPerSec),
        // IOPS aproximado: leituras de blocos a disco (misses de cache) por segundo.
        readIops: blksReadPerSec === null ? null : this.round1(blksReadPerSec),
      },
      health: {
        waitingLocks: locks[0]?.waiting ?? 0,
        deadlocks: d ? Number(d.deadlocks) : 0,
        cacheHitRatio: hit + read > 0 ? this.round1((hit / (hit + read)) * 100) : null,
      },
      queries: {
        appTotal: pCount,
        appAvgMs: pCount ? this.ms(pSum / pCount) : 0,
        appP95Ms: this.ms(this.quantile(0.95, pBuckets, pCount)),
        slowCount: Math.max(pCount - slowUnder, 0),
        slowThresholdMs: 500,
      },
      slowQueries: slow
        ? {
            source: 'pg_stat_statements' as const,
            rows: slow.map((q) => ({
              query: q.query,
              calls: Number(q.calls),
              meanMs: this.round1(q.mean_ms),
              maxMs: this.round1(q.max_ms),
            })),
          }
        : null, // extensão pg_stat_statements não instalada
      indexes: {
        total: indexes[0]?.total ?? 0,
        unusedCount: unusedIdx.length,
        unused: unusedIdx.map((i) => ({
          table: i.table,
          index: i.index,
          sizeMb: Math.round((Number(i.bytes) / 1024 ** 2) * 100) / 100,
        })),
      },
      largestTables: tables.map((t) => ({
        name: t.name,
        sizeMb: Math.round((Number(t.bytes) / 1024 ** 2) * 100) / 100,
        rows: Number(t.rows),
      })),
      growth: {
        daily: windowGrowth(1),
        monthly: windowGrowth(30),
        yearly: windowGrowth(365),
        series,
        forecast,
        growingTables,
        samples: samples.length,
      },
    };
  }
}
