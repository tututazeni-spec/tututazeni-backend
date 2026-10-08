// modulo_monitoring.md §1 — Visão Geral.
//
// "O que está a acontecer agora e o que está em risco": estado geral, alertas
// críticos, processos em atraso, automações com erro, integrações em falha,
// jobs em execução, utilizadores activos, pendências, SLA em risco, incidentes
// abertos e últimas ocorrências. Não duplica Analytics (tendências) nem Audit
// (quem fez o quê) — só lê o estado corrente.
//
// Fontes: SystemAlert, ProcessInstance/StepProgress, AutomationExecution,
// IntegrationConfig/IntegrationSyncLog, filas Bull, RefreshToken,
// ScalabilityIncident e SecurityIncident.

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoringModulesService } from './monitoring-modules.service';
import { classifyStatus, MonitoringStatus, STATUS_LABEL, worstStatus } from './monitoring-status';

const H = 3_600_000;
const ACTIVE_USERS_WINDOW_MIN = 30;
const QUEUE_TIMEOUT_MS = 2000;
const OCCURRENCES = 15;

interface Occurrence {
  at: Date;
  kind: 'ALERTA' | 'INCIDENTE' | 'AUTOMACAO' | 'INTEGRACAO' | 'PROCESSO';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  source: string;
}

