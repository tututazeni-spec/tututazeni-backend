// modulo_monitoring.md §11 — SLA & SLO.
//
// Só lê. O SLA "configurado" é o `SlaConfig` activo (o mesmo que o Scalability
// edita e usa nos alertas); sem nenhum, usam-se os valores por omissão do
// Scalability e a resposta marca `configured: false`.
//
// Definições (os números dependem delas):
//  - janela: `days` dias (1–90, por omissão 30);
//  - disponibilidade = 100 − indisponibilidade/janela, onde indisponibilidade é a
//    união (sem sobreposição) dos intervalos dos incidentes operacionais CRÍTICOS.
//    A aplicação não mede uptime externo: sem incidentes registados = 100%;
//  - orçamento de erro = minutos de indisponibilidade permitidos pelo SLA na janela;
//  - latência / erros: % das amostras (horárias ponderadas pelo nº de amostras +
//    amostras brutas ainda não agregadas) dentro do limite do SLA;
//  - resposta a incidentes: alertas CRÍTICOS da janela reconhecidos dentro de
//    `incidentResponse` minutos (um alerta por reconhecer e já fora do prazo conta
//    como violação);
//  - Processos / Automações / Integrações: SLOs internos (constantes abaixo) —
//    não vêm do SlaConfig, e a resposta indica-o em `targetSource`.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseMeta } from './monitoring-alerts.service';
import { percent } from './monitoring-status';

const MIN = 60_000;
const DAY = 86_400_000;
const RAW_SAMPLE_CAP = 50_000;
const RISK_BUDGET_USED = 80; // % do orçamento de erro consumido que põe o serviço "em risco"
const VIOLATIONS_LIST = 30;

const DEFAULT_SLA = {
  name: 'SLA por omissão',
  uptimePercent: 99.5,
  maxLatencyMs: 2000,
  maxErrorRate: 0.01,
  incidentResponse: 60,
};

/** SLOs internos para domínios que o SlaConfig não cobre. */
const INTERNAL_SLO = { processes: 90, automations: 95, integrations: 95 };

export type SlaState = 'CUMPRIDO' | 'EM_RISCO' | 'VIOLADO' | 'SEM_DADOS';

export interface Interval {
  start: number;
  end: number;
}

/** Minutos cobertos pela união dos intervalos, cortados a [from, to]. */
export function unionMinutes(intervals: Interval[], from: number, to: number): number {
  const clipped = intervals
    .map(i => ({ start: Math.max(i.start, from), end: Math.min(i.end, to) }))
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let curEnd = -Infinity;
  let curStart = 0;
  for (const i of clipped) {
    if (i.start > curEnd) {
      if (curEnd > -Infinity) total += curEnd - curStart;
      curStart = i.start;
      curEnd = i.end;
    } else if (i.end > curEnd) {
      curEnd = i.end;
    }
  }
  if (curEnd > -Infinity) total += curEnd - curStart;
  return Math.round(total / MIN);
}

