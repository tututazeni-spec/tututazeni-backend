import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../prisma/prisma.service';
import {
  AuditFilterDto, CreateAuditLogDto,
  AuditSeverity, AuditStatus,
} from './audit.dto';
import * as crypto from 'crypto';
 
// Alias — o ficheiro exporta LogAuditDto = CreateAuditLogDto
type LogAuditDto = CreateAuditLogDto;
 
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
 
  constructor(private prisma: PrismaService) {}
 
  // ─── HASH CHAIN ─────────────────────────────────────────────────
 
  private async buildHash(
    userId: number | null,
    action: string,
    entity: string,
    entityId: number | undefined,
    timestamp: Date,
    previousHash: string,
  ): Promise<string> {
    const payload =
      `${userId}|${action}|${entity}|${entityId ?? ''}|${timestamp.toISOString()}|${previousHash}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
 
  private async getLastHash(): Promise<string> {
    const last = await (this.prisma.auditLog as any).findFirst({
      orderBy: { timestamp: 'desc' },
      select:  { hash: true },
    });
    return last?.hash ?? 'GENESIS';
  }
 
  // ─── LOG PRINCIPAL ──────────────────────────────────────────────
 
  async log(dto: LogAuditDto) {
    try {
      const now  = new Date();
      const prev = await this.getLastHash();
      const hash = await this.buildHash(
        dto.userId ?? null,
        dto.action,
        dto.entity,
        dto.entityId,
        now,
        prev,
      );
 
      const entry = await (this.prisma.auditLog as any).create({
        data: {
          userId:       dto.userId,
          action:       dto.action,
          entity:       dto.entity,
          entityId:     dto.entityId,
          entityName:   dto.entityName,
          before:       dto.before  ? JSON.stringify(dto.before)  : undefined,
          after:        dto.after   ? JSON.stringify(dto.after)   : undefined,
          changes:      dto.changes ? JSON.stringify(dto.changes) : undefined,
          status:       dto.status     ?? 'SUCCESS',
          severity:     dto.severity   ?? this.inferSeverity(dto.action, dto.entity),
          ip:           dto.ip,
          userAgent:    dto.userAgent,
          reason:       dto.reason,
          metadata:     dto.metadata ? JSON.stringify(dto.metadata) : undefined,
          hash,
          previousHash: prev,
          timestamp:    now,
        },
      });
 
      this.detectAnomalies(entry).catch(() => {});
      return entry;
    } catch (e) {
      this.logger.error('Falha ao registar audit log:', e);
    }
  }
 
  async logCreate(userId: number, entity: string, entityId: number, after?: any, req?: any) {
    return this.log({ userId, action: 'CREATE', entity, entityId, after,
      ip: req?.ip, userAgent: req?.headers?.['user-agent'] });
  }
  async logUpdate(userId: number, entity: string, entityId: number,
                   before?: any, after?: any, req?: any) {
    return this.log({ userId, action: 'UPDATE', entity, entityId, before, after,
      ip: req?.ip, userAgent: req?.headers?.['user-agent'] });
  }
  async logDelete(userId: number, entity: string, entityId: number, before?: any, req?: any) {
    return this.log({ userId, action: 'DELETE', entity, entityId, before,
      severity: AuditSeverity.HIGH, ip: req?.ip, userAgent: req?.headers?.['user-agent'] });
  }
  async logLogin(userId: number, success: boolean, ip?: string, userAgent?: string) {
    return this.log({
      userId, action: success ? 'LOGIN' : 'FAILED', entity: 'Auth',
      status:   success ? AuditStatus.SUCCESS : AuditStatus.FAILED,
      severity: success ? AuditSeverity.MEDIUM : AuditSeverity.HIGH,
      ip, userAgent,
    });
  }
 
  // ─── DIFF ───────────────────────────────────────────────────────
 
  private diffObjects(before: any, after: any) {
    if (!before || !after) return {};
    const changes: Record<string, { from: any; to: any }> = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    return changes;
  }
 
  private inferSeverity(action: string, entity: string): string {
    const critical = ['DELETE','LOGIN','FAILED','DENIED','EXPORT'];
    const high     = ['UPDATE','APPROVE','REJECT'];
    const sensitive = ['User','Payslip','Role','Permission','ProcessStandard'];
    if (sensitive.some(e => entity.includes(e))) return 'HIGH';
    if (critical.includes(action)) return 'HIGH';
    if (high.includes(action))     return 'MEDIUM';
    return 'LOW';
  }
 
  // ─── ANOMALIAS ──────────────────────────────────────────────────
 
  private async detectAnomalies(entry: any) {
    const userId = entry?.userId;
    if (!userId) return;
    const window5min = new Date(Date.now() - 5 * 60 * 1000);
    const window1h   = new Date(Date.now() - 60 * 60 * 1000);
 
    if (entry.action === 'FAILED') {
      const failCount = await (this.prisma.auditLog as any).count({
        where: { userId, action: 'FAILED', timestamp: { gte: window5min } },
      });
      if (failCount >= 5) {
        this.logger.warn(`ANOMALIA: ${failCount} logins falhados userId=${userId}`);
        await this.prisma.notificationLog.create({
          data: { userId: 1, type: 'SECURITY_ALERT',
            message: `Múltiplos logins falhados (${failCount}x em 5min) userId=${userId}`,
            metadata: JSON.stringify({ anomaly: 'BRUTE_FORCE', targetUserId: userId }),
          },
        }).catch(() => {});
      }
    }
  }
 
  // ─── CONSULTA ───────────────────────────────────────────────────
 
  async findAll(filters: AuditFilterDto) {
    const {
      page = 1, limit = 50, userId, entity, entityId,
      action, severity, status, ip, from, to, criticalOnly,
    } = filters;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (userId)       where.userId   = userId;
    if ((filters as any).entityId) where.entityId = (filters as any).entityId;
    if (ip)           where.ip       = { contains: ip };
    if (entity)       where.entity   = { contains: entity,  mode: 'insensitive' };
    if (action)       where.action   = { contains: action,  mode: 'insensitive' };
    if (severity)     where.severity = severity;
    if (status)       where.status   = status;
    if (criticalOnly) where.severity = { in: ['CRITICAL','HIGH'] };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to)   where.timestamp.lte = new Date(to);
    }
 
    const [data, total] = await Promise.all([
      (this.prisma.auditLog as any).findMany({
        where, skip, take: limit,
        include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      (this.prisma.auditLog as any).count({ where }),
    ]);
 
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    return (this.prisma.auditLog as any).findUnique({
      where:   { id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }
 
  async getTimeline(entity: string, entityId: number) {
    const logs = await (this.prisma.auditLog as any).findMany({
      where:   { entity: { contains: entity, mode: 'insensitive' }, entityId },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { timestamp: 'asc' },
      take:    200,
    });
    return {
      entity, entityId,
      events: logs.map((l: any) => ({
        id:       l.id,  action:   l.action,  severity:  l.severity,
        status:   l.status, user: l.user,     timestamp: l.timestamp,
        changes:  l.changes ? JSON.parse(l.changes) : null,
        reason:   l.reason, ip: l.ip,
      })),
    };
  }
 
  async getStats() {
    const today   = new Date(); today.setHours(0,0,0,0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const [total, todayCount, criticalCount, byAction, byEntity, topUsers] =
      await Promise.all([
        (this.prisma.auditLog as any).count(),
        (this.prisma.auditLog as any).count({ where: { timestamp: { gte: today } } }),
        (this.prisma.auditLog as any).count({ where: { severity: { in: ['CRITICAL','HIGH'] } } }),
        (this.prisma.auditLog as any).groupBy({ by: ['action'], _count: true,
          orderBy: { _count: { action: 'desc' } }, take: 10 }),
        (this.prisma.auditLog as any).groupBy({ by: ['entity'], _count: true,
          orderBy: { _count: { entity: 'desc' } }, take: 10 }),
        (this.prisma.auditLog as any).groupBy({ by: ['userId'],
          where: { userId: { not: null } }, _count: true,
          orderBy: { _count: { userId: 'desc' } }, take: 5 }),
      ]);
 
    return {
      totals:   { total, today: todayCount, critical: criticalCount },
      byAction: byAction.map((a: any) => ({ action: a.action, count: a._count })),
      byEntity: byEntity.map((e: any) => ({ entity: e.entity, count: e._count })),
      topUsers,
    };
  }
 
  async verifyIntegrity(limit = 100) {
    const logs = await (this.prisma.auditLog as any).findMany({
      orderBy: { timestamp: 'asc' }, take: limit,
      select: { id: true, userId: true, action: true, entity: true,
                entityId: true, timestamp: true, hash: true, previousHash: true },
    });
    const broken: number[] = [];
    let prev = 'GENESIS';
    for (const log of logs) {
      const expected = await this.buildHash(
        log.userId, log.action, log.entity, log.entityId ?? undefined,
        new Date(log.timestamp), log.previousHash ?? 'GENESIS',
      );
      if (log.hash !== expected || log.previousHash !== prev) broken.push(log.id);
      prev = log.hash ?? '';
    }
    return { valid: broken.length === 0, broken, checked: logs.length };
  }
 
  async getUserHistory(userId: number) {
    const [auditLogs, historyRecords] = await Promise.all([
      (this.prisma.auditLog as any).findMany({
        where: { userId }, orderBy: { timestamp: 'desc' }, take: 100 }),
      this.prisma.historyRecord.findMany({
        where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return { auditLogs, historyRecords };
  }
 
  async exportLogs(filters: AuditFilterDto, requesterId: number) {
    const result = await this.findAll({ ...filters, limit: 10000, page: 1 });
    await this.log({ userId: requesterId, action: 'EXPORT', entity: 'AuditLog',
      severity: AuditSeverity.HIGH, metadata: { count: result.total } });
    return {
      exported: result.total,
      data: result.data.map((log: any) => ({
        id:        log.id,       timestamp:  log.timestamp,
        user:      `${log.user?.fullName ?? 'Sistema'} (${log.user?.email ?? '—'})`,
        action:    log.action,   entity:     log.entity,
        entityId:  log.entityId, severity:   log.severity,
        status:    log.status,   ip:         log.ip,
        reason:    log.reason,   hash:       log.hash,
      })),
    };
  }
}
