// src/api-integration/api-integration.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateIntegrationDto,
  UpdateIntegrationDto,
  IntegrationLogFilterDto,
  CreateApiKeyDto,
  CreateWebhookDto,
  TriggerWebhookDto,
} from './api-integration.dto';
import * as crypto from 'crypto';

// ─── Helpers ─────────────────────────────────────────────────────

function safeM(prisma: any, name: string) {
  return (
    prisma[name] ?? {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (d: any) => d.data,
      update: async (d: any) => d.data,
      delete: async () => null,
      count: async () => 0,
      upsert: async (d: any) => d.create,
    }
  );
}

/** Compute HMAC-SHA256 signature for webhook payloads */
function signPayload(secret: string, payload: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Generate a random API key string */
function generateApiKey(): string {
  return 'ik_live_' + crypto.randomBytes(24).toString('hex');
}

/** Mask an API key for display */
function maskApiKey(key: string): string {
  if (key.length <= 12) return key.slice(0, 4) + '••••••••';
  return key.slice(0, 10) + '••••••••' + key.slice(-4);
}

const RETRY_DELAYS = [10, 60, 300, 1800]; // seconds: 10s, 1m, 5m, 30m

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class ApiIntegrationService {
  private readonly logger = new Logger(ApiIntegrationService.name);

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // INTEGRATIONS — CRUD
  // ══════════════════════════════════════════════════════

  async getIntegrations() {
    const integrations = await this.prismaRead.integrationConfig.findMany({
      orderBy: { name: 'asc' },
    });

    // Enrich with last log status
    return Promise.all(
      integrations.map(async i => {
        const lastLog = await this.prismaRead.apiIntegrationLog.findFirst({
          where: { integrationId: i.id },
          orderBy: { createdAt: 'desc' },
        });
        return {
          ...i,
          apiKey: i.apiKey ? maskApiKey(i.apiKey) : null,
          lastStatus: lastLog?.status ?? null,
          lastTested: lastLog?.createdAt ?? null,
          health: this.computeHealth(lastLog),
        };
      }),
    );
  }

  async getIntegration(id: number) {
    const i = await this.prismaRead.integrationConfig.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Integração não encontrada');

    const [logs24h, errRate] = await Promise.all([
      this.prismaRead.apiIntegrationLog.count({
        where: { integrationId: id, createdAt: { gte: new Date(Date.now() - 86400000) } },
      }),
      this.prismaRead.apiIntegrationLog.count({
        where: {
          integrationId: id,
          status: 'ERROR',
          createdAt: { gte: new Date(Date.now() - 86400000) },
        },
      }),
    ]);

    return {
      ...i,
      apiKey: i.apiKey ? maskApiKey(i.apiKey) : null,
      logs24h,
      errorRate: logs24h > 0 ? +((errRate / logs24h) * 100).toFixed(1) : 0,
    };
  }

  async createIntegration(dto: CreateIntegrationDto) {
    const data: any = {
      name: dto.name,
      type: dto.type,
      endpoint: dto.endpoint,
      config: dto.config ?? {},
      baseUrl: dto.baseUrl,
      apiKey: dto.apiKey,
      active: dto.active ?? true,
    };

    const integration = await this.prisma.integrationConfig.create({ data });

    await this.prisma.auditLog
      .create({
        data: {
          userId: 0,
          action: 'INTEGRATION_CREATED',
          entity: 'IntegrationConfig',
          entityId: integration.id,
          changes: JSON.stringify({ name: dto.name, type: dto.type }),
        },
      })
      .catch(() => {});

    return integration;
  }

  async updateIntegration(id: number, dto: UpdateIntegrationDto) {
    await this.getIntegration(id);
    return this.prisma.integrationConfig.update({ where: { id }, data: dto as any });
  }

  async toggleIntegration(id: number) {
    const i = await this.prismaRead.integrationConfig.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Integração não encontrada');

    const updated = await this.prisma.integrationConfig.update({
      where: { id },
      data: { active: !i.active },
    });

    await this.prisma.auditLog
      .create({
        data: {
          userId: 0,
          action: i.active ? 'INTEGRATION_DISABLED' : 'INTEGRATION_ENABLED',
          entity: 'IntegrationConfig',
          entityId: id,
          changes: JSON.stringify({ active: !i.active }),
        },
      })
      .catch(() => {});

    return updated;
  }

  async deleteIntegration(id: number) {
    await this.getIntegration(id);
    await this.prisma.integrationConfig.delete({ where: { id } });
    return { message: 'Integração removida' };
  }

  // ══════════════════════════════════════════════════════
  // TEST CONNECTIVITY
  // ══════════════════════════════════════════════════════

  async testIntegration(id: number) {
    const integration = await this.prismaRead.integrationConfig.findUnique({ where: { id } });
    if (!integration) return { success: false, message: 'Integração não encontrada' };

    const url = integration.baseUrl ?? integration.endpoint;
    const start = Date.now();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (integration.apiKey) headers['Authorization'] = `Bearer ${integration.apiKey}`;

      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000), headers });
      const latencyMs = Date.now() - start;
      const success = res.status < 500;

      await (this.prisma as any).apiIntegrationLog.create({
        data: {
          integrationId: id,
          status: success ? 'OK' : 'ERROR',
          statusCode: res.status,
          message: success ? `Conexão OK (${latencyMs}ms)` : `Erro HTTP ${res.status}`,
          latencyMs,
        },
      });

      return {
        success,
        statusCode: res.status,
        latencyMs,
        message: success ? `Conexão estabelecida (${latencyMs}ms)` : `Erro HTTP ${res.status}`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      await (this.prisma as any).apiIntegrationLog.create({
        data: {
          integrationId: id,
          status: 'ERROR',
          message: (err instanceof Error ? err.message : String(err)) ?? 'Timeout',
          latencyMs,
        },
      });
      return {
        success: false,
        latencyMs,
        message:
          (err instanceof Error ? err.message : String(err)) ?? 'Timeout ou falha de conexão',
      };
    }
  }

  // ══════════════════════════════════════════════════════
  // LOGS
  // ══════════════════════════════════════════════════════

  async getLogs(integrationId: number, filters: IntegrationLogFilterDto = {}) {
    const { page = 1, limit = 50, from, to, status } = filters;
    const skip = (page - 1) * limit;
    const where: any = { integrationId };
    if (status) where.status = { contains: status, mode: 'insensitive' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prismaRead.apiIntegrationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaRead.apiIntegrationLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getAllLogs(filters: IntegrationLogFilterDto = {}) {
    const { page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prismaRead.apiIntegrationLog.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prismaRead.apiIntegrationLog.count(),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ══════════════════════════════════════════════════════
  // API KEYS
  // ══════════════════════════════════════════════════════

  async createApiKey(dto: CreateApiKeyDto, createdById: number) {
    const rawKey = generateApiKey();
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await safeM(this.prisma, 'apiKey')
      .create({
        data: {
          name: dto.name,
          description: dto.description,
          keyHash,
          keyPreview: maskApiKey(rawKey),
          scopes: dto.scopes,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          allowedIps: dto.allowedIps ?? [],
          rateLimit: dto.rateLimit ?? 1000,
          createdById,
          active: true,
        },
      })
      .catch(() => ({
        name: dto.name,
        scopes: dto.scopes,
        message: 'API Key registada (modelo apiKey ausente — execute migration)',
      }));

    await this.prisma.auditLog
      .create({
        data: {
          userId: createdById,
          action: 'API_KEY_CREATED',
          entity: 'ApiKey',
          entityId: null,
          changes: JSON.stringify({ name: dto.name, scopes: dto.scopes }),
        },
      })
      .catch(() => {});

    // Return the raw key ONCE — never stored in plain text
    return { ...apiKey, key: rawKey, message: '⚠️ Guarda esta chave — não será exibida novamente' };
  }

  async getApiKeys(createdById?: number) {
    const where = createdById ? { createdById } : {};
    const keys = await safeM(this.prisma, 'apiKey')
      .findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => [] as any[]);

    return (keys as any[]).map((k: any) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      preview: k.keyPreview,
      scopes: k.scopes,
      expiresAt: k.expiresAt,
      rateLimit: k.rateLimit,
      active: k.active,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));
  }

  async revokeApiKey(keyId: number, userId: number) {
    await safeM(this.prisma, 'apiKey')
      .update({ where: { id: keyId }, data: { active: false } })
      .catch(() => null);
    await this.prisma.auditLog
      .create({
        data: { userId, action: 'API_KEY_REVOKED', entity: 'ApiKey', entityId: keyId },
      })
      .catch(() => {});
    return { message: 'API Key revogada' };
  }

  async rotateApiKey(keyId: number, userId: number) {
    const rawKey = generateApiKey();
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await safeM(this.prisma, 'apiKey')
      .update({
        where: { id: keyId },
        data: { keyHash, keyPreview: maskApiKey(rawKey), rotatedAt: new Date() },
      })
      .catch(() => {});

    await this.prisma.auditLog
      .create({
        data: { userId, action: 'API_KEY_ROTATED', entity: 'ApiKey', entityId: keyId },
      })
      .catch(() => {});

    return { key: rawKey, message: '⚠️ Nova chave gerada — guarda antes de fechar' };
  }

  async validateApiKey(
    rawKey: string,
  ): Promise<{ valid: boolean; scopes: string[]; name: string } | null> {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const key = await safeM(this.prisma, 'apiKey')
      .findFirst({
        where: { keyHash, active: true },
      })
      .catch(() => null);

    if (!key) return null;
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;

    // Update last used
    safeM(this.prisma, 'apiKey')
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return { valid: true, scopes: key.scopes ?? [], name: key.name };
  }

  // ══════════════════════════════════════════════════════
  // WEBHOOKS
  // ══════════════════════════════════════════════════════

  async createWebhook(dto: CreateWebhookDto, createdById: number) {
    const secret = dto.secret ?? crypto.randomBytes(20).toString('hex');

    return safeM(this.prisma, 'webhook')
      .create({
        data: {
          name: dto.name,
          url: dto.url,
          events: dto.events,
          secret,
          active: dto.active ?? true,
          retryMax: dto.retryMax ?? 3,
          createdById,
        },
      })
      .catch(() => ({
        name: dto.name,
        url: dto.url,
        events: dto.events,
        secret,
        message: 'Webhook registado (modelo webhook ausente — execute migration)',
      }));
  }

  async getWebhooks() {
    const hooks = await safeM(this.prisma, 'webhook')
      .findMany({ orderBy: { createdAt: 'desc' } })
      .catch(() => [] as any[]);
    // Enrich with delivery stats
    return Promise.all(
      (hooks as any[]).map(async (h: any) => {
        const delivered = await safeM(this.prisma, 'webhookDelivery')
          .count({ where: { webhookId: h.id, status: 'DELIVERED' } })
          .catch(() => 0);
        const failed = await safeM(this.prisma, 'webhookDelivery')
          .count({ where: { webhookId: h.id, status: 'FAILED' } })
          .catch(() => 0);
        return { ...h, secret: '••••••••', stats: { delivered, failed } };
      }),
    );
  }

  async toggleWebhook(id: number) {
    return safeM(this.prisma, 'webhook')
      .update({
        where: { id },
        data: { active: (hook: any) => !hook.active },
      })
      .catch(() => ({ id, message: 'Toggled' }));
  }

  async deleteWebhook(id: number) {
    await safeM(this.prisma, 'webhook')
      .delete({ where: { id } })
      .catch(() => null);
    return { message: 'Webhook removido' };
  }

  async triggerWebhook(dto: TriggerWebhookDto) {
    // Find all active webhooks subscribed to this event
    const hooks = await safeM(this.prisma, 'webhook')
      .findMany({
        where: { active: true },
      })
      .catch(() => [] as any[]);

    const subscribers = (hooks as any[]).filter(
      (h: any) => (h.events ?? []).includes(dto.event) || (h.events ?? []).includes('*'),
    );

    if (!subscribers.length) return { dispatched: 0, message: 'Sem subscribers para este evento' };

    const dispatched: any[] = [];
    for (const hook of subscribers) {
      await this.dispatchWebhook(hook, dto.event, dto.payload);
      dispatched.push({ webhookId: hook.id, url: hook.url });
    }

    return { dispatched: dispatched.length, webhooks: dispatched };
  }

  private async dispatchWebhook(hook: any, event: string, payload: any): Promise<void> {
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = hook.secret ? signPayload(hook.secret, body) : undefined;

    const deliveryId = await safeM(this.prisma, 'webhookDelivery')
      .create({
        data: { webhookId: hook.id, event, payload: body, status: 'PENDING', attempt: 1 },
      })
      .then((d: any) => d.id)
      .catch(() => null);

    let attempt = 0;
    const maxAttempts = (hook.retryMax ?? 3) + 1;

    while (attempt < maxAttempts) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Innova-Event': event,
          'X-Innova-Delivery': deliveryId ?? `del_${Date.now()}`,
        };
        if (signature) headers['X-Innova-Signature'] = signature;

        const res = await fetch(hook.url, {
          method: 'POST',
          body,
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          if (deliveryId) {
            await safeM(this.prisma, 'webhookDelivery')
              .update({
                where: { id: deliveryId },
                data: {
                  status: 'DELIVERED',
                  deliveredAt: new Date(),
                  attempts: attempt + 1,
                  responseCode: res.status,
                },
              })
              .catch(() => {});
          }
          return;
        }
        this.logger.warn(`Webhook ${hook.id} attempt ${attempt + 1} failed: HTTP ${res.status}`);
      } catch (err: any) {
        this.logger.warn(
          `Webhook ${hook.id} attempt ${attempt + 1} error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      attempt++;
      if (attempt < maxAttempts) {
        const delay = (RETRY_DELAYS[attempt - 1] ?? 1800) * 1000;
        await new Promise(r => setTimeout(r, Math.min(delay, 5000))); // cap at 5s in dev
      }
    }

    // All attempts exhausted → mark as FAILED
    if (deliveryId) {
      await safeM(this.prisma, 'webhookDelivery')
        .update({
          where: { id: deliveryId },
          data: { status: 'FAILED', attempts: maxAttempts },
        })
        .catch(() => {});
    }
    this.logger.error(`Webhook ${hook.id} permanently failed after ${maxAttempts} attempts`);
  }

  async getWebhookDeliveries(webhookId: number, limit = 20) {
    return safeM(this.prisma, 'webhookDelivery')
      .findMany({
        where: { webhookId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      .catch(() => [] as any[]);
  }

  // ══════════════════════════════════════════════════════
  // STATS & MONITORING
  // ══════════════════════════════════════════════════════

  async getStats() {
    const since24h = new Date(Date.now() - 86400000);
    const since7d = new Date(Date.now() - 7 * 86400000);

    const [
      totalIntegrations,
      activeIntegrations,
      totalLogs24h,
      errorLogs24h,
      avgLatency,
      totalWebhooks,
      apiKeys,
    ] = await Promise.all([
      this.prismaRead.integrationConfig.count(),
      this.prismaRead.integrationConfig.count({ where: { active: true } }),
      this.prismaRead.apiIntegrationLog.count({ where: { createdAt: { gte: since24h } } }),
      this.prismaRead.apiIntegrationLog.count({
        where: { createdAt: { gte: since24h }, status: 'ERROR' },
      }),
      (this.prisma as any).apiIntegrationLog
        .aggregate({
          where: { createdAt: { gte: since24h } },
          _avg: { latencyMs: true },
        })
        .catch(() => ({ _avg: { latencyMs: null } })),
      safeM(this.prisma, 'webhook')
        .count({ where: { active: true } })
        .catch(() => 0),
      safeM(this.prisma, 'apiKey')
        .count({ where: { active: true } })
        .catch(() => 0),
    ]);

    // Per-integration health
    const integrations = await this.prismaRead.integrationConfig.findMany({
      select: { id: true, name: true, active: true },
    });
    const integrationHealth = await Promise.all(
      integrations.map(async i => {
        const logs7d = await this.prismaRead.apiIntegrationLog.count({
          where: { integrationId: i.id, createdAt: { gte: since7d } },
        });
        const errors7d = await this.prismaRead.apiIntegrationLog.count({
          where: { integrationId: i.id, status: 'ERROR', createdAt: { gte: since7d } },
        });
        const errorRate = logs7d > 0 ? +((errors7d / logs7d) * 100).toFixed(1) : 0;
        const health = !i.active
          ? 'INACTIVE'
          : errorRate > 20
            ? 'ERROR'
            : errorRate > 5
              ? 'DEGRADED'
              : 'OK';
        return { id: i.id, name: i.name, active: i.active, logs7d, errorRate, health };
      }),
    );

    const errorRate24h = totalLogs24h > 0 ? +((errorLogs24h / totalLogs24h) * 100).toFixed(1) : 0;

    return {
      summary: {
        totalIntegrations,
        activeIntegrations,
        totalLogs24h,
        errorLogs24h,
        errorRate24h,
        avgLatencyMs: avgLatency._avg.latencyMs ? +avgLatency._avg.latencyMs.toFixed(0) : null,
        activeWebhooks: totalWebhooks,
        activeApiKeys: apiKeys,
      },
      integrationHealth,
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // INTERNAL: emit platform event to webhooks
  // ══════════════════════════════════════════════════════

  async emitPlatformEvent(event: string, payload: any) {
    return this.triggerWebhook({ event: event as any, payload });
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  private computeHealth(lastLog: any): string {
    if (!lastLog) return 'UNKNOWN';
    if (lastLog.status === 'ERROR') return 'ERROR';
    const ageMs = Date.now() - new Date(lastLog.createdAt).getTime();
    if (ageMs > 24 * 3600000) return 'STALE';
    return 'OK';
  }
}
