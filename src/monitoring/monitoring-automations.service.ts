// modulo_monitoring.md §4 — Automações (ligação ao módulo Automation).
//
// Só lê: AutomationRule / AutomationExecution / AutomationSchedule /
// AutomationDeadLetter. O Monitoring não executa nem altera automações.
//
// Definições (os números dependem delas):
//  - janela: últimas 24h (execuções) e 7 dias (histórico por dia);
//  - sucesso/falha: ExecutionStatus SUCCESS / FAILED; taxa de sucesso =
//    SUCCESS / (SUCCESS + FAILED) — SKIPPED/CANCELLED não contam;
//  - pendentes: PENDING + WAITING_APPROVAL + fluxos em espera (resumeAt futuro);
//  - retry: execuções com attempt > 1 na janela, mais as que têm nextRetryAt agendado;
//  - tempo de execução: média de finishedAt − startedAt das execuções terminadas.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { percent } from './monitoring-status';

const H = 3_600_000;
const D = 24 * H;
const LIST_LIMIT = 15;
const DURATION_SAMPLE = 5000;

@Injectable()
export class MonitoringAutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  private round1(n: number) {
    return Math.round(n * 10) / 10;
  }

  async getAutomations() {
    const r = this.prisma.read;
    const now = new Date();
    const since24 = new Date(now.getTime() - D);
    const since7d = new Date(now.getTime() - 7 * D);

    const [
      total24,
      success24,
      failed24,
      running,
      pending,
      waitingFlows,
      retried24,
      retryScheduled,
      activeRules,
      deadLettersOpen,
      durationSample,
      failedByRule,
      recentFailures,
      recentExecutions,
      nextSchedules,
      schedulesInError,
      history7d,
    ] = await Promise.all([
      r.automationExecution.count({ where: { startedAt: { gte: since24 } } }),
      r.automationExecution.count({ where: { startedAt: { gte: since24 }, status: 'SUCCESS' } }),
      r.automationExecution.count({ where: { startedAt: { gte: since24 }, status: 'FAILED' } }),
      r.automationExecution.count({ where: { status: 'RUNNING' } }),
      r.automationExecution.count({ where: { status: { in: ['PENDING', 'WAITING_APPROVAL'] } } }),
      r.automationExecution.count({ where: { resumeAt: { gt: now }, status: 'RUNNING' } }),
      r.automationExecution.count({ where: { startedAt: { gte: since24 }, attempt: { gt: 1 } } }),
      r.automationExecution.count({ where: { nextRetryAt: { not: null, gt: now } } }),
      r.automationRule.count({ where: { isActive: true, active: true, draft: false } }),
      r.automationDeadLetter.count({ where: { status: 'OPEN' } }),
      r.automationExecution.findMany({
        where: { startedAt: { gte: since24 }, finishedAt: { not: null } },
        select: { startedAt: true, finishedAt: true },
        orderBy: { startedAt: 'desc' },
        take: DURATION_SAMPLE,
      }),
      r.automationExecution.groupBy({
        by: ['ruleId'],
        where: { startedAt: { gte: since24 }, status: 'FAILED' },
        _count: { _all: true },
        orderBy: { _count: { ruleId: 'desc' } },
        take: 5,
      }),
      r.automationExecution.findMany({
        where: { startedAt: { gte: since24 }, status: 'FAILED' },
        orderBy: { startedAt: 'desc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          startedAt: true,
          finishedAt: true,
          attempt: true,
          nextRetryAt: true,
          errorCode: true,
          errorMessage: true,
          errorStep: true,
          rule: { select: { id: true, name: true, module: true } },
        },
      }),
      r.automationExecution.findMany({
        orderBy: { startedAt: 'desc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          attempt: true,
          currentStep: true,
          rule: { select: { id: true, name: true } },
        },
      }),
      r.automationSchedule.findMany({
        where: { status: 'ACTIVE', nextRunAt: { not: null } },
        orderBy: { nextRunAt: 'asc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          name: true,
          nextRunAt: true,
          lastRunAt: true,
          lastRunStatus: true,
          rule: { select: { id: true, name: true } },
        },
      }),
      r.automationSchedule.count({ where: { status: 'ERROR' } }),
      r.automationExecution.findMany({
        where: { startedAt: { gte: since7d }, status: { in: ['SUCCESS', 'FAILED'] } },
        select: { startedAt: true, status: true },
        take: 50_000,
      }),
    ]);

    // nomes das regras com mais falhas (groupBy não traz relações)
    const ruleIds = failedByRule.map(g => g.ruleId);
    const rules = ruleIds.length
      ? await r.automationRule.findMany({
          where: { id: { in: ruleIds } },
          select: { id: true, name: true, lastRunAt: true, lastRunStatus: true },
        })
      : [];
    const ruleOf = new Map(rules.map(x => [x.id, x]));

    const durations = durationSample
      .filter(e => e.finishedAt)
      .map(e => e.finishedAt.getTime() - e.startedAt.getTime());
    const avgMs = durations.length
      ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
      : null;

    // histórico por dia (7d): sucesso vs falha
    const perDay = new Map<string, { success: number; failed: number }>();
    for (const e of history7d) {
      const day = e.startedAt.toISOString().slice(0, 10);
      const cur = perDay.get(day) ?? { success: 0, failed: 0 };
      if (e.status === 'SUCCESS') cur.success++;
      else cur.failed++;
      perDay.set(day, cur);
    }

    const lastExecution = recentExecutions[0] ?? null;
    const nextSchedule = nextSchedules[0] ?? null;

    return {
      generatedAt: now.toISOString(),
      windowHours: 24,
      summary: {
        activeRules,
        executed24h: total24,
        success24h: success24,
        failed24h: failed24,
        successRatePercent: percent(success24, success24 + failed24),
        running,
        pending,
        waitingFlows,
        retries24h: retried24,
        retriesScheduled: retryScheduled,
        deadLettersOpen,
        schedulesInError,
        avgExecutionMs: avgMs,
        lastExecutionAt: lastExecution?.startedAt ?? null,
        nextExecutionAt: nextSchedule?.nextRunAt ?? null,
      },
      failuresByRule: failedByRule.map(g => ({
        ruleId: g.ruleId,
        name: ruleOf.get(g.ruleId)?.name ?? null,
        failed24h: g._count._all,
        lastRunAt: ruleOf.get(g.ruleId)?.lastRunAt ?? null,
        lastRunStatus: ruleOf.get(g.ruleId)?.lastRunStatus ?? null,
      })),
      errors: recentFailures.map(e => ({
        executionId: e.id,
        ruleId: e.rule.id,
        rule: e.rule.name,
        module: e.rule.module,
        at: e.startedAt,
        attempt: e.attempt,
        nextRetryAt: e.nextRetryAt,
        errorCode: e.errorCode,
        errorStep: e.errorStep,
        message: e.errorMessage,
      })),
      history: recentExecutions.map(e => ({
        executionId: e.id,
        ruleId: e.rule.id,
        rule: e.rule.name,
        status: e.status,
        startedAt: e.startedAt,
        durationMs: e.finishedAt ? e.finishedAt.getTime() - e.startedAt.getTime() : null,
        attempt: e.attempt,
        currentStep: e.currentStep,
      })),
      upcoming: nextSchedules.map(s => ({
        scheduleId: s.id,
        name: s.name,
        ruleId: s.rule.id,
        rule: s.rule.name,
        nextRunAt: s.nextRunAt,
        lastRunAt: s.lastRunAt,
        lastRunStatus: s.lastRunStatus,
      })),
      daily: [...perDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, v]) => ({
          day,
          ...v,
          successRatePercent: this.round1(percent(v.success, v.success + v.failed) ?? 0),
        })),
    };
  }
}