@Injectable()
export class MonitoringOverviewService {
  private readonly queues: { key: string; queue: Queue }[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly modules: MonitoringModulesService,
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

  /** Contagens das filas Bull; uma fila inacessível aparece como `available:false`. */
  private async queueSnapshot() {
    return Promise.all(
      this.queues.map(async ({ key, queue }) => {
        try {
          const counts = await Promise.race([
            queue.getJobCounts(),
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error('timeout')), QUEUE_TIMEOUT_MS),
            ),
          ]);
          return {
            key,
            available: true,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            failed: counts.failed ?? 0,
          };
        } catch {
          return { key, available: false, waiting: 0, active: 0, delayed: 0, failed: 0 };
        }
      }),
    );
  }

  private async dbProbe() {
    const t0 = Date.now();
    try {
      await this.prisma.read.$queryRaw`SELECT 1`;
      return { ok: true, ms: Date.now() - t0 };
    } catch {
      return { ok: false, ms: Date.now() - t0 };
    }
  }

  async getOverview() {
    const r = this.prisma.read;
    const now = new Date();
    const since24 = new Date(now.getTime() - 24 * H);
    const in24h = new Date(now.getTime() + 24 * H);
    const activeSince = new Date(now.getTime() - ACTIVE_USERS_WINDOW_MIN * 60_000);

    const [
      db,
      queues,
      modulesRes,
      criticalAlerts,
      openAlerts,
      latestAlerts,
      procOverdue,
      procAtRisk,
      stepsBlocked,
      urgentOpen,
      autoFailed24,
      autoTotal24,
      autoRunning,
      autoPending,
      recentAutoFailures,
      integrationsBad,
      integrationsTotal,
      syncFailed24,
      recentSyncFailures,
      activeTokens,
      scalIncidents,
      secIncidents,
      scalOpenCount,
      secOpenCount,
      scalCriticalCount,
      secCriticalCount,
    ] = await Promise.all([
      this.dbProbe(),
      this.queueSnapshot(),
      this.modules.getModules(),
      r.systemAlert.count({ where: { isResolved: false, severity: 'CRITICAL' } }),
      r.systemAlert.count({ where: { isResolved: false } }),
      r.systemAlert.findMany({
        where: { createdAt: { gte: since24 } },
        orderBy: { createdAt: 'desc' },
        take: OCCURRENCES,
        select: { createdAt: true, severity: true, category: true, title: true },
      }),
      r.processInstance.count({ where: { status: 'IN_PROGRESS', slaDeadline: { lt: now } } }),
      r.processInstance.count({
        where: { status: 'IN_PROGRESS', slaDeadline: { gte: now, lte: in24h } },
      }),
      r.stepProgress.count({
        where: { status: { in: ['BLOCKED', 'ESCALATED'] }, instance: { status: 'IN_PROGRESS' } },
      }),
      r.processInstance.count({ where: { status: 'IN_PROGRESS', priority: 'URGENT' } }),
      r.automationExecution.count({ where: { startedAt: { gte: since24 }, status: 'FAILED' } }),
      r.automationExecution.count({ where: { startedAt: { gte: since24 } } }),
      r.automationExecution.count({ where: { status: 'RUNNING' } }),
      r.automationExecution.count({ where: { status: 'PENDING' } }),
      r.automationExecution.findMany({
        where: { startedAt: { gte: since24 }, status: 'FAILED' },
        orderBy: { startedAt: 'desc' },
        take: OCCURRENCES,
        select: { startedAt: true, errorMessage: true, rule: { select: { name: true } } },
      }),
      r.integrationConfig.count({
        where: { active: true, status: { in: ['ERROR', 'RATE_LIMITED', 'PENDING_AUTH'] } },
      }),
      r.integrationConfig.count({ where: { active: true } }),
      r.integrationSyncLog.count({ where: { startedAt: { gte: since24 }, status: 'FAILED' } }),
      r.integrationSyncLog.findMany({
        where: { startedAt: { gte: since24 }, status: 'FAILED' },
        orderBy: { startedAt: 'desc' },
        take: OCCURRENCES,
        select: {
          startedAt: true,
          errorMessage: true,
          integration: { select: { name: true } },
        },
      }),
      r.refreshToken.findMany({
        where: { revokedAt: null, expiresAt: { gt: now }, createdAt: { gte: activeSince } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      r.scalabilityIncident.findMany({
        where: { status: { in: ['OPEN', 'INVESTIGATING', 'MITIGATING'] } },
        orderBy: { occurredAt: 'desc' },
        take: OCCURRENCES,
        select: { occurredAt: true, severity: true, title: true, component: true, status: true },
      }),
      r.securityIncident.findMany({
        where: { status: { in: ['OPEN', 'IN_ANALYSIS'] } },
        orderBy: { detectedAt: 'desc' },
        take: OCCURRENCES,
        select: { detectedAt: true, severity: true, title: true, status: true },
      }),
      r.scalabilityIncident.count({
        where: { status: { in: ['OPEN', 'INVESTIGATING', 'MITIGATING'] } },
      }),
      r.securityIncident.count({ where: { status: { in: ['OPEN', 'IN_ANALYSIS'] } } }),
      r.scalabilityIncident.count({
        where: { status: { in: ['OPEN', 'INVESTIGATING', 'MITIGATING'] }, severity: 'CRITICAL' },
      }),
      r.securityIncident.count({
        where: { status: { in: ['OPEN', 'IN_ANALYSIS'] }, severity: { in: ['HIGH', 'CRITICAL'] } },
      }),
    ]);

    // ── Estado geral: pior módulo + sonda à BD + condições críticas explícitas ──
    const dbStatus = classifyStatus({
      available: db.ok,
      errorRatePercent: null,
      latencyMs: db.ok ? db.ms : null,
    });
    const reasons: string[] = [];
    const parts: MonitoringStatus[] = [modulesRes.summary.overall, dbStatus.status];
    if (!db.ok) reasons.push('Base de dados sem resposta');
    if (criticalAlerts > 0) {
      parts.push('CRITICO');
      reasons.push(`${criticalAlerts} alerta(s) crítico(s) por resolver`);
    }
    const downIntegrations = integrationsBad;
    if (downIntegrations > 0) {
      parts.push('ATENCAO');
      reasons.push(`${downIntegrations} integração(ões) com falha`);
    }
    if (procOverdue > 0) {
      parts.push('ATENCAO');
      reasons.push(`${procOverdue} processo(s) em atraso`);
    }
    const unavailableQueues = queues.filter(q => !q.available).length;
    if (unavailableQueues > 0) {
      parts.push('ATENCAO');
      reasons.push(`${unavailableQueues} fila(s) inacessível(eis)`);
    }
    for (const m of modulesRes.modules) {
      if (m.status === 'CRITICO' || m.status === 'INDISPONIVEL') {
        reasons.push(`Módulo ${m.module} ${STATUS_LABEL[m.status].toLowerCase()}`);
      }
    }
    const overall = worstStatus(parts);

    const queueTotals = queues.reduce(
      (t, q) => ({
        waiting: t.waiting + q.waiting,
        active: t.active + q.active,
        delayed: t.delayed + q.delayed,
        failed: t.failed + q.failed,
      }),
      { waiting: 0, active: 0, delayed: 0, failed: 0 },
    );

    // ── Últimas ocorrências: junta fontes heterogéneas por data desc ──
    const sev = (s: string): Occurrence['severity'] =>
      s === 'CRITICAL' || s === 'HIGH'
        ? 'CRITICAL'
        : s === 'WARNING' || s === 'MEDIUM'
          ? 'WARNING'
          : 'INFO';
    const occurrences: Occurrence[] = [
      ...latestAlerts.map(a => ({
        at: a.createdAt,
        kind: 'ALERTA' as const,
        severity: sev(a.severity),
        title: a.title,
        source: a.category,
      })),
      ...scalIncidents.map(i => ({
        at: i.occurredAt,
        kind: 'INCIDENTE' as const,
        severity: sev(i.severity),
        title: i.title,
        source: i.component,
      })),
      ...secIncidents.map(i => ({
        at: i.detectedAt,
        kind: 'INCIDENTE' as const,
        severity: sev(i.severity),
        title: i.title,
        source: 'Segurança',
      })),
      ...recentAutoFailures.map(e => ({
        at: e.startedAt,
        kind: 'AUTOMACAO' as const,
        severity: 'WARNING' as const,
        title: `Falha na automação "${e.rule.name}"${e.errorMessage ? `: ${e.errorMessage}` : ''}`,
        source: 'Automation',
      })),
      ...recentSyncFailures.map(s => ({
        at: s.startedAt,
        kind: 'INTEGRACAO' as const,
        severity: 'WARNING' as const,
        title: `Falha de sincronização "${s.integration.name}"${s.errorMessage ? `: ${s.errorMessage}` : ''}`,
        source: 'Integrations',
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, OCCURRENCES);

    return {
      generatedAt: now.toISOString(),
      platform: {
        status: overall,
        statusLabel: STATUS_LABEL[overall],
        reasons,
        database: { available: db.ok, latencyMs: db.ok ? db.ms : null },
        modules: {
          total: modulesRes.summary.modules,
          counts: modulesRes.summary.counts,
        },
      },
      criticalAlerts: { critical: criticalAlerts, open: openAlerts },
      processes: {
        overdue: procOverdue,
        atRisk: procAtRisk,
        blockedSteps: stepsBlocked,
        urgentInProgress: urgentOpen,
      },
      automations: {
        failed24h: autoFailed24,
        total24h: autoTotal24,
        failureRatePercent:
          autoTotal24 > 0 ? Math.round((autoFailed24 / autoTotal24) * 1000) / 10 : null,
      },
      integrations: {
        active: integrationsTotal,
        unavailable: downIntegrations,
        syncFailed24h: syncFailed24,
      },
      jobs: {
        running: autoRunning + queueTotals.active,
        automationsRunning: autoRunning,
        automationsPending: autoPending,
        queues: queueTotals,
        queueDetail: queues,
      },
      // Aproximação: utilizadores com sessão (refresh token) criada/renovada na janela.
      activeUsers: { count: activeTokens.length, windowMinutes: ACTIVE_USERS_WINDOW_MIN },
      pendingCritical: {
        blockedSteps: stepsBlocked,
        overdueProcesses: procOverdue,
        failedAutomations: autoFailed24,
        failedQueueJobs: queueTotals.failed,
      },
      sla: { atRisk: procAtRisk, breached: procOverdue },
      incidents: {
        open: scalOpenCount + secOpenCount,
        operational: scalOpenCount,
        security: secOpenCount,
        critical: scalCriticalCount + secCriticalCount,
      },
      latestOccurrences: occurrences,
    };
  }
}
