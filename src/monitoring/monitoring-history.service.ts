// modulo_monitoring.md §12 — Histórico de Monitorização.
//
// Só lê e não duplica o Audit: aqui está o que o *sistema* mediu e registou
// (métricas agregadas, alertas, incidentes, falhas de automações/integrações),
// não quem fez o quê — isso fica no módulo Audit (a timeline de um incidente já
// vai buscar lá as acções). Fontes duráveis, sem migração:
//  - ScalabilityMetricHourly / ScalabilityMetric → séries diárias da plataforma;
//  - ScalabilityQueueMetric → pico diário de falhados/em espera por fila;
//  - SystemAlert, ScalabilityIncident, SecurityIncident, AutomationExecution,
//    IntegrationSyncLog → linha do tempo de ocorrências.
// O estado do Health Check por componente só existe em memória (§9) e por isso
// não faz parte do histórico durável.
// A retenção é a `metricRetentionDays` do Scalability (as horárias duram 4×).

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const EVENT_SOURCE_CAP = 300;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

export const HISTORY_KINDS = ['ALERTA', 'INCIDENTE', 'AUTOMACAO', 'INTEGRACAO'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export interface HistoryEvent {
  at: string;
  kind: HistoryKind;
  event: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  source: string;
  ref: string | null;
}

const sev = (s: string): HistoryEvent['severity'] =>
  s === 'CRITICAL' || s === 'HIGH'
    ? 'CRITICAL'
    : s === 'WARNING' || s === 'MEDIUM'
      ? 'WARNING'
      : 'INFO';

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class MonitoringHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(opts: { days?: number; kind?: HistoryKind; limit?: number } = {}) {
    const days = Math.min(Math.max(Math.trunc(opts.days ?? 7) || 7, 1), 90);
    const limit = Math.min(
      Math.max(Math.trunc(opts.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY);
    const want = (k: HistoryKind) => !opts.kind || opts.kind === k;
    const r = this.prisma.read;
    const none = Promise.resolve([] as never[]);

    const [
      alerts,
      opIncidents,
      secIncidents,
      autoFails,
      syncFails,
      hourly,
      raw,
      queueRows,
      retention,
      totals,
    ] = await Promise.all([
      want('ALERTA')
        ? r.systemAlert.findMany({
            where: { OR: [{ createdAt: { gte: since } }, { resolvedAt: { gte: since } }] },
            orderBy: { createdAt: 'desc' },
            take: EVENT_SOURCE_CAP,
            select: {
              id: true,
              createdAt: true,
              resolvedAt: true,
              severity: true,
              category: true,
              title: true,
            },
          })
        : none,
      want('INCIDENTE')
        ? r.scalabilityIncident.findMany({
            where: {
              OR: [
                { occurredAt: { gte: since } },
                { resolvedAt: { gte: since } },
                { closedAt: { gte: since } },
              ],
            },
            orderBy: { occurredAt: 'desc' },
            take: EVENT_SOURCE_CAP,
            select: {
              id: true,
              occurredAt: true,
              resolvedAt: true,
              closedAt: true,
              severity: true,
              component: true,
              title: true,
            },
          })
        : none,
      want('INCIDENTE')
        ? r.securityIncident.findMany({
            where: { OR: [{ detectedAt: { gte: since } }, { closedAt: { gte: since } }] },
            orderBy: { detectedAt: 'desc' },
            take: EVENT_SOURCE_CAP,
            select: {
              id: true,
              code: true,
              detectedAt: true,
              closedAt: true,
              severity: true,
              title: true,
            },
          })
        : none,
      want('AUTOMACAO')
        ? r.automationExecution.findMany({
            where: { startedAt: { gte: since }, status: 'FAILED' },
            orderBy: { startedAt: 'desc' },
            take: EVENT_SOURCE_CAP,
            select: {
              id: true,
              startedAt: true,
              errorMessage: true,
              rule: { select: { name: true } },
            },
          })
        : none,
      want('INTEGRACAO')
        ? r.integrationSyncLog.findMany({
            where: { startedAt: { gte: since }, status: 'FAILED' },
            orderBy: { startedAt: 'desc' },
            take: EVENT_SOURCE_CAP,
            select: {
              id: true,
              startedAt: true,
              errorMessage: true,
              integration: { select: { name: true } },
            },
          })
        : none,
      r.scalabilityMetricHourly.findMany({
        where: { hour: { gte: since } },
        orderBy: { hour: 'asc' },
        select: {
          hour: true,
          samples: true,
          avgLatencyMs: true,
          maxP95Ms: true,
          avgErrorRate: true,
          maxCpu: true,
          maxMemory: true,
          maxRpm: true,
        },
      }),
      // amostras ainda por agregar (o downsampling corre de noite)
      r.scalabilityMetric.findMany({
        where: {
          capturedAt: { gte: new Date(Math.max(since.getTime(), now.getTime() - 2 * DAY)) },
        },
        orderBy: { capturedAt: 'asc' },
        take: 5000,
        select: {
          capturedAt: true,
          avgLatencyMs: true,
          p95LatencyMs: true,
          errorRate: true,
          cpuUsagePercent: true,
          memoryUsagePercent: true,
          requestsPerMinute: true,
        },
      }),
      r.scalabilityQueueMetric.findMany({
        where: { capturedAt: { gte: since } },
        select: { capturedAt: true, queue: true, pending: true, failed: true },
        take: 20_000,
      }),
      r.scalabilityInfraSettings.findUnique({
        where: { id: 'default' },
        select: { metricRetentionDays: true },
      }),
      Promise.all([
        r.scalabilityMetricHourly.count(),
        r.scalabilityQueueMetric.count(),
        r.scalabilityMetricHourly.findFirst({ orderBy: { hour: 'asc' }, select: { hour: true } }),
      ]),
    ]);

    // ── Linha do tempo ──
    const events: HistoryEvent[] = [];
    for (const a of alerts) {
      if (a.createdAt >= since) {
        events.push({
          at: a.createdAt.toISOString(),
          kind: 'ALERTA',
          event: 'Alerta criado',
          severity: sev(a.severity),
          title: a.title,
          source: a.category,
          ref: a.id,
        });
      }
      if (a.resolvedAt && a.resolvedAt >= since) {
        events.push({
          at: a.resolvedAt.toISOString(),
          kind: 'ALERTA',
          event: 'Alerta resolvido',
          severity: 'INFO',
          title: a.title,
          source: a.category,
          ref: a.id,
        });
      }
    }
    for (const i of opIncidents) {
      const end = i.resolvedAt ?? i.closedAt;
      if (i.occurredAt >= since) {
        events.push({
          at: i.occurredAt.toISOString(),
          kind: 'INCIDENTE',
          event: 'Incidente aberto',
          severity: sev(i.severity),
          title: i.title,
          source: i.component,
          ref: `OPERATIONAL:${i.id}`,
        });
      }
      if (end && end >= since) {
        events.push({
          at: end.toISOString(),
          kind: 'INCIDENTE',
          event: 'Incidente resolvido',
          severity: 'INFO',
          title: i.title,
          source: i.component,
          ref: `OPERATIONAL:${i.id}`,
        });
      }
    }
    for (const i of secIncidents) {
      if (i.detectedAt >= since) {
        events.push({
          at: i.detectedAt.toISOString(),
          kind: 'INCIDENTE',
          event: 'Incidente de segurança detectado',
          severity: sev(i.severity),
          title: i.title,
          source: 'Segurança',
          ref: `SECURITY:${i.id}`,
        });
      }
      if (i.closedAt && i.closedAt >= since) {
        events.push({
          at: i.closedAt.toISOString(),
          kind: 'INCIDENTE',
          event: 'Incidente de segurança encerrado',
          severity: 'INFO',
          title: i.title,
          source: 'Segurança',
          ref: `SECURITY:${i.id}`,
        });
      }
    }
    for (const e of autoFails) {
      events.push({
        at: e.startedAt.toISOString(),
        kind: 'AUTOMACAO',
        event: 'Falha de automação',
        severity: 'WARNING',
        title: `${e.rule.name}${e.errorMessage ? `: ${e.errorMessage.slice(0, 160)}` : ''}`,
        source: 'Automation',
        ref: e.id,
      });
    }
    for (const s of syncFails) {
      events.push({
        at: s.startedAt.toISOString(),
        kind: 'INTEGRACAO',
        event: 'Falha de sincronização',
        severity: 'WARNING',
        title: `${s.integration.name}${s.errorMessage ? `: ${s.errorMessage.slice(0, 160)}` : ''}`,
        source: 'Integrations',
        ref: s.id,
      });
    }
    events.sort((a, b) => b.at.localeCompare(a.at));

    const countByKind = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1;
      return acc;
    }, {});

    // ── Séries diárias da plataforma: horárias (ponderadas) + brutas ainda não agregadas ──
    const lastHour = hourly.length ? hourly[hourly.length - 1].hour.getTime() + 3_600_000 : 0;
    type Day = {
      w: number;
      lat: number;
      err: number;
      p95: number;
      cpu: number;
      mem: number;
      rpm: number;
    };
    const perDay = new Map<string, Day>();
    const add = (
      d: Date,
      w: number,
      lat: number,
      err: number,
      p95: number,
      cpu: number,
      mem: number,
      rpm: number,
    ) => {
      const k = dayKey(d);
      const cur = perDay.get(k) ?? { w: 0, lat: 0, err: 0, p95: 0, cpu: 0, mem: 0, rpm: 0 };
      cur.w += w;
      cur.lat += lat * w;
      cur.err += err * w;
      cur.p95 = Math.max(cur.p95, p95);
      cur.cpu = Math.max(cur.cpu, cpu);
      cur.mem = Math.max(cur.mem, mem);
      cur.rpm = Math.max(cur.rpm, rpm);
      perDay.set(k, cur);
    };
    for (const h of hourly) {
      add(
        h.hour,
        h.samples,
        h.avgLatencyMs,
        h.avgErrorRate,
        h.maxP95Ms,
        h.maxCpu,
        h.maxMemory,
        h.maxRpm,
      );
    }
    for (const m of raw) {
      if (m.capturedAt.getTime() < lastHour) continue;
      add(
        m.capturedAt,
        1,
        m.avgLatencyMs,
        m.errorRate,
        m.p95LatencyMs,
        m.cpuUsagePercent,
        m.memoryUsagePercent,
        m.requestsPerMinute,
      );
    }
    const platform = [...perDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, d]) => ({
        day,
        samples: d.w,
        avgLatencyMs: d.w ? r2(d.lat / d.w) : null,
        maxP95Ms: d.p95,
        avgErrorRatePercent: d.w ? r2(d.err / d.w) : null,
        maxCpuPercent: r2(d.cpu),
        maxMemoryPercent: r2(d.mem),
        maxRequestsPerMinute: d.rpm,
      }));

    // ── Filas: pico diário por fila ──
    const queueDay = new Map<string, { maxPending: number; maxFailed: number }>();
    for (const q of queueRows) {
      const k = `${dayKey(q.capturedAt)}|${q.queue}`;
      const cur = queueDay.get(k) ?? { maxPending: 0, maxFailed: 0 };
      cur.maxPending = Math.max(cur.maxPending, q.pending);
      cur.maxFailed = Math.max(cur.maxFailed, q.failed);
      queueDay.set(k, cur);
    }
    const queues = [...queueDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const [day, queue] = k.split('|');
        return { day, queue, ...v };
      });

    const retentionDays = retention?.metricRetentionDays ?? 90;
    const [hourlyRows, queueRowsTotal, oldest] = totals;

    return {
      generatedAt: now.toISOString(),
      windowDays: days,
      kind: opts.kind ?? null,
      summary: {
        events: events.length,
        byKind: countByKind,
        critical: events.filter(e => e.severity === 'CRITICAL').length,
      },
      events: events.slice(0, limit),
      truncated: events.length > limit,
      platform,
      queues,
      retention: {
        retentionDays,
        hourlyRetentionDays: retentionDays * 4,
        hourlyRows,
        queueRows: queueRowsTotal,
        oldestHourlyAt: oldest?.hour ?? null,
      },
      note: 'Histórico do que o sistema mediu e registou — quem fez o quê está no módulo Audit. O estado do Health Check por componente só existe em memória e não faz parte deste histórico.',
    };
  }
}
