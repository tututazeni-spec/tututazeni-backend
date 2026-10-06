// modulo_monitoring.md §5 — Integrações.
//
// Só lê: IntegrationConfig / IntegrationSyncLog / ApiIntegrationLog /
// AutomationConnection / TenantConfig (SSO) e as filas Bull 'email' e 'webhooks'.
// Complementa o Scalability (que olha para capacidade): aqui interessa se a
// ligação está de pé, quando sincronizou pela última vez e o que falhou.
//
// Definições:
//  - família (ERP/SSO/LMS/Email/API/Webhook/Outros): deduzida de category/type;
//  - indisponível: integração activa com status ERROR/RATE_LIMITED/PENDING_AUTH,
//    ou cuja última sincronização falhou;
//  - desactualizada: activa, com última sincronização há mais de 2× a frequência
//    configurada (ou nunca sincronizou);
//  - tempo de resposta: média de finishedAt − startedAt das sincronizações (24h)
//    e de latencyMs dos pedidos de API (ApiIntegrationLog, 24h);
//  - registos enviados/recebidos: recordsProcessed / recordsFailed (24h). Não há
//    contagem de bytes nem direcção por registo — usa-se syncDirection da integração.

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type { IntegrationCategory, IntegrationType, SyncFrequency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoringStatus, percent, STATUS_LABEL, worstStatus } from './monitoring-status';

const H = 3_600_000;
const D = 24 * H;
const QUEUE_TIMEOUT_MS = 2000;
const FAILURE_LIST = 15;

type Family = 'ERP' | 'SSO' | 'LMS' | 'EMAIL' | 'API' | 'WEBHOOK' | 'OUTROS';

const FAMILY_LABEL: Record<Family, string> = {
  ERP: 'ERP',
  SSO: 'SSO',
  LMS: 'LMS',
  EMAIL: 'Email',
  API: 'APIs',
  WEBHOOK: 'Webhooks',
  OUTROS: 'Sistemas externos',
};

const FREQUENCY_MS: Partial<Record<SyncFrequency, number>> = {
  REALTIME: 5 * 60_000,
  HOURLY: H,
  DAILY: D,
  WEEKLY: 7 * D,
};

export function integrationFamily(
  category: IntegrationCategory | null,
  type: IntegrationType,
): Family {
  if (category === 'ERP' || type === 'ERP_HR') return 'ERP';
  if (
    category === 'SSO' ||
    category === 'IDENTITY_ACCESS' ||
    ['SSO_GOOGLE', 'SSO_MICROSOFT', 'SAML2', 'OPENID_CONNECT', 'OAUTH2', 'LDAP'].includes(type)
  ) {
    return 'SSO';
  }
  if (category === 'LMS' || ['SCORM_PROVIDER', 'XAPI_LRS'].includes(type)) return 'LMS';
  if (category === 'COMMUNICATION' && !['MICROSOFT_TEAMS', 'SLACK'].includes(type)) return 'EMAIL';
  if (['CUSTOM_WEBHOOK', 'WEBHOOK'].includes(type)) return 'WEBHOOK';
  if (['REST_API', 'SOAP_API'].includes(type)) return 'API';
  return 'OUTROS';
}

/** Activa e sem sincronização recente face à frequência configurada. */
export function isStale(
  lastSyncAt: Date | null,
  frequency: SyncFrequency,
  now: Date,
  createdAt: Date,
): boolean {
  const every = FREQUENCY_MS[frequency];
  if (!every) return false; // MANUAL/ON_DEMAND: não há expectativa de periodicidade
  const ref = lastSyncAt ?? createdAt;
  return now.getTime() - ref.getTime() > 2 * every;
}

