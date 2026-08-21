// src/audit/audit.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditFilterDto, LogAuditDto, AuditSeverity, AuditStatus } from './audit.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import * as crypto from 'crypto';

// Shape mínimo de um Request Express usado por logCreate/logUpdate/logDelete
// — só ip/headers são lidos, por isso não vale a pena importar o tipo real
// do Express aqui.
interface AuditRequestLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  // ─── HASH CHAIN ───────────────────────────────────────────────────────────
  // Cada log inclui hash do anterior — garante imutabilidade encadeada

  private async buildHash(
    userId: number | null,
    action: string,
    entity: string,
    entityId: number | undefined,
    timestamp: Date,
    previousHash: string,
  ): Promise<string> {
    const payload = `${userId}|${action}|${entity}|${entityId ?? ''}|${timestamp.toISOString()}|${previousHash}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  private async getLastHash(): Promise<string> {
    const last = await this.prisma.auditLog.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { hash: true },
    });
    return last?.hash ?? 'GENESIS';
  }

  // ─── LOG PRINCIPAL ────────────────────────────────────────────────────────

  async log(dto: LogAuditDto) {
    try {
      const now = new Date();
      const prev = await this.getLastHash();
      const hash = await this.buildHash(
        dto.userId,
        dto.action,
        dto.entity,
        dto.entityId,
        now,
        prev,
      );

      const entry = await this.prisma.auditLog.create({
        data: {
          userId: dto.userId,
          action: dto.action,
          entity: dto.entity,
          entityId: dto.entityId,
          entityName: dto.entityName,
          before: dto.before ? JSON.stringify(dto.before) : undefined,
          after: dto.after ? JSON.stringify(dto.after) : undefined,
          changes: dto.changes ? JSON.stringify(dto.changes) : undefined,
          status: dto.status ?? 'SUCCESS',
          severity: dto.severity ?? this.inferSeverity(dto.action, dto.entity),
          ip: dto.ip,
          userAgent: dto.userAgent,
          reason: dto.reason,
          metadata: dto.metadata ? JSON.stringify(dto.metadata) : undefined,
          hash,
          previousHash: prev,
          timestamp: now,
        },
      });

      // Detectar anomalias automaticamente
      this.detectAnomalies(entry).catch((err: unknown) =>
        this.logger.warn({
          action: dto.action,
          entity: dto.entity,
          entityId: dto.entityId,
          err: { message: err instanceof Error ? err.message : String(err) },
          msg: 'Falha ao detectar anomalias para este audit log',
        }),
      );

      return entry;
    } catch (e: unknown) {
      // Falha aqui quebra a cadeia de hash de compliance — mantém-se sem rethrow
      // para não reverter a operação de negócio que gerou este log, mas fica
      // registada com todo o contexto para investigação (findAll/getStats não
      // vão mostrar este evento).
      this.logger.error({
        userId: dto.userId,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId,
        err: {
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        },
        msg: 'Falha ao registar audit log — cadeia de compliance quebrada',
      });
    }
  }

  // Atalhos semânticos usados pelos outros módulos
  async logCreate(
    userId: number,
    entity: string,
    entityId: number,
    after?: Record<string, unknown>,
    req?: AuditRequestLike,
  ) {
    return this.log({
      userId,
      action: 'CREATE',
      entity,
      entityId,
      after,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'] as string | undefined,
    });
  }

  async logUpdate(
    userId: number,
    entity: string,
    entityId: number,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
    req?: AuditRequestLike,
  ) {
    const changes = this.diffObjects(before, after);
    return this.log({
      userId,
      action: 'UPDATE',
      entity,
      entityId,
      before,
      after,
      changes,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'] as string | undefined,
    });
  }

  async logDelete(
    userId: number,
    entity: string,
    entityId: number,
    before?: Record<string, unknown>,
    req?: AuditRequestLike,
  ) {
    return this.log({
      userId,
      action: 'DELETE',
      entity,
      entityId,
      before,
      severity: AuditSeverity.HIGH,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'] as string | undefined,
    });
  }

  async logLogin(userId: number, success: boolean, ip?: string, userAgent?: string) {
    return this.log({
      userId,
      action: success ? 'LOGIN' : 'FAILED',
      entity: 'Auth',
      status: success ? AuditStatus.SUCCESS : AuditStatus.FAILED,
      severity: success ? AuditSeverity.MEDIUM : AuditSeverity.HIGH,
      ip,
      userAgent,
    });
  }

  async logExport(userId: number, entity: string, format: string, count: number, ip?: string) {
    return this.log({
      userId,
      action: 'EXPORT',
      entity,
      severity: AuditSeverity.HIGH,
      metadata: { format, count },
      ip,
    });
  }

  async logSensitiveRead(userId: number, entity: string, entityId: number, ip?: string) {
    return this.log({
      userId,
      action: 'READ',
      entity,
      entityId,
      severity: AuditSeverity.HIGH,
      ip,
    });
  }

  // ─── DIFF ─────────────────────────────────────────────────────────────────

  private diffObjects(
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ): Record<string, { from: unknown; to: unknown }> {
    if (!before || !after) return {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    return changes;
  }

  private inferSeverity(action: string, entity: string): AuditSeverity {
    const critical = ['DELETE', 'LOGIN', 'FAILED', 'DENIED', 'EXPORT'];
    const high = ['UPDATE', 'APPROVE', 'REJECT'];
    const sensitiveEntities = ['User', 'Payslip', 'Role', 'Permission', 'ProcessStandard'];

    if (sensitiveEntities.some(e => entity.includes(e))) return AuditSeverity.HIGH;
    if (critical.includes(action)) return AuditSeverity.HIGH;
    if (high.includes(action)) return AuditSeverity.MEDIUM;
    return AuditSeverity.LOW;
  }

  // ─── DETECÇÃO DE ANOMALIAS ────────────────────────────────────────────────

  private async detectAnomalies(entry: AuditLog) {
    const userId = entry.userId;
    if (!userId) return;

    const window5min = new Date(Date.now() - 5 * 60 * 1000);
    const window1h = new Date(Date.now() - 60 * 60 * 1000);

    // Regra 1: Múltiplos logins falhados (>5 em 5 min)
    if (entry.action === 'FAILED') {
      const failCount = await this.prisma.read.auditLog.count({
        where: { userId, action: 'FAILED', timestamp: { gte: window5min } },
      });
      if (failCount >= 5) {
        this.logger.warn({
          userId,
          action: 'ANOMALY_FAILED_LOGIN',
          failCount,
          msg: 'Anomalia: múltiplos logins falhados em 5min',
        });
        await this.prisma.notificationLog
          .create({
            data: {
              userId: 1, // admin
              type: 'SECURITY_ALERT',
              message: `Múltiplos logins falhados (${failCount}x em 5min) para userId=${userId}`,
              priority: 'CRITICAL',
              metadata: JSON.stringify({}),
            },
          })
          .catch((err: unknown) =>
            this.logger.warn({
              userId,
              action: 'ANOMALY_FAILED_LOGIN',
              err: { message: err instanceof Error ? err.message : String(err) },
              msg: 'Falha ao registar notificação de alerta de segurança',
            }),
          );
      }
    }

    // Regra 2: Exportações em massa (>3 em 1h)
    if (entry.action === 'EXPORT') {
      const exportCount = await this.prisma.read.auditLog.count({
        where: { userId, action: 'EXPORT', timestamp: { gte: window1h } },
      });
      if (exportCount >= 3) {
        this.logger.warn({
          userId,
          action: 'ANOMALY_MASS_EXPORT',
          exportCount,
          msg: 'Anomalia: exportações em massa em 1h',
        });
      }
    }

    // Regra 3: Deleção em massa (>10 em 1h)
    if (entry.action === 'DELETE') {
      const deleteCount = await this.prisma.read.auditLog.count({
        where: { userId, action: 'DELETE', timestamp: { gte: window1h } },
      });
      if (deleteCount >= 10) {
        this.logger.warn({
          userId,
          action: 'ANOMALY_MASS_DELETE',
          deleteCount,
          msg: 'Anomalia: deleção em massa em 1h',
        });
      }
    }
  }

  // ─── CONSULTA ─────────────────────────────────────────────────────────────

  async findAll(filters: AuditFilterDto) {
    const {
      page = 1,
      limit = 50,
      userId,
      entity,
      entityId,
      action,
      severity,
      status,
      ip,
      from,
      to,
      criticalOnly,
    } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.AuditLogWhereInput = {};
    if (userId) where.userId = userId;
    if (entityId) where.entityId = entityId;
    if (ip) where.ip = { contains: ip };
    if (entity) where.entity = { contains: entity, mode: 'insensitive' };
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (severity) where.severity = severity;
    if (status) where.status = status;
    if (criticalOnly) where.severity = { in: ['CRITICAL', 'HIGH'] };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        skip,
        take,
        include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.read.auditLog.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    return this.prisma.read.auditLog.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  // ─── TIMELINE POR RECURSO ─────────────────────────────────────────────────

  async getTimeline(entity: string, entityId: number) {
    const logs = await this.prisma.read.auditLog.findMany({
      where: { entity: { contains: entity, mode: 'insensitive' }, entityId },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { timestamp: 'asc' },
      take: 200,
    });

    return {
      entity,
      entityId,
      events: logs.map(l => ({
        id: l.id,
        action: l.action,
        severity: l.severity,
        status: l.status,
        user: l.user,
        timestamp: l.timestamp,
        changes: l.changes ? JSON.parse(l.changes) : null,
        reason: l.reason,
        ip: l.ip,
      })),
    };
  }

  // ─── HISTÓRICO DO UTILIZADOR ──────────────────────────────────────────────

  async getUserHistory(userId: number) {
    const [auditLogs, historyRecords] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      this.prisma.read.historyRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { auditLogs, historyRecords };
  }

  // ─── STATS ────────────────────────────────────────────────────────────────

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [
      total,
      todayCount,
      criticalCount,
      byAction,
      byEntity,
      bySeverity,
      byStatus,
      topUsers,
      failedLogins,
      recentCritical,
    ] = await Promise.all([
      this.prisma.read.auditLog.count(),
      this.prisma.read.auditLog.count({ where: { timestamp: { gte: today } } }),
      this.prisma.read.auditLog.count({ where: { severity: { in: ['CRITICAL', 'HIGH'] } } }),
      this.prisma.read.auditLog.groupBy({
        by: ['action'],
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['entity'],
        _count: true,
        orderBy: { _count: { entity: 'desc' } },
        take: 10,
      }),
      this.prisma.read.auditLog.groupBy({ by: ['severity'], _count: true }),
      this.prisma.read.auditLog.groupBy({ by: ['status'], _count: true }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { userId: { not: null } },
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      }),
      this.prisma.read.auditLog.count({ where: { action: 'FAILED', timestamp: { gte: today } } }),
      this.prisma.read.auditLog.findMany({
        where: { severity: { in: ['CRITICAL', 'HIGH'] }, timestamp: { gte: weekAgo } },
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
    ]);

    return {
      totals: {
        total,
        today: todayCount,
        critical: criticalCount,
        failedLoginsToday: failedLogins,
      },
      byAction: byAction.map(a => ({ action: a.action, count: a._count })),
      byEntity: byEntity.map(e => ({ entity: e.entity, count: e._count })),
      bySeverity: Object.fromEntries(bySeverity.map(s => [s.severity ?? 'N/D', s._count])),
      byStatus: Object.fromEntries(byStatus.map(s => [s.status ?? 'N/D', s._count])),
      topUsers,
      recentCritical,
    };
  }

  // ─── VERIFICAÇÃO DE INTEGRIDADE ───────────────────────────────────────────

  async verifyIntegrity(
    limit = 100,
  ): Promise<{ valid: boolean; broken: number[]; checked: number }> {
    const logs = await this.prisma.read.auditLog.findMany({
      orderBy: { timestamp: 'asc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        action: true,
        entity: true,
        entityId: true,
        timestamp: true,
        hash: true,
        previousHash: true,
      },
    });

    const broken: number[] = [];
    let prev = 'GENESIS';

    for (const log of logs) {
      const expected = await this.buildHash(
        log.userId,
        log.action,
        log.entity,
        log.entityId ?? undefined,
        new Date(log.timestamp),
        log.previousHash ?? 'GENESIS',
      );
      if (log.hash !== expected || log.previousHash !== prev) {
        broken.push(log.id);
      }
      prev = log.hash ?? '';
    }

    return { valid: broken.length === 0, broken, checked: logs.length };
  }

  // ─── EXPORT ───────────────────────────────────────────────────────────────

  async exportLogs(filters: AuditFilterDto, requesterId: number) {
    const result = await this.findAll({ ...filters, limit: 10000, page: 1 });

    // Registar a própria exportação como evento auditável
    await this.log({
      userId: requesterId,
      action: 'EXPORT',
      entity: 'AuditLog',
      severity: AuditSeverity.HIGH,
      metadata: { exported: result.total },
    });

    return {
      exported: result.total,
      data: result.data.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        user: `${log.user?.fullName ?? 'Sistema'} (${log.user?.email ?? '—'})`,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        severity: log.severity,
        status: log.status,
        ip: log.ip,
        reason: log.reason,
        hash: log.hash,
      })),
    };
  }

  // ─── ANOMALIAS ────────────────────────────────────────────────────────────

  async getAnomalySummary() {
    const hour1 = new Date(Date.now() - 1 * 3600 * 1000);
    const hour24 = new Date(Date.now() - 24 * 3600 * 1000);

    const [failedLogins, massExports, massDeletes] = await Promise.all([
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { action: 'FAILED', timestamp: { gte: hour1 } },
        _count: true,
        having: { userId: { _count: { gte: 3 } } },
        orderBy: { _count: { userId: 'desc' } },
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { action: 'EXPORT', timestamp: { gte: hour1 } },
        _count: true,
        having: { userId: { _count: { gte: 3 } } },
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { action: 'DELETE', timestamp: { gte: hour24 } },
        _count: true,
        having: { userId: { _count: { gte: 5 } } },
      }),
    ]);

    return {
      suspiciousLogins: failedLogins.map(f => ({ userId: f.userId, count: f._count })),
      massExports: massExports.map(e => ({ userId: e.userId, count: e._count })),
      massDeletes: massDeletes.map(d => ({ userId: d.userId, count: d._count })),
      totalAlerts: failedLogins.length + massExports.length + massDeletes.length,
    };
  }
}
