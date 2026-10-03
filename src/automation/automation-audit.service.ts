// src/automation/automation-audit.service.ts
// §10/§12 — auditoria própria do módulo (AutomationAuditLog): quem alterou o quê e
// quando, com o estado antes/depois já sem segredos nem dados sensíveis.
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { AuditFilterDto } from './automation-governance.dto';
import { redactSensitive } from './automation-redact.util';
import { toCsv } from './automation-csv.util';

export interface AuditEntry {
  entity: string;
  action: string;
  entityId?: string | number | null;
  ruleId?: number | null;
  userId?: number | null;
  before?: unknown;
  after?: unknown;
  note?: string;
}

const MAX_JSON = 20_000;
const dump = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const text = JSON.stringify(redactSensitive(v));
  return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}…` : text;
};

/** Campos que mudaram entre dois objectos (só chaves de primeiro nível). */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

@Injectable()
export class AutomationAuditService {
  private readonly logger = new Logger(AutomationAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Best-effort: a auditoria nunca bloqueia a operação auditada. */
  async record(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.automationAuditLog.create({
        data: {
          entity: e.entity,
          action: e.action,
          entityId: e.entityId !== undefined && e.entityId !== null ? String(e.entityId) : null,
          ruleId:
            e.ruleId ?? (e.entity === 'RULE' && typeof e.entityId === 'number' ? e.entityId : null),
          userId: e.userId ?? null,
          beforeJson: dump(e.before),
          afterJson: dump(e.after),
          note: e.note,
        },
      });
    } catch (err: unknown) {
      this.logger.warn({
        action: e.action,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao registar auditoria do módulo de automação',
      });
    }
  }

  private buildWhere(f: AuditFilterDto): Prisma.AutomationAuditLogWhereInput {
    const where: Prisma.AutomationAuditLogWhereInput = {};
    if (f.entity) where.entity = f.entity;
    if (f.action) where.action = f.action;
    if (f.ruleId) where.ruleId = f.ruleId;
    if (f.userId) where.userId = f.userId;
    if (f.from || f.to) {
      where.createdAt = {
        ...(f.from ? { gte: new Date(f.from) } : {}),
        ...(f.to ? { lte: new Date(f.to) } : {}),
      };
    }
    return where;
  }

  private async withUsers<T extends { userId: number | null }>(rows: T[]) {
    const ids = [...new Set(rows.map(r => r.userId).filter((v): v is number => v !== null))];
    const users = ids.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map(u => [u.id, u.fullName]));
    return rows.map(r => ({ ...r, userName: (r.userId !== null && names.get(r.userId)) || null }));
  }

  async list(f: AuditFilterDto = {}) {
    const { page = 1, limit = 30 } = f;
    const { skip, take } = calculatePagination(page, limit);
    const where = this.buildWhere(f);
    const [rows, total] = await Promise.all([
      this.prisma.automationAuditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.automationAuditLog.count({ where }),
    ]);
    const data = (await this.withUsers(rows)).map(r => ({
      ...r,
      before: r.beforeJson ? (JSON.parse(r.beforeJson) as unknown) : null,
      after: r.afterJson ? (JSON.parse(r.afterJson) as unknown) : null,
    }));
    return buildPaginatedResponse(data, total, page, limit);
  }

  async exportCsv(f: AuditFilterDto = {}) {
    const rows = await this.withUsers(
      await this.prisma.automationAuditLog.findMany({
        where: this.buildWhere(f),
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    );
    return toCsv(
      ['Data', 'Entidade', 'Acção', 'Registo', 'Automação', 'Utilizador', 'Antes', 'Depois', 'Nota'],
      rows.map(r => [
        r.createdAt,
        r.entity,
        r.action,
        r.entityId,
        r.ruleId,
        r.userName ?? r.userId,
        r.beforeJson,
        r.afterJson,
        r.note,
      ]),
    );
  }
}