@Injectable()
export class MonitoringIntegrationsService {
  private readonly queues: { key: string; queue: Queue }[];

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('email') email: Queue,
    @InjectQueue('webhooks') webhooks: Queue,
  ) {
    this.queues = [
      { key: 'email', queue: email },
      { key: 'webhooks', queue: webhooks },
    ];
  }

  private async queueCounts() {
    return Promise.all(
      this.queues.map(async ({ key, queue }) => {
        try {
          const c = await Promise.race([
            queue.getJobCounts(),
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error('timeout')), QUEUE_TIMEOUT_MS),
            ),
          ]);
          return {
            key,
            available: true,
            waiting: c.waiting ?? 0,
            active: c.active ?? 0,
            failed: c.failed ?? 0,
          };
        } catch {
          return { key, available: false, waiting: 0, active: 0, failed: 0 };
        }
      }),
    );
  }

  async getIntegrations() {
    const r = this.prisma.read;
    const now = new Date();
    const since24 = new Date(now.getTime() - D);

    const [configs, syncLogs, apiLogs, failures, connections, tenant, queueCounts] =
      await Promise.all([
        r.integrationConfig.findMany({
          select: {
            id: true,
            name: true,
            type: true,
            category: true,
            platform: true,
            status: true,
            isActive: true,
            syncFrequency: true,
            syncDirection: true,
            lastSyncAt: true,
            lastSyncStatus: true,
            lastSyncError: true,
            webhookUrl: true,
            createdAt: true,
          },
          orderBy: { name: 'asc' },
        }),
        r.integrationSyncLog.findMany({
          where: { startedAt: { gte: since24 } },
          select: {
            integrationId: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            recordsProcessed: true,
            recordsFailed: true,
          },
          take: 20_000,
        }),
        r.apiIntegrationLog.findMany({
          where: { createdAt: { gte: since24 } },
          select: { integrationId: true, status: true, latencyMs: true },
          take: 20_000,
        }),
        r.integrationSyncLog.findMany({
          where: { startedAt: { gte: since24 }, status: { in: ['FAILED', 'PARTIAL'] } },
          orderBy: { startedAt: 'desc' },
          take: FAILURE_LIST,
          select: {
            id: true,
            startedAt: true,
            status: true,
            recordsFailed: true,
            errorMessage: true,
            integration: { select: { id: true, name: true } },
          },
        }),
        r.automationConnection.findMany({
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            lastTestedAt: true,
            lastTestStatus: true,
          },
          orderBy: { name: 'asc' },
        }),
        r.tenantConfig.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { ssoEnabled: true, ssoProvider: true },
        }),
        this.queueCounts(),
      ]);

    const logsBy = new Map<number, typeof syncLogs>();
    for (const l of syncLogs) {
      const list = logsBy.get(l.integrationId) ?? [];
      list.push(l);
      logsBy.set(l.integrationId, list);
    }
    const apiBy = new Map<number, typeof apiLogs>();
    for (const l of apiLogs) {
      const list = apiBy.get(l.integrationId) ?? [];
      list.push(l);
      apiBy.set(l.integrationId, list);
    }

    const rows = configs.map(c => {
      const logs = logsBy.get(c.id) ?? [];
      const api = apiBy.get(c.id) ?? [];
      const family = integrationFamily(c.category, c.type);
      const active = c.isActive && c.status !== 'INACTIVE' && c.status !== 'SUSPENDED';

      const durations = logs
        .filter(l => l.finishedAt)
        .map(l => l.finishedAt.getTime() - l.startedAt.getTime());
      const apiLatencies = api.filter(a => a.latencyMs !== null).map(a => a.latencyMs);
      const samples = [...durations, ...apiLatencies];
      const responseMs = samples.length
        ? Math.round(samples.reduce((s, v) => s + v, 0) / samples.length)
        : null;

      const failedSyncs = logs.filter(l => l.status === 'FAILED').length;
      const apiErrors = api.filter(a => a.status === 'ERROR').length;
      const stale = active && isStale(c.lastSyncAt, c.syncFrequency, now, c.createdAt);
      const down =
        active &&
        (['ERROR', 'RATE_LIMITED', 'PENDING_AUTH'].includes(c.status) ||
          c.lastSyncStatus === 'FAILED');

      let status: MonitoringStatus = 'NORMAL';
      const reasons: string[] = [];
      if (!active) {
        reasons.push('Integração inactiva');
      } else {
        if (c.status === 'ERROR' || c.lastSyncStatus === 'FAILED') {
          status = 'CRITICO';
          reasons.push(c.lastSyncError ?? `Estado ${c.status}`);
        } else if (c.status === 'RATE_LIMITED' || c.status === 'PENDING_AUTH') {
          status = 'DEGRADADO';
          reasons.push(`Estado ${c.status}`);
        }
        const requests = logs.length + api.length;
        const errRate = percent(failedSyncs + apiErrors, requests);
        if (errRate !== null && errRate >= 10 && status !== 'CRITICO') {
          status = 'DEGRADADO';
          reasons.push(`Taxa de falhas ${errRate}%`);
        } else if (errRate !== null && errRate >= 2 && status === 'NORMAL') {
          status = 'ATENCAO';
          reasons.push(`Taxa de falhas ${errRate}%`);
        }
        if (stale && status === 'NORMAL') {
          status = 'ATENCAO';
          reasons.push('Sem sincronização recente');
        }
      }

      return {
        id: c.id,
        name: c.name,
        family,
        familyLabel: FAMILY_LABEL[family],
        type: c.type,
        platform: c.platform,
        direction: c.syncDirection,
        connectionState: c.status,
        active,
        status,
        statusLabel: STATUS_LABEL[status],
        reasons,
        lastSyncAt: c.lastSyncAt,
        lastSyncStatus: c.lastSyncStatus,
        stale,
        down,
        syncs24h: logs.length,
        apiCalls24h: api.length,
        failures24h: failedSyncs + apiErrors,
        recordsProcessed24h: logs.reduce((s, l) => s + l.recordsProcessed, 0),
        recordsFailed24h: logs.reduce((s, l) => s + l.recordsFailed, 0),
        avgResponseMs: responseMs,
      };
    });

    // Resumo por família (ERP, SSO, LMS, Email, APIs, Webhooks, Outros)
    const families = (Object.keys(FAMILY_LABEL) as Family[]).map(f => {
      const items = rows.filter(x => x.family === f);
      const lat = items.filter(x => x.avgResponseMs !== null).map(x => x.avgResponseMs);
      return {
        family: f,
        label: FAMILY_LABEL[f],
        total: items.length,
        active: items.filter(x => x.active).length,
        unavailable: items.filter(x => x.down).length,
        failures24h: items.reduce((s, x) => s + x.failures24h, 0),
        avgResponseMs: lat.length ? Math.round(lat.reduce((s, v) => s + v, 0) / lat.length) : null,
        status: worstStatus(items.filter(x => x.active).map(x => x.status)),
      };
    });

    const emailQ = queueCounts.find(q => q.key === 'email');
    const webhookQ = queueCounts.find(q => q.key === 'webhooks');
    const mailConnections = connections.filter(c => c.type === 'SMTP');
    const hookConnections = connections.filter(c => c.type === 'WEBHOOK');

    const activeRows = rows.filter(x => x.active);
    const allLat = rows.filter(x => x.avgResponseMs !== null).map(x => x.avgResponseMs);

    return {
      generatedAt: now.toISOString(),
      windowHours: 24,
      summary: {
        total: rows.length,
        active: activeRows.length,
        unavailable: rows.filter(x => x.down).length,
        stale: rows.filter(x => x.stale).length,
        syncs24h: rows.reduce((s, x) => s + x.syncs24h, 0),
        failures24h: rows.reduce((s, x) => s + x.failures24h, 0),
        recordsProcessed24h: rows.reduce((s, x) => s + x.recordsProcessed24h, 0),
        recordsFailed24h: rows.reduce((s, x) => s + x.recordsFailed24h, 0),
        avgResponseMs: allLat.length
          ? Math.round(allLat.reduce((s, v) => s + v, 0) / allLat.length)
          : null,
        overall: worstStatus(activeRows.map(x => x.status)),
      },
      families,
      integrations: rows,
      sso: tenant ? { enabled: tenant.ssoEnabled, provider: tenant.ssoProvider } : null,
      // Email e Webhooks não têm "última sincronização": o estado vem da fila
      // Bull e das ligações do módulo Automation.
      email: {
        queue: emailQ ?? null,
        connections: mailConnections.length,
        connectionsDisabled: mailConnections.filter(c => c.status === 'DISABLED').length,
        lastTestFailed: mailConnections.filter(c => c.lastTestStatus === 'FAILED').length,
      },
      webhooks: {
        queue: webhookQ ?? null,
        connections: hookConnections.length,
        connectionsDisabled: hookConnections.filter(c => c.status === 'DISABLED').length,
        lastTestFailed: hookConnections.filter(c => c.lastTestStatus === 'FAILED').length,
        configured: configs.filter(c => !!c.webhookUrl).length,
      },
      connections: connections.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        lastTestedAt: c.lastTestedAt,
        lastTestStatus: c.lastTestStatus,
      })),
      failures: failures.map(f => ({
        id: f.id,
        integrationId: f.integration.id,
        integration: f.integration.name,
        at: f.startedAt,
        status: f.status,
        recordsFailed: f.recordsFailed,
        message: f.errorMessage,
      })),
    };
  }
}
