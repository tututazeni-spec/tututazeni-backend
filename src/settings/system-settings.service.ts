// src/settings/system-settings.service.ts
// Definições de Sistema (docs/modulo_settings.md §15): modo de manutenção,
// tecto de paginação, limites de uploads, e operação de cache e filas (jobs).
import { getDatabaseSizeBytes } from '../common/helpers/db-size';
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_REDIS } from '../cache/cache.constants';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { ALLOWED_MIME_TYPES } from '../common/validators/allowed-mime-types';
import { UpdateSystemSettingsDto } from './settings.dto';
import {
  CACHE_NAMESPACES,
  CacheNamespace,
  MAX_PAGE_SIZE_CEILING,
  MAX_UPLOAD_MB_CEILING,
  SYSTEM_QUEUE_NAMES,
  SystemQueueName,
  SystemSettings,
  parseSystemSettings,
} from './system-settings';

const TTL_MS = 10_000;

@Injectable()
export class SystemSettingsService {
  private cache: { at: number; settings: SystemSettings } | null = null;
  private readonly queues: Record<SystemQueueName, Queue>;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('audit') audit: Queue,
    @InjectQueue('email') email: Queue,
    @InjectQueue('notifications') notifications: Queue,
    @InjectQueue('webhooks') webhooks: Queue,
    @Optional() @Inject(CACHE_REDIS) private readonly redis?: Redis,
  ) {
    this.queues = { audit, email, notifications, webhooks };
  }

  /** Lido em cada pedido pelo interceptor — cache curta em memória. */
  async load(): Promise<SystemSettings> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.settings;
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUnique({
      where: { id },
      select: { systemSettingsJson: true },
    });
    const settings = parseSystemSettings(row?.systemSettingsJson);
    this.cache = { at: Date.now(), settings };
    return settings;
  }

  async get() {
    return {
      settings: await this.load(),
      limits: {
        maxPageSizeCeiling: MAX_PAGE_SIZE_CEILING,
        maxUploadMbCeiling: MAX_UPLOAD_MB_CEILING,
      },
      mimeTypeOptions: ALLOWED_MIME_TYPES,
      queueNames: SYSTEM_QUEUE_NAMES,
      cacheNamespaces: CACHE_NAMESPACES,
    };
  }

  async update(dto: UpdateSystemSettingsDto, actorId?: number) {
    const id = await resolveDefaultTenantId(this.prisma);
    const cur = await this.load();
    const next: SystemSettings = {
      maintenance: { ...cur.maintenance, ...dto.maintenance },
      pagination: { ...cur.pagination, ...dto.pagination },
      uploads: { ...cur.uploads, ...dto.uploads },
      jobs: { ...cur.jobs, ...dto.jobs },
    };
    await this.prisma.tenantConfig.update({
      where: { id },
      data: { systemSettingsJson: JSON.stringify(next) },
    });
    this.cache = null;
    await this.audit(actorId, 'SETTINGS_SYSTEM_UPDATE', 'HIGH', { before: cur, after: next });
    return this.get();
  }

  // ─── Estado ───────────────────────────────────────────────────────────────

  async status() {
    const [queues, cache, db] = await Promise.all([
      Promise.all(
        SYSTEM_QUEUE_NAMES.map(async name => {
          const q = this.queues[name];
          const [counts, paused] = await Promise.all([
            q.getJobCounts().catch(() => null),
            q.isPaused().catch(() => false),
          ]);
          return { name, paused, counts };
        }),
      ),
      this.cacheStatus(),
      this.dbStatus(),
    ]);
    return {
      queues,
      cache,
      db,
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        env: process.env.NODE_ENV ?? 'development',
      },
    };
  }

  private async cacheStatus() {
    if (!this.redis) return { connected: false };
    try {
      const [info, keys] = await Promise.all([this.redis.info('memory'), this.redis.dbsize()]);
      const used = /used_memory:(\d+)/.exec(info)?.[1];
      return {
        connected: true,
        keys,
        usedMemoryMb: used ? Math.round(Number(used) / 1024 / 1024) : null,
        enabled: process.env.CACHE_ENABLED !== 'false',
      };
    } catch {
      return { connected: false };
    }
  }

  private async dbStatus() {
    const started = Date.now();
    try {
      const size = await getDatabaseSizeBytes(this.prisma);
      return {
        connected: true,
        latencyMs: Date.now() - started,
        sizeMb: Math.round(Number(size) / 1024 / 1024),
        poolMax: Number(process.env.DB_POOL_MAX ?? 50),
      };
    } catch {
      return { connected: false };
    }
  }

  // ─── Acções ───────────────────────────────────────────────────────────────

  async flushCache(namespace: CacheNamespace, actorId: number) {
    if (!(CACHE_NAMESPACES as readonly string[]).includes(namespace)) {
      throw new BadRequestException('Namespace de cache desconhecido');
    }
    if (!this.redis) throw new BadRequestException('Cache (Redis) indisponível');
    let removed = 0;
    // SCAN em vez de KEYS/FLUSHDB: o mesmo Redis guarda as filas Bull e as quotas.
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${namespace}:*`, 'COUNT', 500);
      cursor = next;
      if (keys.length) removed += await this.redis.del(...keys);
    } while (cursor !== '0');
    await this.audit(actorId, 'SETTINGS_SYSTEM_CACHE_FLUSH', 'MEDIUM', { namespace, removed });
    return { namespace, removed };
  }

  private queue(name: string): Queue {
    const q = this.queues[name as SystemQueueName];
    if (!q) throw new BadRequestException('Fila desconhecida');
    return q;
  }

  async setQueuePaused(name: string, paused: boolean, actorId: number) {
    const q = this.queue(name);
    if (paused) await q.pause();
    else await q.resume();
    await this.audit(
      actorId,
      paused ? 'SETTINGS_SYSTEM_QUEUE_PAUSE' : 'SETTINGS_SYSTEM_QUEUE_RESUME',
      'HIGH',
      {
        queue: name,
      },
    );
    return this.status();
  }

  /** Remove jobs concluídos e falhados mais antigos que a retenção configurada. */
  async cleanQueue(name: string, actorId: number) {
    const q = this.queue(name);
    const graceMs = (await this.load()).jobs.retentionDays * 24 * 3_600_000;
    const [completed, failed] = await Promise.all([
      q.clean(graceMs, 'completed'),
      q.clean(graceMs, 'failed'),
    ]);
    await this.audit(actorId, 'SETTINGS_SYSTEM_QUEUE_CLEAN', 'MEDIUM', {
      queue: name,
      completed: completed.length,
      failed: failed.length,
    });
    return { queue: name, completed: completed.length, failed: failed.length };
  }

  /** Volta a pôr em fila os jobs falhados (até 100). */
  async retryFailed(name: string, actorId: number) {
    const q = this.queue(name);
    const jobs = await q.getFailed(0, 99);
    await Promise.all(jobs.map(j => j.retry().catch(() => undefined)));
    await this.audit(actorId, 'SETTINGS_SYSTEM_QUEUE_RETRY', 'MEDIUM', {
      queue: name,
      retried: jobs.length,
    });
    return { queue: name, retried: jobs.length };
  }

  private audit(
    userId: number | undefined,
    action: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    metadata: unknown,
  ) {
    return writeChainedAuditLog(this.prisma, {
      userId,
      action,
      entity: 'Settings',
      severity,
      metadata: JSON.stringify(metadata),
    }).catch(() => undefined);
  }
}