export function slaState(
  actualPercent: number | null,
  targetPercent: number,
  budgetUsedPercent: number | null = null,
): SlaState {
  if (actualPercent === null) return 'SEM_DADOS';
  if (actualPercent < targetPercent) return 'VIOLADO';
  if (budgetUsedPercent !== null && budgetUsedPercent >= RISK_BUDGET_USED) return 'EM_RISCO';
  return 'CUMPRIDO';
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

@Injectable()
export class MonitoringSlaService {
  constructor(private readonly prisma: PrismaService) {}

  private async config() {
    const row = await this.prisma.read.slaConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    return row
      ? { configured: true, ...row }
      : { configured: false, ...DEFAULT_SLA, id: null as string | null };
  }

  /** % de amostras dentro do limite; pondera as horárias pelo nº de amostras. */
  private async sampleCompliance(since: Date, latencyMax: number, errorMaxPercent: number) {
    const lastHour = await this.prisma.read.scalabilityMetricHourly.findFirst({
      orderBy: { hour: 'desc' },
      select: { hour: true },
    });
    const rawFrom = lastHour ? new Date(lastHour.hour.getTime() + 3_600_000) : since;
    const [hourly, raw] = await Promise.all([
      this.prisma.read.scalabilityMetricHourly.findMany({
        where: { hour: { gte: since } },
        select: { samples: true, avgLatencyMs: true, avgErrorRate: true },
      }),
      this.prisma.read.scalabilityMetric.findMany({
        where: { capturedAt: { gte: rawFrom > since ? rawFrom : since } },
        select: { avgLatencyMs: true, errorRate: true },
        take: RAW_SAMPLE_CAP,
      }),
    ]);
    const rows = [
      ...hourly.map(h => ({ w: h.samples, lat: h.avgLatencyMs, err: h.avgErrorRate })),
      ...raw.map(m => ({ w: 1, lat: m.avgLatencyMs, err: m.errorRate })),
    ];
    const total = rows.reduce((s, r) => s + r.w, 0);
    const okLat = rows.filter(r => r.lat <= latencyMax).reduce((s, r) => s + r.w, 0);
    const okErr = rows.filter(r => r.err <= errorMaxPercent).reduce((s, r) => s + r.w, 0);
    return {
      samples: total,
      latencyPercent: percent(okLat, total),
      errorPercent: percent(okErr, total),
    };
  }

  async getSla(daysParam?: number) {
    const days = Math.min(Math.max(Math.trunc(daysParam ?? 30) || 30, 1), 90);
    const now = Date.now();
    const from = now - days * DAY;
    const since = new Date(from);
    const r = this.prisma.read;
    const sla = await this.config();
    const errorMaxPercent = sla.maxErrorRate * 100;

    const [
      incidents,
      samples,
      criticalAlerts,
      slaBreachAlerts,
      procDone,
      procOverdue,
      procAtRisk,
      autoOk,
      autoFailed,
      syncOk,
      syncFailed,
    ] = await Promise.all([
      r.scalabilityIncident.findMany({
        where: {
          OR: [
            { occurredAt: { gte: since } },
            { resolvedAt: null, closedAt: null },
            { resolvedAt: { gte: since } },
            { closedAt: { gte: since } },
          ],
        },
        select: {
          id: true,
          title: true,
          severity: true,
          component: true,
          status: true,
          occurredAt: true,
          resolvedAt: true,
          closedAt: true,
        },
        orderBy: { occurredAt: 'desc' },
        take: 500,
      }),
      this.sampleCompliance(since, sla.maxLatencyMs, errorMaxPercent),
      r.systemAlert.findMany({
        where: { createdAt: { gte: since }, severity: 'CRITICAL' },
        select: { createdAt: true, isResolved: true, resolvedAt: true, metadataJson: true },
        take: 2000,
      }),
      r.systemAlert.findMany({
        where: { createdAt: { gte: since }, category: 'SLA_BREACH' },
        orderBy: { createdAt: 'desc' },
        take: VIOLATIONS_LIST,
        select: {
          id: true,
          createdAt: true,
          severity: true,
          title: true,
          message: true,
          isResolved: true,
        },
      }),
      r.processInstance.findMany({
        where: { status: 'COMPLETED', completedAt: { gte: since }, slaDeadline: { not: null } },
        select: { completedAt: true, slaDeadline: true },
        take: 20_000,
      }),
      r.processInstance.count({
        where: { status: 'IN_PROGRESS', slaDeadline: { lt: new Date() } },
      }),
      r.processInstance.count({
        where: {
          status: 'IN_PROGRESS',
          slaDeadline: { gte: new Date(), lte: new Date(now + DAY) },
        },
      }),
      r.automationExecution.count({ where: { startedAt: { gte: since }, status: 'SUCCESS' } }),
      r.automationExecution.count({ where: { startedAt: { gte: since }, status: 'FAILED' } }),
      r.integrationSyncLog.count({ where: { startedAt: { gte: since }, status: 'SUCCESS' } }),
      r.integrationSyncLog.count({ where: { startedAt: { gte: since }, status: 'FAILED' } }),
    ]);

    // ── Disponibilidade ──
    const windowMin = Math.round((now - from) / MIN);
    const critical = incidents.filter(i => i.severity === 'CRITICAL');
    const toInterval = (i: (typeof incidents)[number]): Interval => ({
      start: i.occurredAt.getTime(),
      end: (i.resolvedAt ?? i.closedAt)?.getTime() ?? now,
    });
    const downtimeMin = unionMinutes(critical.map(toInterval), from, now);
    const availability = round3(100 - (downtimeMin / windowMin) * 100);
    const allowedMin = round1(windowMin * (1 - sla.uptimePercent / 100));
    const budgetUsed = allowedMin > 0 ? round1((downtimeMin / allowedMin) * 100) : null;
    const availState = slaState(availability, sla.uptimePercent, budgetUsed);

    // ── Resposta a incidentes (alertas críticos reconhecidos a tempo) ──
    const respMs = sla.incidentResponse * MIN;
    let respMet = 0;
    let respMissed = 0;
    for (const a of criticalAlerts) {
      const ack = parseMeta(a.metadataJson).acknowledgedAt;
      const doneAt = ack ? new Date(ack).getTime() : a.resolvedAt?.getTime();
      if (doneAt !== undefined) {
        if (doneAt - a.createdAt.getTime() <= respMs) respMet++;
        else respMissed++;
      } else if (now - a.createdAt.getTime() > respMs) {
        respMissed++; // ainda por tratar e já fora do prazo
      } // senão ainda dentro do prazo: não conta
    }
    const responsePercent = percent(respMet, respMet + respMissed);

    // ── Tempo médio de resolução (incidentes operacionais resolvidos na janela) ──
    const resolved = incidents.filter(
      i => (i.resolvedAt ?? i.closedAt) && (i.resolvedAt ?? i.closedAt)!.getTime() >= from,
    );
    const mttrMin = resolved.length
      ? Math.round(
          resolved.reduce((s, i) => {
            const end = (i.resolvedAt ?? i.closedAt)!;
            return s + (end.getTime() - i.occurredAt.getTime()) / MIN;
          }, 0) / resolved.length,
        )
      : null;

    // ── SLOs por módulo/serviço ──
    const procMet = procDone.filter(
      p => p.completedAt && p.slaDeadline && p.completedAt <= p.slaDeadline,
    ).length;
    const procPercent = percent(procMet, procDone.length);
    const autoPercent = percent(autoOk, autoOk + autoFailed);
    const syncPercent = percent(syncOk, syncOk + syncFailed);

    const slo = (
      key: string,
      label: string,
      metric: string,
      target: number,
      actual: number | null,
      targetSource: 'SLA' | 'INTERNO',
      extra: { atRisk?: boolean; detail?: string } = {},
    ) => {
      const state = slaState(actual, target);
      return {
        key,
        label,
        metric,
        target,
        actual,
        targetSource,
        state: state === 'CUMPRIDO' && extra.atRisk ? ('EM_RISCO' as SlaState) : state,
        detail: extra.detail ?? null,
      };
    };

    const services = [
      slo(
        'availability',
        'Plataforma (disponibilidade)',
        'disponibilidade %',
        sla.uptimePercent,
        availability,
        'SLA',
        {
          atRisk: availState === 'EM_RISCO',
          detail: `${downtimeMin} min de indisponibilidade; orçamento ${allowedMin} min (${budgetUsed ?? 0}% usado)`,
        },
      ),
      slo(
        'api-latency',
        'API (latência)',
        `amostras com latência média ≤ ${sla.maxLatencyMs} ms (%)`,
        99,
        samples.latencyPercent,
        'INTERNO',
        { detail: `${samples.samples} amostra(s)` },
      ),
      slo(
        'api-errors',
        'API (erros)',
        `amostras com erros ≤ ${errorMaxPercent}% (%)`,
        99,
        samples.errorPercent,
        'INTERNO',
        { detail: `${samples.samples} amostra(s)` },
      ),
      slo(
        'incident-response',
        'Resposta a incidentes críticos',
        `alertas críticos reconhecidos em ≤ ${sla.incidentResponse} min (%)`,
        90,
        responsePercent,
        'INTERNO',
        { detail: `${respMet} a tempo · ${respMissed} fora de prazo` },
      ),
      slo(
        'processes',
        'Processos',
        'processos concluídos dentro do prazo (%)',
        INTERNAL_SLO.processes,
        procPercent,
        'INTERNO',
        {
          atRisk: procAtRisk > 0,
          detail: `${procOverdue} em atraso · ${procAtRisk} em risco nas próximas 24 h`,
        },
      ),
      slo(
        'automations',
        'Automações',
        'execuções com sucesso (%)',
        INTERNAL_SLO.automations,
        autoPercent,
        'INTERNO',
        { detail: `${autoOk} sucesso · ${autoFailed} falha` },
      ),
      slo(
        'integrations',
        'Integrações',
        'sincronizações com sucesso (%)',
        INTERNAL_SLO.integrations,
        syncPercent,
        'INTERNO',
        { detail: `${syncOk} sucesso · ${syncFailed} falha` },
      ),
    ];

    // por componente afectado: indisponibilidade dos incidentes críticos
    const byComponent = new Map<string, Interval[]>();
    for (const i of critical) {
      const list = byComponent.get(i.component) ?? [];
      list.push(toInterval(i));
      byComponent.set(i.component, list);
    }
    const components = [...byComponent.entries()]
      .map(([component, ivs]) => {
        const min = unionMinutes(ivs, from, now);
        return {
          component,
          incidents: ivs.length,
          downtimeMinutes: min,
          availabilityPercent: round3(100 - (min / windowMin) * 100),
        };
      })
      .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes);

    const atRisk = services.filter(s => s.state === 'EM_RISCO' || s.state === 'VIOLADO');

    return {
      generatedAt: new Date(now).toISOString(),
      windowDays: days,
      sla: {
        configured: sla.configured,
        id: sla.id,
        name: sla.name,
        uptimePercent: sla.uptimePercent,
        maxLatencyMs: sla.maxLatencyMs,
        maxErrorRatePercent: errorMaxPercent,
        incidentResponseMinutes: sla.incidentResponse,
      },
      current: {
        availabilityPercent: availability,
        state: availState,
        downtimeMinutes: downtimeMin,
        allowedDowntimeMinutes: allowedMin,
        errorBudgetUsedPercent: budgetUsed,
        errorBudgetRemainingMinutes: round1(Math.max(0, allowedMin - downtimeMin)),
        latencyCompliancePercent: samples.latencyPercent,
        errorCompliancePercent: samples.errorPercent,
        mttrMinutes: mttrMin,
        resolvedIncidents: resolved.length,
      },
      services,
      atRisk: atRisk.map(s => ({ key: s.key, label: s.label, state: s.state, detail: s.detail })),
      components,
      violations: {
        availabilityBreached: availState === 'VIOLADO',
        responseMissed: respMissed,
        criticalIncidents: critical.length,
        slaAlerts: slaBreachAlerts.map(a => ({
          id: a.id,
          at: a.createdAt,
          severity: a.severity,
          title: a.title,
          message: a.message,
          resolved: a.isResolved,
        })),
      },
      note: 'A disponibilidade deriva dos incidentes críticos registados (a aplicação não mede uptime externo): sem incidentes = 100%. Os SLOs marcados INTERNO são objectivos fixos do Monitoring, não do SlaConfig.',
    };
  }
}
