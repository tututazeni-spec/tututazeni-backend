// modulo_scalability.md §11 — aba Filas & Jobs.
//
// Fontes reais: as filas Bull (audit, email, notifications, webhooks) e, para
// os domínios que correm como jobs mas não passam por Bull, as tabelas
// AutomationExecution e IntegrationSyncLog. O histórico de Queue Depth é
// amostrado de minuto a minuto em memória (perde-se num reinício).

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';

interface QueueDef {
  key: string;
  label: string;
  domain: string;
  queue: Queue;
}

interface DepthSample {
  at: number;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  byQueue: Record<string, number>;
}

const HISTORY_MS = 6 * 60 * 60 * 1000;
const THROUGHPUT_WINDOW_MS = 5 * 60 * 1000;
const RECENT_JOBS = 200;
// §11 — domínios listados no documento que hoje não têm fila nem tabela de jobs.
const SYNCHRONOUS_DOMAINS = [
  'Processes',
  'Payroll',
  'Reports',
  'Imports',
  'Exports',
  'AI Tutor',
  'Avatar Training',
];

@Injectable()
export class ScalabilityQueuesService {
  private readonly logger = new Logger(ScalabilityQueuesService.name);
  private history: DepthSample[] = [];
  private readonly defs: QueueDef[];

  constructor(
    @InjectQueue('audit') audit: Queue,
    @InjectQueue('email') email: Queue,
    @InjectQueue('notifications') notifications: Queue,
    @InjectQueue('webhooks') webhooks: Queue,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.defs = [
      { key: 'audit', label: 'Auditoria', domain: 'Audit', queue: audit },
      { key: 'email', label: 'Email', domain: 'Notifications', queue: email },
      {
        key: 'notifications',
        label: 'Notificações',
        domain: 'Notifications',
        queue: notifications,
      },
      { key: 'webhooks', label: 'Webhooks', domain: 'Integrações', queue: webhooks },
    ];
  }

  private get queuesEnabled(): boolean {
    return this.config.get<string>('QUEUE_ENABLED', 'true') !== 'false';
  }

  private round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  private async queueStats(def: QueueDef, now: number) {
    const [counts, completed, failed] = await Promise.all([
      def.queue.getJobCounts(),
      def.queue.getCompleted(0, RECENT_JOBS - 1),
      def.queue.getFailed(0, RECENT_JOBS - 1),
    ]);
    const durations = completed
      .filter(j => j.finishedOn && j.processedOn)
      .map(j => (j.finishedOn as number) - (j.processedOn as number));
    const recentlyDone = completed.filter(
      j => j.finishedOn && now - j.finishedOn <= THROUGHPUT_WINDOW_MS,
    ).length;
    // Um job concluído à primeira tem attemptsMade 1; o resto são retries.
    const retries = [...completed, ...failed].reduce(
      (s, j) => s + Math.max(0, (j.attemptsMade ?? 0) - 1),
      0,
    );
    const lastFailed = failed[0];
    return {
      key: def.key,
      label: def.label,
      domain: def.domain,
      waiting: counts.waiting,
      active: counts.active,
      delayed: counts.delayed,
      failed: counts.failed,
      completed: counts.completed,
      queueSize: counts.waiting + counts.delayed,
      avgDurationMs: durations.length
        ? this.round1(durations.reduce((s, v) => s + v, 0) / durations.length)
        : null,
      throughputPerMin: this.round1(recentlyDone / (THROUGHPUT_WINDOW_MS / 60_000)),
      retries,
      lastFailure: lastFailed
        ? {
            at: lastFailed.finishedOn ? new Date(lastFailed.finishedOn).toISOString() : null,
            reason: lastFailed.failedReason ?? null,
          }
        : null,
    };
  }

