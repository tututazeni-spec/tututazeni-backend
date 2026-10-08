// src/audit/audit-policy.service.ts
// Aba «Políticas e Retenção» (docs/modulo_audit.md §12). A política é um registo
// único (id = 1); toda a alteração é auditada com diff campo a campo.
//
// Nota de âmbito: a política é persistida, auditada e aplicada a: limites de
// deteção de anomalias, prazo de retenção e permissões das exportações, e à
// pré-visualização de retenção. Não bloqueia a ingestão de eventos (um serviço
// de auditoria nunca deve descartar eventos por configuração) e a retenção do
// AuditLog é apenas calculada — nenhum registo é apagado automaticamente.
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import type { AuditActor } from './audit-incidents.service';
import {
  ALERT_RULE_KEYS,
  AuditPolicyValues,
  DEFAULT_POLICY,
  RETENTION_CATEGORIES,
  RETENTION_MAX_DAYS,
  RETENTION_MIN_DAYS,
  RetentionCategory,
  SEVERITY_LEVELS,
  UpdateAuditPolicyDto,
} from './audit-policy.dto';

const DAY = 24 * 3600 * 1000;

@Injectable()
export class AuditPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Política efectiva = valores guardados sobre os por omissão. */
  async getPolicy(): Promise<
    AuditPolicyValues & { updatedAt: Date | null; updatedById: number | null }
  > {
    const row = await this.prisma.read.auditPolicy.findUnique({ where: { id: 1 } });
    if (!row) return { ...DEFAULT_POLICY, updatedAt: null, updatedById: null };
    const obj = (v: Prisma.JsonValue | null): Record<string, unknown> =>
      v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    return {
      requiredEvents: row.requiredEvents.length
        ? row.requiredEvents
        : DEFAULT_POLICY.requiredEvents,
      coveredModules: row.coveredModules,
      severityRules: {
        ...DEFAULT_POLICY.severityRules,
        ...(obj(row.severityRules) as Record<string, string>),
      },
      alertRules: {
        ...DEFAULT_POLICY.alertRules,
        ...(obj(row.alertRules) as Record<string, number>),
      },
      retentionDays: {
        ...DEFAULT_POLICY.retentionDays,
        ...(obj(row.retentionDays) as Record<RetentionCategory, number>),
      },
      archivePolicy: row.archivePolicy,
      viewRoles: row.viewRoles.length ? row.viewRoles : DEFAULT_POLICY.viewRoles,
      exportRoles: row.exportRoles.length ? row.exportRoles : DEFAULT_POLICY.exportRoles,
      maskSensitive: row.maskSensitive,
      maskedFields: row.maskedFields,
      backupDestination: row.backupDestination,
      backupFrequency: row.backupFrequency,
      serviceEnabled: row.serviceEnabled,
      failureAlertEmails: row.failureAlertEmails,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    };
  }

  private validate(dto: UpdateAuditPolicyDto) {
    if (dto.retentionDays) {
      for (const [cat, days] of Object.entries(dto.retentionDays)) {
        if (!(RETENTION_CATEGORIES as readonly string[]).includes(cat)) {
          throw new BadRequestException(`Categoria de retenção desconhecida: ${cat}`);
        }
        if (!Number.isInteger(days) || days < RETENTION_MIN_DAYS || days > RETENTION_MAX_DAYS) {
          throw new BadRequestException(
            `Retenção de ${cat}: ${RETENTION_MIN_DAYS} a ${RETENTION_MAX_DAYS} dias`,
          );
        }
      }
    }
    if (dto.alertRules) {
      for (const [key, n] of Object.entries(dto.alertRules)) {
        if (!(ALERT_RULE_KEYS as readonly string[]).includes(key)) {
          throw new BadRequestException(`Regra de alerta desconhecida: ${key}`);
        }
        if (!Number.isInteger(n) || n < 1 || n > 10000) {
          throw new BadRequestException(`Limite de ${key}: inteiro entre 1 e 10000`);
        }
      }
    }
    if (dto.severityRules) {
      for (const [action, sev] of Object.entries(dto.severityRules)) {
        if (!(SEVERITY_LEVELS as readonly string[]).includes(sev)) {
          throw new BadRequestException(`Gravidade inválida para ${action}: ${sev}`);
        }
      }
    }
    if (dto.exportRoles && !dto.exportRoles.includes('ADMIN')) {
      throw new BadRequestException('ADMIN tem de manter permissão de exportação');
    }
    if (dto.viewRoles && !dto.viewRoles.includes('ADMIN')) {
      throw new BadRequestException('ADMIN tem de manter permissão de consulta');
    }
  }

  async updatePolicy(dto: UpdateAuditPolicyDto, actor: AuditActor) {
    this.validate(dto);
    const before = await this.getPolicy();
    const { reason, ...fields } = dto;

    // Intervalos parciais (retentionDays/alertRules/severityRules) fundem-se com os actuais.
    const merged: Partial<AuditPolicyValues> = {
      ...fields,
      ...(dto.retentionDays && {
        retentionDays: {
          ...before.retentionDays,
          ...dto.retentionDays,
        } as AuditPolicyValues['retentionDays'],
      }),
      ...(dto.alertRules && {
        alertRules: { ...before.alertRules, ...dto.alertRules } as AuditPolicyValues['alertRules'],
      }),
      ...(dto.severityRules && { severityRules: dto.severityRules }),
    };

    const data = {
      ...merged,
      updatedById: actor.id,
    } as Prisma.AuditPolicyUncheckedUpdateInput;
    await this.prisma.auditPolicy.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...(data as Prisma.AuditPolicyUncheckedCreateInput) },
    });
    const after = await this.getPolicy();

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(merged) as Array<keyof AuditPolicyValues>) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    await this.audit.log({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'AuditPolicy',
      entityId: 1,
      entityName: 'Política de auditoria',
      changes,
      severity: 'HIGH',
      reason,
      ip: actor.ip,
    });
    return { policy: after, changed: Object.keys(changes) };
  }

  /** Quem pode consultar/exportar (por papel), segundo a política. */
  async can(action: 'view' | 'export', role?: string | null): Promise<boolean> {
    const p = await this.getPolicy();
    const allowed = action === 'export' ? p.exportRoles : p.viewRoles;
    return !!role && allowed.includes(role);
  }

  /** Estado do serviço de auditoria e monitorização de falhas na recolha de eventos. */
  async getStatus() {
    const policy = await this.getPolicy();
    const now = Date.now();
    const h24 = new Date(now - DAY);
    const [last, events24h, failed24h, denied24h, hourly, exportsByStatus, expiredExports] =
      await Promise.all([
        this.prisma.read.auditLog.findFirst({
          orderBy: { timestamp: 'desc' },
          select: { timestamp: true },
        }),
        this.prisma.read.auditLog.count({ where: { timestamp: { gte: h24 } } }),
        this.prisma.read.auditLog.count({
          where: { timestamp: { gte: h24 }, status: 'FAILED', NOT: { entity: 'Auth' } },
        }),
        this.prisma.read.auditLog.count({ where: { timestamp: { gte: h24 }, status: 'DENIED' } }),
        this.prisma.$queryRaw<Array<{ hour: Date; total: number }>>(
          Prisma.sql`SELECT date_trunc('hour', "timestamp") AS hour, count(*)::int AS total
                     FROM "AuditLog" WHERE "timestamp" >= ${h24} GROUP BY 1 ORDER BY 1`,
        ),
        this.prisma.read.auditExport.groupBy({ by: ['status'], _count: true }),
        this.prisma.read.auditExport.count({
          where: { status: 'ACTIVE', retentionUntil: { lt: new Date() } },
        }),
      ]);

    // Lacuna na recolha: horas completas sem qualquer evento nas últimas 24h.
    const withEvents = new Set(hourly.map(h => new Date(h.hour).getTime()));
    const startHour = Math.floor(h24.getTime() / 3600000) * 3600000;
    let silentHours = 0;
    for (let t = startHour; t < Math.floor(now / 3600000) * 3600000; t += 3600000) {
      if (!withEvents.has(t)) silentHours++;
    }

    const minutesSinceLast = last ? Math.round((now - last.timestamp.getTime()) / 60000) : null;
    const health = !policy.serviceEnabled
      ? 'DISABLED'
      : minutesSinceLast === null || minutesSinceLast > 360
        ? 'WARNING'
        : 'OK';

    return {
      serviceEnabled: policy.serviceEnabled,
      health,
      lastEventAt: last?.timestamp ?? null,
      minutesSinceLastEvent: minutesSinceLast,
      events24h,
      failedOperations24h: failed24h,
      deniedOperations24h: denied24h,
      silentHours24h: silentHours,
      hourly: hourly.map(h => ({ hour: h.hour, total: Number(h.total) })),
      exports: {
        byStatus: exportsByStatus.map(s => ({ status: s.status, count: s._count })),
        expiredPendingPurge: expiredExports,
      },
      backup: {
        destination: policy.backupDestination,
        frequency: policy.backupFrequency,
        configured: !!policy.backupDestination,
      },
    };
  }

  /**
   * Quantos registos já ultrapassaram o prazo de retenção, por categoria (disjuntas, por
   * ordem de precedência). Só calcula — o arquivo/eliminação é uma decisão humana.
   */
  async getRetentionPreview() {
    const policy = await this.getPolicy();
    const cutoff = (cat: RetentionCategory) =>
      new Date(Date.now() - policy.retentionDays[cat] * DAY);

    const predicates: Array<{ cat: RetentionCategory; where: Prisma.AuditLogWhereInput }> = [
      {
        cat: 'PAYROLL',
        where: {
          OR: [
            { entity: { contains: 'Payroll', mode: 'insensitive' } },
            { entity: { contains: 'Payslip', mode: 'insensitive' } },
          ],
        },
      },
      {
        cat: 'SECURITY',
        where: {
          OR: [{ severity: { in: ['HIGH', 'CRITICAL'] } }, { status: { in: ['DENIED'] } }],
        },
      },
      { cat: 'ACCESS', where: { action: { in: ['LOGIN', 'LOGOUT', 'FAILED', 'PASSWORD_RESET'] } } },
      {
        cat: 'DATA_CHANGES',
        where: {
          OR: [
            { changes: { not: null } },
            { action: { in: ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT'] } },
          ],
        },
      },
    ];

    const rows: Array<{
      category: RetentionCategory;
      retentionDays: number;
      cutoff: Date;
      total: number;
      pastRetention: number;
    }> = [];
    const seen: Prisma.AuditLogWhereInput[] = [];
    for (const { cat, where } of predicates) {
      const scope: Prisma.AuditLogWhereInput = { AND: [where, ...seen.map(w => ({ NOT: w }))] };
      const [total, past] = await Promise.all([
        this.prisma.read.auditLog.count({ where: scope }),
        this.prisma.read.auditLog.count({
          where: { AND: [scope, { timestamp: { lt: cutoff(cat) } }] },
        }),
      ]);
      rows.push({
        category: cat,
        retentionDays: policy.retentionDays[cat],
        cutoff: cutoff(cat),
        total,
        pastRetention: past,
      });
      seen.push(where);
    }
    const generalScope: Prisma.AuditLogWhereInput = { AND: seen.map(w => ({ NOT: w })) };
    const [gTotal, gPast, exportsPast, exportsTotal] = await Promise.all([
      this.prisma.read.auditLog.count({ where: generalScope }),
      this.prisma.read.auditLog.count({
        where: { AND: [generalScope, { timestamp: { lt: cutoff('GENERAL') } }] },
      }),
      this.prisma.read.auditExport.count({
        where: { status: 'ACTIVE', retentionUntil: { lt: new Date() } },
      }),
      this.prisma.read.auditExport.count({ where: { status: 'ACTIVE' } }),
    ]);
    rows.push({
      category: 'GENERAL',
      retentionDays: policy.retentionDays.GENERAL,
      cutoff: cutoff('GENERAL'),
      total: gTotal,
      pastRetention: gPast,
    });
    rows.push({
      category: 'EXPORTS',
      retentionDays: policy.retentionDays.EXPORTS,
      cutoff: cutoff('EXPORTS'),
      total: exportsTotal,
      pastRetention: exportsPast,
    });

    return {
      archivePolicy: policy.archivePolicy,
      note: 'Pré-visualização apenas: nenhum registo de auditoria é apagado automaticamente.',
      categories: rows,
    };
  }
}
