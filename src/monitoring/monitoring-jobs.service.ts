// modulo_monitoring.md §10 — Jobs & Background Tasks.
//
// Só lê. Duas fontes de "jobs de sistema":
//  - filas Bull (audit, email, notifications, webhooks): executados (completed),
//    em execução (active), falhados (failed), agendados (delayed) e em espera;
//  - cron jobs do @nestjs/schedule: próxima execução e última execução.
// As execuções do módulo Automation têm vista própria (§4) e entram aqui só como
// contagem, para a Visão Geral dos jobs não as duplicar.
//
// Definições:
//  - duração = finishedOn − processedOn (ms), só jobs terminados;
//  - retry = attemptsMade > 1 (ou, num job falhado com tentativas restantes, o
//    próximo retry está implícito em `attempts − attemptsMade`);
//  - próxima execução de um job agendado = timestamp + opts.delay.
// O payload (`job.data`) nunca é devolvido: contém e-mails/dados pessoais.
// Limitações: as listas dependem de o Bull reter jobs (removeOnComplete/Fail) e,
// com várias instâncias, os crons só descrevem esta instância.

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Job, JobStatus, Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { percent } from './monitoring-status';

const QUEUE_TIMEOUT_MS = 2500;
const PER_STATE = 15;
const DURATION_SAMPLE = 200;