  private async dbJobs() {
    const now = Date.now();
    const since = new Date(now - 24 * 3_600_000);
    const [auto, autoAvg, sync] = await Promise.all([
      this.prisma.automationExecution.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { startedAt: { gte: since } },
      }),
      this.prisma.automationExecution.findMany({
        where: { status: 'SUCCESS', finishedAt: { not: null }, startedAt: { gte: since } },
        select: { startedAt: true, finishedAt: true },
        take: RECENT_JOBS,
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.integrationSyncLog.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { startedAt: { gte: since } },
      }),
    ]);
    const count = (rows: { status: string; _count: { _all: number } }[], ...s: string[]) =>
      rows.filter(r => s.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
    const autoDurations = autoAvg.map(
      e => (e.finishedAt as Date).getTime() - e.startedAt.getTime(),
    );
    const delayedAuto = await this.prisma.automationExecution.count({
      where: { status: 'PENDING', nextRetryAt: { lt: new Date(now - 60_000) } },
    });
    const retriedAuto = await this.prisma.automationExecution.count({
      where: { startedAt: { gte: since }, attempt: { gt: 1 } },
    });
    return [
      {
        key: 'automations',
        label: 'Automações',
        domain: 'Automations',
        executed: count(auto, 'SUCCESS', 'FAILED', 'SKIPPED'),
        pending: count(auto, 'PENDING', 'WAITING_APPROVAL'),
        running: count(auto, 'RUNNING'),
        failed: count(auto, 'FAILED'),
        delayed: delayedAuto,
        avgDurationMs: autoDurations.length
          ? this.round1(autoDurations.reduce((s, v) => s + v, 0) / autoDurations.length)
          : null,
        retries: retriedAuto,
      },
      {
        key: 'integration-sync',
        label: 'Sincronizações de integrações',
        domain: 'Integrações',
        executed: count(sync, 'SUCCESS', 'PARTIAL', 'FAILED'),
        pending: 0,
        running: count(sync, 'RUNNING'),
        failed: count(sync, 'FAILED'),
        delayed: 0,
        avgDurationMs: null as number | null,
        retries: 0,
      },
    ];
  }

  private pushSample(s: DepthSample) {
    this.history.push(s);
    const cutoff = s.at - HISTORY_MS;
    this.history = this.history.filter(x => x.at >= cutoff);
  }

  private async depthNow(): Promise<DepthSample> {
    const byQueue: Record<string, number> = {};
    let waiting = 0;
    let active = 0;
    let delayed = 0;
    let failed = 0;
    for (const def of this.defs) {
      const c = await def.queue.getJobCounts();
      byQueue[def.key] = c.waiting + c.delayed;
      waiting += c.waiting;
      active += c.active;
      delayed += c.delayed;
      failed += c.failed;
    }
    return { at: Date.now(), waiting, active, delayed, failed, byQueue };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sampleDepth() {
    if (!this.queuesEnabled) return;
    try {
      this.pushSample(await this.depthNow());
    } catch (err: unknown) {
      this.logger.warn(
        `Falha a amostrar profundidade das filas: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async getQueueMetrics() {
    const now = Date.now();
    const dbJobs = await this.dbJobs();

    let queues: Awaited<ReturnType<ScalabilityQueuesService['queueStats']>>[] = [];
    let redisAvailable = this.queuesEnabled;
    if (this.queuesEnabled) {
      try {
        queues = await Promise.all(this.defs.map(d => this.queueStats(d, now)));
        // Garante um ponto actual no gráfico mesmo antes do primeiro cron.
        if (!this.history.length) this.pushSample(await this.depthNow());
      } catch (err: unknown) {
        redisAvailable = false;
        this.logger.warn(`Filas Bull indisponíveis: ${err instanceof Error ? err.message : err}`);
      }
    }

    const sum = (pick: (q: (typeof queues)[number]) => number) =>
      queues.reduce((s, q) => s + pick(q), 0);
    const durations = queues
      .filter(q => q.avgDurationMs !== null)
      .map(q => q.avgDurationMs as number);

    return {
      mode: this.queuesEnabled ? ('QUEUE' as const) : ('SYNC' as const),
      redisAvailable,
      totals: {
        executed: sum(q => q.completed) + dbJobs.reduce((s, j) => s + j.executed, 0),
        pending: sum(q => q.waiting) + dbJobs.reduce((s, j) => s + j.pending, 0),
        running: sum(q => q.active) + dbJobs.reduce((s, j) => s + j.running, 0),
        failed: sum(q => q.failed) + dbJobs.reduce((s, j) => s + j.failed, 0),
        delayed: sum(q => q.delayed) + dbJobs.reduce((s, j) => s + j.delayed, 0),
        avgDurationMs: durations.length
          ? this.round1(durations.reduce((s, v) => s + v, 0) / durations.length)
          : null,
        throughputPerMin: this.round1(sum(q => q.throughputPerMin)),
        queueSize: sum(q => q.queueSize),
        retries: sum(q => q.retries) + dbJobs.reduce((s, j) => s + j.retries, 0),
      },
      queues,
      dbJobs,
      synchronousDomains: SYNCHRONOUS_DOMAINS,
      depthHistory: this.history.map(h => ({
        at: new Date(h.at).toISOString(),
        waiting: h.waiting,
        active: h.active,
        delayed: h.delayed,
        failed: h.failed,
        total: h.waiting + h.delayed,
        byQueue: h.byQueue,
      })),
      historyHours: HISTORY_MS / 3_600_000,
    };
  }
}
