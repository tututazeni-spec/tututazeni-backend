// src/audit/audit.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLog, Prisma, RiskLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessEventType,
  AccessFilterDto,
  AuditFilterDto,
  LogAuditDto,
  AuditSeverity,
  AuditStatus,
  ChangesFilterDto,
} from './audit.dto';
import { sessionIdleTimeoutMs } from '../auth/auth.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { getRequestContext } from '../common/logging/request-context';
import {
  AUDIT_FALLBACK_MODULE,
  AUDIT_MODULES,
  AUDIT_SCHEMA_VERSION,
  resolveAuditModule,
} from '../common/helpers/audit-modules';
import {
  computeAuditHash,
  GENESIS_HASH,
  writeChainedAuditLog,
} from '../common/helpers/audit-chain';
import { AuditViewer, resolveAuditScope, withScope } from './audit-scope';

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

  // ─── LOG PRINCIPAL ────────────────────────────────────────────────────────
  // A cadeia de hash vive em common/helpers/audit-chain.ts, partilhada com o
  // caminho da fila (common/services/audit.service.ts).

  async log(dto: LogAuditDto) {
    try {
      const ctx = getRequestContext();
      const module = resolveAuditModule(dto.entity);
      const entry = await writeChainedAuditLog(this.prisma, {
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
        module,
        eventType: `${module}.${dto.action}`,
        actorType: dto.userId ? 'USER' : 'SYSTEM',
        source: ctx.reqId ? 'API' : 'JOB',
        correlationId: ctx.reqId,
        schemaVersion: AUDIT_SCHEMA_VERSION,
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

  /** Filtros comuns de AuditLog (aba "Registos de Auditoria" e "Acessos"). */
  buildWhere(filters: AuditFilterDto): Prisma.AuditLogWhereInput {
    const {
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
      search,
      actorType,
      departmentId,
    } = filters;

    const where: Prisma.AuditLogWhereInput = {};
    const and: Prisma.AuditLogWhereInput[] = [];
    if (userId) where.userId = userId;
    if (entityId) where.entityId = entityId;
    if (ip) where.ip = { contains: ip };
    if (entity) where.entity = { contains: entity, mode: 'insensitive' };
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (severity) where.severity = severity;
    if (status) where.status = status;
    if (criticalOnly) where.severity = { in: ['CRITICAL', 'HIGH'] };
    if (actorType === 'SYSTEM') where.userId = null;
    if (actorType === 'USER' && !userId) where.userId = { not: null };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const term = search?.trim();
    if (term) {
      const or: Prisma.UserWhereInput[] = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
      if (/^\d{1,9}$/.test(term)) or.push({ id: Number(term) });
      and.push({ user: { is: { OR: or } } });
    }
    if (departmentId) and.push({ user: { is: { departmentId } } });
    if (and.length) where.AND = and;
    return where;
  }

  private static readonly USER_INCLUDE = {
    user: {
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        role: { select: { name: true } },
        department: { select: { id: true, name: true } },
      },
    },
  } satisfies Prisma.AuditLogInclude;

  /** §16 — âmbito de consulta do perfil (null = global); 403 para perfis fora da matriz. */
  resolveScope(viewer: AuditViewer): Promise<Prisma.AuditLogWhereInput | null> {
    return resolveAuditScope(viewer, this.prisma.read);
  }

  async findAll(filters: AuditFilterDto, scope?: Prisma.AuditLogWhereInput | null) {
    const { page = 1, limit = 50 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where = withScope(this.buildWhere(filters), scope);

    const [data, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        skip,
        take,
        include: AuditService.USER_INCLUDE,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.read.auditLog.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  /** Valores distintos para os filtros da tabela (módulo/entidade, acção, departamento). */
  async getFilterOptions() {
    const [entities, actions, departments] = await Promise.all([
      this.prisma.read.auditLog.groupBy({
        by: ['entity'],
        _count: true,
        orderBy: { _count: { entity: 'desc' } },
        take: 100,
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['action'],
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 100,
      }),
      this.prisma.read.department.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 300,
      }),
    ]);
    return {
      entities: entities.map(e => e.entity),
      actions: actions.map(a => a.action),
      departments,
    };
  }

  async findOne(id: number, scope?: Prisma.AuditLogWhereInput | null) {
    return this.prisma.read.auditLog.findFirst({
      where: withScope({ id }, scope),
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  // ─── TIMELINE POR RECURSO ─────────────────────────────────────────────────

  async getTimeline(entity: string, entityId: number, scope?: Prisma.AuditLogWhereInput | null) {
    const logs = await this.prisma.read.auditLog.findMany({
      where: withScope({ entity: { contains: entity, mode: 'insensitive' }, entityId }, scope),
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

  async getUserHistory(
    userId: number,
    scope?: Prisma.AuditLogWhereInput | null,
    viewerRole?: string | null,
  ) {
    // O histórico funcional (HistoryRecord) não tem módulo; fora da consulta global só o RH o vê.
    const canSeeHistory = !scope || viewerRole === 'RH';
    const [auditLogs, historyRecords] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where: withScope({ userId }, scope),
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      !canSeeHistory
        ? Promise.resolve([])
        : this.prisma.read.historyRecord.findMany({
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

  // ─── VISÃO GERAL (aba 01) ─────────────────────────────────────────────────

  /**
   * Agregados da aba "Visão Geral" para os últimos `days` dias.
   * "Módulo" é aproximado pela entidade auditada (AuditLog não tem coluna
   * `module`). "Acessos" = acções LOGIN (sucesso) e FAILED (falha) da
   * entidade Auth. "Alertas por analisar" = anomalias detectadas — ainda não
   * existe modelo de incidentes (aba 05).
   */
  async getOverview(days = 30) {
    const safeDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (safeDays - 1));
    const inPeriod = { timestamp: { gte: since } };
    const critical = { severity: { in: ['CRITICAL', 'HIGH'] as RiskLevel[] } };

    const [
      total,
      failedAccess,
      successAccess,
      criticalCount,
      byModule,
      bySeverity,
      topUsers,
      dailyRows,
      recent,
      recentCritical,
      anomalies,
    ] = await Promise.all([
      this.prisma.read.auditLog.count({ where: inPeriod }),
      this.prisma.read.auditLog.count({ where: { ...inPeriod, action: 'FAILED', entity: 'Auth' } }),
      this.prisma.read.auditLog.count({ where: { ...inPeriod, action: 'LOGIN' } }),
      this.prisma.read.auditLog.count({ where: { ...inPeriod, ...critical } }),
      this.prisma.read.auditLog.groupBy({
        by: ['entity'],
        where: inPeriod,
        _count: true,
        orderBy: { _count: { entity: 'desc' } },
        take: 8,
      }),
      this.prisma.read.auditLog.groupBy({ by: ['severity'], where: inPeriod, _count: true }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { ...inPeriod, userId: { not: null } },
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      }),
      this.prisma.read.$queryRaw<Array<{ day: Date; total: bigint; failed: bigint }>>`
        SELECT date_trunc('day', "timestamp") AS day,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE action = 'FAILED' AND entity = 'Auth') AS failed
        FROM "AuditLog"
        WHERE "timestamp" >= ${since}
        GROUP BY 1
        ORDER BY 1`,
      this.prisma.read.auditLog.findMany({
        where: inPeriod,
        include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
      this.prisma.read.auditLog.findMany({
        where: { ...inPeriod, ...critical },
        include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
        orderBy: { timestamp: 'desc' },
        take: 5,
      }),
      this.getAnomalySummary(),
    ]);

    const userIds = topUsers.map(u => u.userId).filter((id): id is number => id != null);
    const users = userIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const userById = new Map(users.map(u => [u.id, u]));

    // Série diária contínua (dias sem eventos aparecem a zero).
    const byDay = new Map(
      dailyRows.map(r => [
        new Date(r.day).toISOString().slice(0, 10),
        { total: Number(r.total), failed: Number(r.failed) },
      ]),
    );
    const daily: Array<{ date: string; total: number; failedAccess: number }> = [];
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const v = byDay.get(key);
      daily.push({ date: key, total: v?.total ?? 0, failedAccess: v?.failed ?? 0 });
    }

    return {
      periodDays: safeDays,
      since,
      totals: {
        events: total,
        failedAccess,
        criticalActions: criticalCount,
        pendingAlerts: anomalies.totalAlerts,
      },
      access: { success: successAccess, failed: failedAccess },
      daily,
      byModule: byModule.map(m => ({ module: m.entity, count: m._count })),
      bySeverity: Object.fromEntries(bySeverity.map(s => [s.severity, s._count])),
      topUsers: topUsers.map(u => ({
        userId: u.userId,
        count: u._count,
        user: u.userId != null ? (userById.get(u.userId) ?? null) : null,
      })),
      recent,
      recentCritical,
      anomalies,
    };
  }

  // ─── DETALHE DO EVENTO (§5) ───────────────────────────────────────────────

  private static readonly SECRET_KEY = /pass(word)?|token|secret|authorization|api[-_]?key|cookie/i;
  // Entidades cujos valores só ADMIN pode ver (dados salariais/fiscais/bancários).
  private static readonly SENSITIVE_ENTITY =
    /payslip|payroll|salary|remuneration|bank|iban|nib|nif|tax/i;
  private static readonly MASK = '••• oculto';

  private parseJson(raw: string | null): unknown {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  /** Remove segredos (palavras-passe, tokens…) em qualquer nível; opcionalmente oculta valores. */
  private scrub(value: unknown, maskValues: boolean): unknown {
    if (Array.isArray(value)) return value.map(v => this.scrub(v, maskValues));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (AuditService.SECRET_KEY.test(k)) continue;
        out[k] = this.scrub(v, maskValues);
      }
      return out;
    }
    return maskValues && value !== null && value !== undefined ? AuditService.MASK : value;
  }

  eventCode(id: number, ts: Date): string {
    return `AUD-${ts.getUTCFullYear()}-${String(id).padStart(6, '0')}`;
  }

  /**
   * Detalhe completo de um evento para o modal "Detalhes do Evento". Remove
   * segredos de before/after/changes/metadata e oculta os valores de entidades
   * sensíveis a quem não é ADMIN. Não altera nem apaga nada.
   */
  async getEventDetail(
    id: number,
    viewerRole?: string | null,
    scope?: Prisma.AuditLogWhereInput | null,
  ) {
    const log = await this.prisma.read.auditLog.findFirst({
      where: withScope({ id }, scope),
      include: AuditService.USER_INCLUDE,
    });
    if (!log) throw new NotFoundException(`Evento de auditoria ${id} não encontrado`);

    const masked = AuditService.SENSITIVE_ENTITY.test(log.entity) && viewerRole !== 'ADMIN';
    const before = this.scrub(this.parseJson(log.before), masked);
    const after = this.scrub(this.parseJson(log.after), masked);
    let changes = this.scrub(this.parseJson(log.changes), false) as Record<
      string,
      { from: unknown; to: unknown }
    > | null;
    if (changes && masked) {
      changes = Object.fromEntries(
        Object.keys(changes).map(k => [k, { from: AuditService.MASK, to: AuditService.MASK }]),
      );
    }
    if (!changes && before && after && typeof before === 'object' && typeof after === 'object') {
      changes = this.diffObjects(
        before as Record<string, unknown>,
        after as Record<string, unknown>,
      );
    }
    const metadata = this.scrub(this.parseJson(log.metadata), masked) as Record<
      string,
      unknown
    > | null;

    const ts = new Date(log.timestamp);
    const around = 10 * 60 * 1000;
    const [sameRecord, sameActor] = await Promise.all([
      log.entityId != null
        ? this.prisma.read.auditLog.findMany({
            where: withScope(
              { entity: log.entity, entityId: log.entityId, id: { not: log.id } },
              scope,
            ),
            orderBy: { timestamp: 'desc' },
            take: 10,
            include: AuditService.USER_INCLUDE,
          })
        : Promise.resolve([]),
      log.userId != null
        ? this.prisma.read.auditLog.findMany({
            where: withScope(
              {
                userId: log.userId,
                id: { not: log.id },
                timestamp: {
                  gte: new Date(ts.getTime() - around),
                  lte: new Date(ts.getTime() + around),
                },
              },
              scope,
            ),
            orderBy: { timestamp: 'asc' },
            take: 10,
            include: AuditService.USER_INCLUDE,
          })
        : Promise.resolve([]),
    ]);

    const strip = (l: (typeof sameRecord)[number]) => ({
      id: l.id,
      code: this.eventCode(l.id, new Date(l.timestamp)),
      timestamp: l.timestamp,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      status: l.status,
      severity: l.severity,
      user: l.user ? { id: l.user.id, fullName: l.user.fullName } : null,
    });

    return {
      id: log.id,
      code: this.eventCode(log.id, ts),
      timestamp: log.timestamp,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      entityName: log.entityName,
      status: log.status,
      severity: log.severity,
      reason: log.reason,
      ip: log.ip,
      userAgent: log.userAgent,
      user: log.user,
      actorType: log.userId == null ? 'SYSTEM' : 'USER',
      before,
      after,
      changes,
      metadata,
      correlationId:
        metadata && typeof metadata['correlationId'] === 'string'
          ? metadata['correlationId']
          : null,
      masked,
      related: { sameRecord: sameRecord.map(strip), sameActor: sameActor.map(strip) },
    };
  }

  // ─── ACESSOS E SESSÕES (§6) ───────────────────────────────────────────────

  private static readonly PERMISSION_ACTIONS = [
    'ROLE_ASSIGNED',
    'ROLE_CREATED',
    'ROLE_UPDATED',
    'ROLE_DELETED',
    'ACCESS_DENIED',
    'DENIED',
  ];
  private static readonly PASSWORD_ACTIONS = ['CHANGE_PASSWORD', 'PASSWORD_RESET'];

  accessWhere(type: AccessEventType | undefined): Prisma.AuditLogWhereInput {
    switch (type) {
      case 'LOGIN':
        return { action: 'LOGIN' };
      case 'LOGOUT':
        return { action: 'LOGOUT' };
      case 'FAILED':
        return { action: 'FAILED', entity: 'Auth' };
      case 'PASSWORD':
        return { action: { in: AuditService.PASSWORD_ACTIONS } };
      case 'PERMISSION':
        return { action: { in: AuditService.PERMISSION_ACTIONS } };
      default:
        return {
          OR: [
            { action: { in: ['LOGIN', 'LOGOUT', ...AuditService.PASSWORD_ACTIONS] } },
            { action: 'FAILED', entity: 'Auth' },
            { action: { in: AuditService.PERMISSION_ACTIONS } },
          ],
        };
    }
  }

  /** Eventos de acesso paginados (login, logout, falhas, palavra-passe, permissões). */
  async getAccessEvents(filters: AccessFilterDto) {
    const { page = 1, limit = 50, type } = filters;
    const { skip, take } = calculatePagination(page, limit);
    // `action`/`entity` do filtro geral não se aplicam aqui: o tipo define as acções.
    const base = this.buildWhere({ ...filters, action: undefined, entity: undefined });
    const where: Prisma.AuditLogWhereInput = { AND: [base, this.accessWhere(type)] };

    const [data, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        skip,
        take,
        include: AuditService.USER_INCLUDE,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.read.auditLog.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  /** Sessão activa = refresh token não revogado, não expirado e dentro da janela de inactividade. */
  private activeSessionWhere(): Prisma.RefreshTokenWhereInput {
    return {
      revokedAt: null,
      expiresAt: { gt: new Date() },
      createdAt: { gte: new Date(Date.now() - sessionIdleTimeoutMs()) },
    };
  }

  async getActiveSessions(page = 1, limit = 20) {
    const { skip, take } = calculatePagination(page, limit);
    const where = this.activeSessionWhere();
    const [rows, total] = await Promise.all([
      this.prisma.read.refreshToken.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true,
              role: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.read.refreshToken.count({ where }),
    ]);
    // O refresh token é rodado a cada renovação: createdAt = última actividade.
    const data = rows.map(r => ({
      id: r.id,
      lastActivity: r.createdAt,
      expiresAt: r.expiresAt,
      user: r.user,
    }));
    return buildPaginatedResponse(data, total, page, limit);
  }

  /** Indicadores, série diária e alertas de acesso do período. */
  async getAccessSummary(days = 30) {
    const safeDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (safeDays - 1));
    const inPeriod = { timestamp: { gte: since } };
    const burstWindow = new Date(Date.now() - 15 * 60 * 1000);
    const last24h = new Date(Date.now() - 24 * 3600 * 1000);

    const [
      successLogins,
      failedLogins,
      logouts,
      passwordChanges,
      permissionChanges,
      activeSessions,
      dailyRows,
      burstByIp,
      burstByUser,
      privilegedLogins,
    ] = await Promise.all([
      this.prisma.read.auditLog.count({ where: { ...inPeriod, action: 'LOGIN' } }),
      this.prisma.read.auditLog.count({ where: { ...inPeriod, action: 'FAILED', entity: 'Auth' } }),
      this.prisma.read.auditLog.count({ where: { ...inPeriod, action: 'LOGOUT' } }),
      this.prisma.read.auditLog.count({
        where: { ...inPeriod, action: { in: AuditService.PASSWORD_ACTIONS } },
      }),
      this.prisma.read.auditLog.count({
        where: { ...inPeriod, action: { in: AuditService.PERMISSION_ACTIONS } },
      }),
      this.prisma.read.refreshToken.count({ where: this.activeSessionWhere() }),
      this.prisma.read.$queryRaw<Array<{ day: Date; success: bigint; failed: bigint }>>`
        SELECT date_trunc('day', "timestamp") AS day,
               COUNT(*) FILTER (WHERE action = 'LOGIN') AS success,
               COUNT(*) FILTER (WHERE action = 'FAILED' AND entity = 'Auth') AS failed
        FROM "AuditLog"
        WHERE "timestamp" >= ${since}
        GROUP BY 1
        ORDER BY 1`,
      this.prisma.read.auditLog.groupBy({
        by: ['ip'],
        where: {
          action: 'FAILED',
          entity: 'Auth',
          ip: { not: null },
          timestamp: { gte: burstWindow },
        },
        _count: true,
        having: { ip: { _count: { gte: 5 } } },
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: {
          action: 'FAILED',
          entity: 'Auth',
          userId: { not: null },
          timestamp: { gte: burstWindow },
        },
        _count: true,
        having: { userId: { _count: { gte: 5 } } },
      }),
      this.prisma.read.auditLog.findMany({
        where: {
          action: 'LOGIN',
          ip: { not: null },
          timestamp: { gte: last24h },
          user: { is: { role: { is: { name: { in: ['ADMIN', 'RH'] } } } } },
        },
        select: { userId: true, ip: true },
        take: 2000,
      }),
    ]);

    const ipsByUser = new Map<number, Set<string>>();
    for (const l of privilegedLogins) {
      if (l.userId == null || !l.ip) continue;
      let set = ipsByUser.get(l.userId);
      if (!set) ipsByUser.set(l.userId, (set = new Set()));
      set.add(l.ip);
    }
    const multiIpUserIds = [...ipsByUser.entries()].filter(([, v]) => v.size >= 3).map(([k]) => k);
    const flaggedUserIds = [...new Set([...burstByUser.map(b => b.userId), ...multiIpUserIds])];
    const flaggedUsers = flaggedUserIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: flaggedUserIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const emailOf = new Map(flaggedUsers.map(u => [u.id, u.email]));

    const alerts: Array<{ kind: string; severity: 'MEDIUM' | 'HIGH'; message: string }> = [
      ...burstByIp.map(b => ({
        kind: 'FAILED_BURST_IP',
        severity: 'HIGH' as const,
        message: `${b._count} tentativas falhadas nos últimos 15 min a partir do IP ${b.ip}`,
      })),
      ...burstByUser.map(b => ({
        kind: 'FAILED_BURST_USER',
        severity: 'HIGH' as const,
        message: `${b._count} tentativas falhadas nos últimos 15 min na conta ${
          emailOf.get(b.userId) ?? `#${b.userId}`
        }`,
      })),
      ...multiIpUserIds.map(id => ({
        kind: 'PRIVILEGED_MULTI_IP',
        severity: 'MEDIUM' as const,
        message: `Conta privilegiada ${emailOf.get(id) ?? `#${id}`} iniciou sessão a partir de ${
          ipsByUser.get(id)?.size ?? 0
        } IPs distintos nas últimas 24 h (a analisar; não indica fraude por si só)`,
      })),
    ];

    const byDay = new Map(
      dailyRows.map(r => [
        new Date(r.day).toISOString().slice(0, 10),
        { success: Number(r.success), failed: Number(r.failed) },
      ]),
    );
    const daily: Array<{ date: string; success: number; failed: number }> = [];
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      daily.push({
        date: key,
        success: byDay.get(key)?.success ?? 0,
        failed: byDay.get(key)?.failed ?? 0,
      });
    }

    return {
      periodDays: safeDays,
      totals: {
        successLogins,
        failedLogins,
        logouts,
        passwordChanges,
        permissionChanges,
        activeSessions,
      },
      daily,
      alerts,
    };
  }

  // ─── COBERTURA POR MÓDULO (modulo_audit.md §13/§14) ───────────────────────

  /**
   * Para cada módulo da matriz §13, quantos eventos reais chegaram ao Audit na janela.
   * Módulos com 0 eventos são "sem cobertura observada" — ou nunca foram usados, ou não
   * chamam o serviço de auditoria (a validar caso a caso).
   */
  async getCoverage(days = 30) {
    const d = Math.min(Math.max(Number.isFinite(days) ? Math.trunc(days) : 30, 1), 365);
    const since = new Date(Date.now() - d * 86_400_000);
    const [byEntity, chained, total] = await Promise.all([
      this.prisma.read.auditLog.groupBy({
        by: ['entity'],
        where: { timestamp: { gte: since } },
        _count: { _all: true },
        _max: { timestamp: true },
      }),
      this.prisma.read.auditLog.count({
        where: { timestamp: { gte: since }, hash: { not: null } },
      }),
      this.prisma.read.auditLog.count({ where: { timestamp: { gte: since } } }),
    ]);

    const acc = new Map<string, { events: number; lastEventAt: Date | null }>();
    for (const row of byEntity) {
      const mod = resolveAuditModule(row.entity);
      const cur = acc.get(mod) ?? { events: 0, lastEventAt: null };
      cur.events += row._count._all;
      const ts = row._max.timestamp;
      if (ts && (!cur.lastEventAt || ts > cur.lastEventAt)) cur.lastEventAt = ts;
      acc.set(mod, cur);
    }

    const modules = AUDIT_MODULES.map(module => ({
      module,
      events: acc.get(module)?.events ?? 0,
      lastEventAt: acc.get(module)?.lastEventAt ?? null,
      covered: (acc.get(module)?.events ?? 0) > 0,
    }));
    const other = acc.get(AUDIT_FALLBACK_MODULE);

    return {
      days: d,
      modules,
      uncovered: modules.filter(m => !m.covered).map(m => m.module),
      unclassifiedEvents: other?.events ?? 0,
      chain: { chained, unchained: total - chained, total },
      // §14 — fronteiras entre Audit e as áreas vizinhas.
      responsibilities: [
        { area: 'Audit', scope: 'Ações, autoria, alterações, evidências e responsabilização' },
        { area: 'History', scope: 'Histórico funcional de colaboradores, processos e entidades' },
        { area: 'Logs técnicos', scope: 'Erros, exceções, desempenho, infraestrutura' },
        { area: 'Notifications', scope: 'Comunicação de alertas aos destinatários' },
        { area: 'Processes', scope: 'Execução e acompanhamento de fluxos de trabalho' },
        { area: 'Automations', scope: 'Regras automáticas e ações desencadeadas por eventos' },
      ],
    };
  }

  // ─── VERIFICAÇÃO DE INTEGRIDADE ───────────────────────────────────────────

  async verifyIntegrity(
    limit = 100,
  ): Promise<{ valid: boolean; broken: number[]; checked: number }> {
    // Só os registos encadeados (hash != null) fazem parte da cadeia; os anteriores à
    // cadeia partilhada ficam de fora em vez de serem reportados como adulterados.
    // Verifica os `limit` elos mais recentes, ligando cada um ao anterior.
    const recent = await this.prisma.read.auditLog.findMany({
      where: { hash: { not: null } },
      orderBy: { id: 'desc' },
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
    const logs = [...recent].sort((a, b) => a.id - b.id);

    const broken: number[] = [];
    // O primeiro elo da janela só é verificado contra o seu próprio previousHash.
    let prev: string | null = null;

    for (const log of logs) {
      const expected = computeAuditHash(
        log.userId,
        log.action,
        log.entity,
        log.entityId,
        new Date(log.timestamp),
        log.previousHash ?? GENESIS_HASH,
      );
      if (log.hash !== expected || (prev !== null && log.previousHash !== prev)) {
        broken.push(log.id);
      }
      prev = log.hash;
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
      metadata: { exported: result.meta.total },
    });

    return {
      exported: result.meta.total,
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

    // Limites de deteção configuráveis em «Políticas e Retenção» (§12).
    const policy = await this.prisma.read.auditPolicy.findUnique({
      where: { id: 1 },
      select: { alertRules: true },
    });
    const rules = (
      policy?.alertRules && typeof policy.alertRules === 'object' ? policy.alertRules : {}
    ) as Record<string, number>;
    const failedMin = rules.failedLoginsPerHour ?? 3;
    const exportsMin = rules.exportsPerHour ?? 3;
    const deletesMin = rules.deletesPerDay ?? 5;

    const [failedLogins, massExports, massDeletes] = await Promise.all([
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { action: 'FAILED', timestamp: { gte: hour1 } },
        _count: true,
        having: { userId: { _count: { gte: failedMin } } },
        orderBy: { _count: { userId: 'desc' } },
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { action: 'EXPORT', timestamp: { gte: hour1 } },
        _count: true,
        having: { userId: { _count: { gte: exportsMin } } },
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { action: 'DELETE', timestamp: { gte: hour24 } },
        _count: true,
        having: { userId: { _count: { gte: deletesMin } } },
      }),
    ]);

    return {
      suspiciousLogins: failedLogins.map(f => ({ userId: f.userId, count: f._count })),
      massExports: massExports.map(e => ({ userId: e.userId, count: e._count })),
      massDeletes: massDeletes.map(d => ({ userId: d.userId, count: d._count })),
      totalAlerts: failedLogins.length + massExports.length + massDeletes.length,
    };
  }

  // ─── ALTERAÇÕES DE DADOS (§7) ─────────────────────────────────────────────

  /** Acções que representam uma alteração de dados (criar, alterar, estado, aprovar, transferir…). */
  private static readonly CHANGE_ACTIONS = [
    'CREATE',
    'UPDATE',
    'DELETE',
    'DEACTIVATE',
    'REACTIVATE',
    'ACTIVATE',
    'RESTORE',
    'ARCHIVE',
    'STATUS',
    'APPROVE',
    'REJECT',
    'TRANSFER',
    'ASSIGN',
  ];

  /** Campos cujo valor só ADMIN vê (pessoais/salariais/bancários), em qualquer entidade. */
  private static readonly SENSITIVE_FIELD =
    /salar|wage|remunera|iban|\bnib\b|\bnif\b|bank|tax|ssn|birth|nascimento|address|morada/i;

  changeWhere(filters: ChangesFilterDto): Prisma.AuditLogWhereInput {
    const base = this.buildWhere(filters);
    const and: Prisma.AuditLogWhereInput[] = Array.isArray(base.AND)
      ? [...base.AND]
      : base.AND
        ? [base.AND]
        : [];
    and.push({
      OR: [
        { changes: { not: null } },
        ...AuditService.CHANGE_ACTIONS.map(a => ({
          action: { contains: a, mode: 'insensitive' as const },
        })),
      ],
    });
    // Eventos de acesso/leitura nunca são "alterações de dados".
    and.push({ NOT: { action: { in: ['LOGIN', 'LOGOUT', 'READ', 'FAILED', 'EXPORT'] } } });
    const field = filters.field?.trim();
    if (field) and.push({ changes: { contains: `"${field}"` } });
    return { ...base, AND: and };
  }

  /** Alterações campo a campo de um registo de auditoria, com ocultação por permissão. */
  fieldChanges(
    log: Pick<AuditLog, 'entity' | 'changes' | 'before' | 'after'>,
    viewerRole?: string | null,
  ): Array<{ field: string; from: unknown; to: unknown; masked: boolean }> {
    const isAdmin = viewerRole === 'ADMIN';
    const entityMasked = AuditService.SENSITIVE_ENTITY.test(log.entity) && !isAdmin;
    let raw = this.scrub(this.parseJson(log.changes), false) as Record<
      string,
      { from: unknown; to: unknown }
    > | null;
    if (!raw || typeof raw !== 'object') {
      const before = this.scrub(this.parseJson(log.before), false);
      const after = this.scrub(this.parseJson(log.after), false);
      if (before && after && typeof before === 'object' && typeof after === 'object') {
        raw = this.diffObjects(before as Record<string, unknown>, after as Record<string, unknown>);
      } else if (after && typeof after === 'object') {
        // Criação: todos os campos novos.
        raw = Object.fromEntries(
          Object.entries(after as Record<string, unknown>).map(([k, v]) => [
            k,
            { from: null, to: v },
          ]),
        );
      } else if (before && typeof before === 'object') {
        raw = Object.fromEntries(
          Object.entries(before as Record<string, unknown>).map(([k, v]) => [
            k,
            { from: v, to: null },
          ]),
        );
      }
    }
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw)
      .filter(([k]) => !AuditService.SECRET_KEY.test(k))
      .map(([field, v]) => {
        const masked = entityMasked || (!isAdmin && AuditService.SENSITIVE_FIELD.test(field));
        return {
          field,
          from: masked ? AuditService.MASK : (v?.from ?? null),
          to: masked ? AuditService.MASK : (v?.to ?? null),
          masked,
        };
      });
  }

  async getChanges(
    filters: ChangesFilterDto,
    viewerRole?: string | null,
    scope?: Prisma.AuditLogWhereInput | null,
  ) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where = withScope(this.changeWhere(filters), scope);
    const [rows, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        skip,
        take,
        include: AuditService.USER_INCLUDE,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.read.auditLog.count({ where }),
    ]);

    const data = rows.map(l => {
      const meta = this.parseJson(l.metadata) as Record<string, unknown> | null;
      const m = meta && typeof meta === 'object' ? meta : {};
      const pick = (...keys: string[]): string | null => {
        for (const k of keys)
          if (typeof m[k] === 'string' || typeof m[k] === 'number') return String(m[k]);
        return null;
      };
      return {
        id: l.id,
        code: this.eventCode(l.id, new Date(l.timestamp)),
        timestamp: l.timestamp,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        entityName: l.entityName,
        status: l.status,
        severity: l.severity,
        reason: l.reason,
        user: l.user,
        actorType: l.userId == null ? 'SYSTEM' : 'USER',
        // Origem: canal declarado nos metadados; senão o IP do pedido.
        origin: pick('origin', 'source', 'channel') ?? (l.ip ? `IP ${l.ip}` : null),
        approvalRef: pick('approvalId', 'approvalRef', 'approvedBy'),
        fields: this.fieldChanges(l, viewerRole),
      };
    });

    return buildPaginatedResponse(data, total, page, limit);
  }

  async getChangesSummary(
    days = 30,
    viewerRole?: string | null,
    scope?: Prisma.AuditLogWhereInput | null,
  ) {
    void viewerRole;
    const safeDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (safeDays - 1));
    const where = withScope(
      this.changeWhere({ from: since.toISOString() } as ChangesFilterDto),
      scope,
    );

    const [total, failed, byEntity, byAction, authors] = await Promise.all([
      this.prisma.read.auditLog.count({ where }),
      this.prisma.read.auditLog.count({ where: { ...where, status: { not: 'SUCCESS' } } }),
      this.prisma.read.auditLog.groupBy({
        by: ['entity'],
        where,
        _count: true,
        orderBy: { _count: { entity: 'desc' } },
        take: 8,
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['action'],
        where,
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 8,
      }),
      this.prisma.read.auditLog.groupBy({ by: ['userId'], where }),
    ]);

    return {
      periodDays: safeDays,
      totals: { changes: total, failed, authors: authors.filter(a => a.userId != null).length },
      byEntity: byEntity.map(e => ({ entity: e.entity, count: e._count })),
      byAction: byAction.map(a => ({ action: a.action, count: a._count })),
    };
  }
}