export const JOB_STATES = ['active', 'failed', 'delayed', 'waiting', 'completed'] as const;
export type JobState = (typeof JOB_STATES)[number];

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<never>((_, rej) => {
      t = setTimeout(() => rej(new Error(`timeout (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

export interface JobView {
  id: string;
  queue: string;
  name: string;
  state: JobState;
  attemptsMade: number;
  attemptsMax: number;
  retrying: boolean;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  nextRunAt: string | null;
  error: string | null;
}

const iso = (ms?: number | null) => (ms ? new Date(ms).toISOString() : null);

export function toJobView(queue: string, state: JobState, job: Job): JobView {
  const attemptsMax = job.opts.attempts ?? 1;
  const processedOn = job.processedOn ?? null;
  const finishedOn = job.finishedOn ?? null;
  return {
    id: String(job.id),
    queue,
    name: job.name,
    state,
    attemptsMade: job.attemptsMade,
    attemptsMax,
    // falhou e ainda tem tentativas: o Bull volta a pô-lo em delayed/waiting
    retrying: job.attemptsMade > 1 || (state === 'failed' && job.attemptsMade < attemptsMax),
    createdAt: iso(job.timestamp),
    startedAt: iso(processedOn),
    finishedAt: iso(finishedOn),
    durationMs: processedOn && finishedOn ? Math.max(0, finishedOn - processedOn) : null,
    nextRunAt: state === 'delayed' ? iso(job.timestamp + (job.opts.delay ?? 0)) : null,
    error: job.failedReason ? job.failedReason.slice(0, 300) : null,
  };
}

@Injectable()
export class MonitoringJobsService {
  private readonly queues: { key: string; queue: Queue }[];

  constructor(
    private readonly prisma: PrismaService,
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

  private async inspectQueue(key: string, queue: Queue, states: readonly JobState[]) {
    try {
      const counts = await withTimeout(queue.getJobCounts(), QUEUE_TIMEOUT_MS);
      const lists = await Promise.all(
        states.map(async state => {
          if ((counts[state] ?? 0) === 0) return [] as JobView[];
          // completed/failed: os mais recentes estão no fim da lista do Redis.
          const recent = state === 'completed' || state === 'failed';
          const jobs = await withTimeout(
            queue.getJobs([state as JobStatus], 0, PER_STATE - 1, !recent),
            QUEUE_TIMEOUT_MS,
          );
          return jobs.filter(Boolean).map(j => toJobView(key, state, j));
        }),
      );
      return {
        key,
        available: true as const,
        counts: {
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
        },
        jobs: lists.flat(),
      };
    } catch (e) {
      return {
        key,
        available: false as const,
        counts: { active: 0, waiting: 0, delayed: 0, failed: 0, completed: 0 },
        jobs: [] as JobView[],
        error: e instanceof Error ? e.message : 'erro desconhecido',
      };
    }
  }

  private crons() {
    return [...this.scheduler.getCronJobs().entries()]
      .map(([name, job]) => {
        let nextRunAt: string | null = null;
        try {
          nextRunAt = job.nextDate().toJSDate().toISOString();
        } catch {
          /* cron sem próxima data */
        }
        return {
          name,
          running: job.running,
          lastRunAt: job.lastDate()?.toISOString() ?? null,
          nextRunAt,
        };
      })
      .sort((a, b) => (a.nextRunAt ?? '9').localeCompare(b.nextRunAt ?? '9'));
  }

  async getJobs(state?: JobState) {
    const wanted = state ? [state] : JOB_STATES;
    const now = new Date();
    const since24 = new Date(now.getTime() - 86_400_000);

    const [queues, autoRunning, autoPending, autoFailed24] = await Promise.all([
      Promise.all(this.queues.map(q => this.inspectQueue(q.key, q.queue, wanted))),
      this.prisma.read.automationExecution.count({ where: { status: 'RUNNING' } }),
      this.prisma.read.automationExecution.count({
        where: { status: { in: ['PENDING', 'WAITING_APPROVAL'] } },
      }),
      this.prisma.read.automationExecution.count({
        where: { startedAt: { gte: since24 }, status: 'FAILED' },
      }),
    ]);

    const jobs = queues.flatMap(q => q.jobs);
    const byRecent = (a: JobView, b: JobView) =>
      (b.finishedAt ?? b.startedAt ?? b.createdAt ?? '').localeCompare(
        a.finishedAt ?? a.startedAt ?? a.createdAt ?? '',
      );
    const pick = (s: JobState) => jobs.filter(j => j.state === s).sort(byRecent);

    const durations = jobs
      .filter(j => j.durationMs !== null && j.state === 'completed')
      .slice(0, DURATION_SAMPLE)
      .map(j => j.durationMs as number);
    const avgDurationMs = durations.length
      ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
      : null;

    const total = (k: keyof (typeof queues)[number]['counts']) =>
      queues.reduce((s, q) => s + q.counts[k], 0);
    const completed = total('completed');
    const failed = total('failed');
    const crons = this.crons();
    const nextCron = crons.find(c => c.running && c.nextRunAt) ?? null;
    const delayedNext = pick('delayed')
      .filter(j => j.nextRunAt)
      .sort((a, b) => (a.nextRunAt as string).localeCompare(b.nextRunAt as string))[0];

    return {
      generatedAt: now.toISOString(),
      summary: {
        executed: completed,
        running: total('active'),
        waiting: total('waiting'),
        failed,
        scheduled: total('delayed'),
        // sobre os jobs que o Bull ainda retém (completed + failed)
        successRatePercent: percent(completed, completed + failed),
        avgDurationMs,
        retrying: jobs.filter(j => j.retrying).length,
        cronJobs: crons.length,
        cronJobsStopped: crons.filter(c => !c.running).length,
        nextExecutionAt:
          [nextCron?.nextRunAt, delayedNext?.nextRunAt].filter((x): x is string => !!x).sort()[0] ??
          null,
        queuesUnavailable: queues.filter(q => !q.available).length,
      },
      queues: queues.map(({ jobs: _jobs, ...q }) => q),
      running: pick('active'),
      failed: pick('failed'),
      scheduled: pick('delayed').sort((a, b) =>
        (a.nextRunAt as string).localeCompare(b.nextRunAt as string),
      ),
      waiting: pick('waiting'),
      executed: pick('completed'),
      crons,
      automations: {
        running: autoRunning,
        pending: autoPending,
        failed24h: autoFailed24,
        note: 'Detalhe das execuções de automações na aba Automações.',
      },
      note: 'Os jobs listados são os que o Bull ainda retém; o payload não é exposto. Os cron jobs descrevem apenas esta instância.',
    };
  }
}
