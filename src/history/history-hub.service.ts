// src/history/history-hub.service.ts
// docs/history.md — hub transversal do History. Todas as abas (Visão Geral,
// Histórico, Movimentos, Alterações Organizacionais, Documentos & Registos,
// Actividades) são alimentadas por LEITURA das tabelas reais que os outros
// módulos já preenchem (AuditLog, UserAuditLog, OrgChangeLog,
// DepartmentTransferLog, DepartmentHeadHistory, DocAuditLog, …) — nada é
// duplicado nem inventado. Onde uma fonte não existe no schema (ex.: alteração
// de unidade/contrato do colaborador, rejeição de documentos), o evento
// simplesmente não aparece.

import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventModule, HistoryEventType, HistoryScopeDto, MovementType } from './history.dto';
import { buildTitle, deriveModule } from './history.service';
import type { TimelineEvent } from './history.service';
import { EventCategory } from './history.dto';

const SOURCE_CAP = 500;

// Acções de leitura/navegação — ruído, não são "actividades relevantes".
const NOISE_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'CONTENT_VIEW',
  'CONTENT_BOOKMARK',
  'READ',
  'VIEW',
  'DOC_FAVORITE',
  'TOKEN_REFRESH',
];
const DOC_NOISE_ACTIONS = ['VIEWED', 'DOWNLOADED', 'ACCESS_DENIED'] as const;

const MOVEMENT_USER_ACTIONS = ['DEPARTMENT_CHANGED', 'POSITION_CHANGED', 'MANAGER_CHANGED'];

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  [MovementType.ADMISSION]: 'Admissão',
  [MovementType.TRANSFER]: 'Transferência',
  [MovementType.PROMOTION]: 'Promoção',
  [MovementType.POSITION_CHANGE]: 'Alteração de cargo',
  [MovementType.DEPARTMENT_CHANGE]: 'Alteração de departamento',
  [MovementType.MANAGER_CHANGE]: 'Mudança de responsável',
  [MovementType.RESTRUCTURE]: 'Reestruturação',
  [MovementType.EXIT]: 'Saída',
  [MovementType.REACTIVATION]: 'Reactivação',
};

const MOVEMENT_EVENT_TYPE: Record<MovementType, HistoryEventType> = {
  [MovementType.ADMISSION]: HistoryEventType.CREATED,
  [MovementType.TRANSFER]: HistoryEventType.TRANSFERRED,
  [MovementType.PROMOTION]: HistoryEventType.PROMOTED,
  [MovementType.POSITION_CHANGE]: HistoryEventType.CHANGED,
  [MovementType.DEPARTMENT_CHANGE]: HistoryEventType.CHANGED,
  [MovementType.MANAGER_CHANGE]: HistoryEventType.CHANGED,
  [MovementType.RESTRUCTURE]: HistoryEventType.CHANGED,
  [MovementType.EXIT]: HistoryEventType.DEACTIVATED,
  [MovementType.REACTIVATION]: HistoryEventType.REACTIVATED,
};

const USER_AUDIT_TITLE: Record<string, string> = {
  USER_CREATED: 'Utilizador criado',
  USER_UPDATED: 'Dados do utilizador actualizados',
  USER_ACTIVATED: 'Conta activada',
  USER_DEACTIVATED: 'Conta desactivada',
  USER_SUSPENDED: 'Conta suspensa',
  USER_SOFT_DELETED: 'Utilizador removido',
  PROFILE_CHANGED: 'Perfil de acesso alterado',
  PASSWORD_CHANGED: 'Palavra-passe alterada',
  MFA_ENABLED: 'MFA activado',
  MFA_DISABLED: 'MFA desactivado',
  BULK_IMPORT: 'Importação em massa',
};

const DOC_ACTION: Record<string, { type: HistoryEventType; label: string }> = {
  UPLOADED: { type: HistoryEventType.CREATED, label: 'Documento criado' },
  UPDATED: { type: HistoryEventType.UPDATED, label: 'Documento actualizado' },
  VERSIONED: { type: HistoryEventType.UPDATED, label: 'Nova versão do documento' },
  SHARED: { type: HistoryEventType.ASSIGNED, label: 'Documento partilhado' },
  ARCHIVED: { type: HistoryEventType.ARCHIVED, label: 'Documento arquivado' },
  DELETED: { type: HistoryEventType.DELETED, label: 'Documento eliminado' },
};

export function eventTypeOf(action: string): HistoryEventType {
  const a = action.toUpperCase();
  if (a.includes('PROMOT') && !a.includes('WAITLIST')) return HistoryEventType.PROMOTED;
  if (a.includes('TRANSFER')) return HistoryEventType.TRANSFERRED;
  if (/REJECT|DENIED/.test(a)) return HistoryEventType.REJECTED;
  if (a.includes('APPROV')) return HistoryEventType.APPROVED;
  if (/COMPLET|CONCLU|FINALI/.test(a)) return HistoryEventType.COMPLETED;
  if (a.includes('CANCEL')) return HistoryEventType.CANCELLED;
  if (a.includes('ARCHIV')) return HistoryEventType.ARCHIVED;
  if (/DEACTIV|SUSPEND/.test(a)) return HistoryEventType.DEACTIVATED;
  if (/^ACTIVATE|_ACTIVATED|REACTIV/.test(a)) return HistoryEventType.REACTIVATED;
  if (/DELET|REMOV/.test(a)) return HistoryEventType.DELETED;
  if (a.includes('SUBMIT')) return HistoryEventType.SUBMITTED;
  if (a.includes('ASSIGN')) return HistoryEventType.ASSIGNED;
  if (/CREAT|UPLOAD|ISSUED|AWARD|ADDED|HIRE/.test(a)) return HistoryEventType.CREATED;
  if (/UPDAT|EDIT/.test(a)) return HistoryEventType.UPDATED;
  return HistoryEventType.CHANGED;
}

/** "{a:1,b:'x'}" (JSON em string) → "a: 1; b: x" — só escalares, sem inventar texto. */
function describeMetadata(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const parts: string[] = [];
      const rec = obj as Record<string, unknown>;
      if (typeof rec.from !== 'undefined' || typeof rec.to !== 'undefined') {
        return `${String(rec.from ?? '–')} → ${String(rec.to ?? '–')}`;
      }
      for (const [k, v] of Object.entries(rec)) {
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          parts.push(`${k}: ${String(v ?? '–')}`);
        }
      }
      return parts.length ? parts.join('; ') : null;
    }
    return String(obj);
  } catch {
    return raw;
  }
}

// ─── Tipos internos / públicos ─────────────────────────────────────

export interface ScopeCtx {
  from?: Date;
  to?: Date;
  /** undefined = sem restrição de colaborador; [] = nenhum colaborador corresponde */
  affectedIds?: number[];
  actorId?: number;
}

interface RawEntry {
  id: string;
  timestamp: Date;
  origin: string;
  actorId: number | null;
  affectedId: number | null;
  module: EventModule;
  entity: string;
  entityId: number | null;
  eventType: HistoryEventType;
  title: string;
  description: string | null;
  status: string;
}

export interface PersonRef {
  id: number;
  fullName: string;
}

export interface HistoryEntryDto extends Omit<RawEntry, 'actorId' | 'affectedId'> {
  actor: PersonRef | null;
  affected: PersonRef | null;
  reference: string | null;
}

interface Movement {
  id: string;
  /** chave `uaudit-<id>` quando a origem é UserAuditLog (para deduplicar na timeline) */
  sourceKey: string | null;
  timestamp: Date;
  type: MovementType;
  userId: number;
  actorId: number | null;
  prevPosition: string | null;
  newPosition: string | null;
  prevDepartment: string | null;
  newDepartment: string | null;
  prevManager: string | null;
  newManager: string | null;
  reason: string | null;
  notes: string | null;
  origin: string;
}

export interface MovementDto extends Omit<
  Movement,
  'userId' | 'actorId' | 'sourceKey' | 'timestamp'
> {
  timestamp: Date;
  typeLabel: string;
  employee: PersonRef | null;
  registeredBy: PersonRef | null;
}

export interface OrgChangeDto {
  id: string;
  timestamp: Date;
  department: string | null;
  unit: string | null;
  change: string;
  field: string | null;
  before: string | null;
  after: string | null;
  responsible: PersonRef | null;
  reason: string | null;
}

export interface DocumentRecordDto {
  id: string;
  timestamp: Date;
  document: string;
  subject: string | null;
  type: string;
  eventType: HistoryEventType;
  action: string;
  version: string | null;
  user: PersonRef | null;
  status: string;
  origin: string;
}

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

@Injectable()
export class HistoryHubService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // Âmbito / filtros globais
  // ══════════════════════════════════════════════════════

  async buildCtx(scope: HistoryScopeDto): Promise<ScopeCtx> {
    const ctx: ScopeCtx = {};
    if (scope.from) ctx.from = new Date(scope.from);
    if (scope.to) {
      const to = new Date(scope.to);
      // "2026-10-04" (só data) inclui o dia inteiro
      if (scope.to.length <= 10) to.setUTCHours(23, 59, 59, 999);
      ctx.to = to;
    }
    if (scope.actorId) ctx.actorId = scope.actorId;

    if (scope.affectedUserId || scope.departmentId || scope.unitId || scope.responsibleId) {
      const where: Prisma.UserWhereInput = {};
      if (scope.affectedUserId) where.id = scope.affectedUserId;
      if (scope.departmentId) where.departmentId = scope.departmentId;
      if (scope.unitId) where.unitId = scope.unitId;
      if (scope.responsibleId) where.managerId = scope.responsibleId;
      const users = await this.prisma.read.user.findMany({ where, select: { id: true } });
      ctx.affectedIds = users.map(u => u.id);
    }
    return ctx;
  }

  private range(ctx: ScopeCtx): Prisma.DateTimeFilter | undefined {
    if (!ctx.from && !ctx.to) return undefined;
    const r: Prisma.DateTimeFilter = {};
    if (ctx.from) r.gte = ctx.from;
    if (ctx.to) r.lte = ctx.to;
    return r;
  }

  private inRange(d: Date, ctx: ScopeCtx): boolean {
    if (ctx.from && d < ctx.from) return false;
    if (ctx.to && d > ctx.to) return false;
    return true;
  }

  private async nameMap(ids: Array<number | null | undefined>): Promise<Map<number, PersonRef>> {
    const unique = [...new Set(ids.filter((i): i is number => typeof i === 'number'))];
    if (!unique.length) return new Map();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map(u => [u.id, { id: u.id, fullName: u.fullName }]));
  }

  // ══════════════════════════════════════════════════════
  // Colectores (fontes reais)
  // ══════════════════════════════════════════════════════

  private async collectAudit(ctx: ScopeCtx, excludeNoise: boolean): Promise<RawEntry[]> {
    const and: Prisma.AuditLogWhereInput[] = [];
    const r = this.range(ctx);
    if (r) and.push({ timestamp: r });
    if (ctx.actorId) and.push({ userId: ctx.actorId });
    if (ctx.affectedIds) {
      and.push({
        OR: [
          { entity: 'User', entityId: { in: ctx.affectedIds } },
          { userId: { in: ctx.affectedIds } },
        ],
      });
    }
    if (excludeNoise) and.push({ action: { notIn: NOISE_ACTIONS } });

    const rows = await this.prisma.read.auditLog.findMany({
      where: and.length ? { AND: and } : {},
      orderBy: { timestamp: 'desc' },
      take: SOURCE_CAP,
    });
    return rows.map(a => ({
      id: `audit-${a.id}`,
      timestamp: a.timestamp,
      origin: 'Auditoria',
      actorId: a.userId,
      affectedId: a.entity === 'User' ? a.entityId : null,
      module: deriveModule(a.action, a.entity),
      entity: a.entity,
      entityId: a.entityId,
      eventType: eventTypeOf(a.action),
      title: buildTitle(a.action, a.entity),
      description: a.changes ?? a.reason ?? describeMetadata(a.metadata),
      status: a.status,
    }));
  }

  /** Entradas genéricas de UserAuditLog (excepto as 3 que viram Movimentos). */
  private async collectUserAudit(ctx: ScopeCtx): Promise<RawEntry[]> {
    const and: Prisma.UserAuditLogWhereInput[] = [
      { action: { notIn: [...MOVEMENT_USER_ACTIONS, ...NOISE_ACTIONS] } },
    ];
    const r = this.range(ctx);
    if (r) and.push({ createdAt: r });
    if (ctx.actorId) and.push({ performedById: ctx.actorId });
    if (ctx.affectedIds) and.push({ userId: { in: ctx.affectedIds } });
    const rows = await this.prisma.read.userAuditLog.findMany({
      where: { AND: and },
      orderBy: { createdAt: 'desc' },
      take: SOURCE_CAP,
    });
    return rows.map(u => ({
      id: `uaudit-${u.id}`,
      timestamp: u.createdAt,
      origin: 'Utilizadores',
      actorId: u.performedById,
      affectedId: u.userId,
      module: EventModule.HR,
      entity: 'User',
      entityId: u.userId,
      eventType: eventTypeOf(u.action),
      title: USER_AUDIT_TITLE[u.action] ?? u.action,
      description: describeMetadata(u.meta),
      status: 'SUCCESS',
    }));
  }

  private async collectHeadHistory(ctx: ScopeCtx): Promise<RawEntry[]> {
    if (ctx.affectedIds || ctx.actorId) return [];
    const r = this.range(ctx);
    const rows = await this.prisma.read.departmentHeadHistory.findMany({
      where: r ? { startedAt: r } : {},
      include: {
        department: { select: { name: true } },
        head: { select: { fullName: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: SOURCE_CAP,
    });
    return rows.map(h => ({
      id: `head-${h.id}`,
      timestamp: h.startedAt,
      origin: 'Estrutura organizacional',
      actorId: h.changedById,
      affectedId: h.headId,
      module: EventModule.HR,
      entity: 'Department',
      entityId: h.departmentId,
      eventType: HistoryEventType.ASSIGNED,
      title: `Responsável do departamento ${h.department.name} definido`,
      description: [h.head.fullName, h.reason].filter(Boolean).join(' — '),
      status: 'SUCCESS',
    }));
  }

  async collectMovements(ctx: ScopeCtx): Promise<Movement[]> {
    const out: Movement[] = [];
    const r = this.range(ctx);
    const base = {
      prevPosition: null,
      newPosition: null,
      prevDepartment: null,
      newDepartment: null,
      prevManager: null,
      newManager: null,
      reason: null,
      notes: null,
    } as const;

    // 1) OrgChangeLog — movimentos já efectivados
    const orgWhere: Prisma.OrgChangeLogWhereInput = {};
    if (r) orgWhere.effectiveDate = r;
    if (ctx.affectedIds) orgWhere.userId = { in: ctx.affectedIds };
    if (ctx.actorId) orgWhere.performedById = ctx.actorId;
    const orgRows = await this.prisma.read.orgChangeLog.findMany({
      where: orgWhere,
      include: {
        fromDepartment: { select: { name: true } },
        toDepartment: { select: { name: true } },
        fromPosition: { select: { name: true } },
        toPosition: { select: { name: true } },
      },
      orderBy: { effectiveDate: 'desc' },
      take: SOURCE_CAP,
    });
    const mgrNames = await this.nameMap(orgRows.flatMap(o => [o.fromManagerId, o.toManagerId]));
    const typeMap: Record<string, MovementType> = {
      HIRE: MovementType.ADMISSION,
      PROMOTION: MovementType.PROMOTION,
      TRANSFER: MovementType.TRANSFER,
      RESTRUCTURE: MovementType.RESTRUCTURE,
      TERMINATION: MovementType.EXIT,
      MANAGER_CHANGE: MovementType.MANAGER_CHANGE,
    };
    const hiredByOrg = new Set<number>();
    const exitedByOrg = new Set<number>();
    for (const o of orgRows) {
      const type = typeMap[o.changeType] ?? MovementType.RESTRUCTURE;
      if (type === MovementType.ADMISSION) hiredByOrg.add(o.userId);
      if (type === MovementType.EXIT) exitedByOrg.add(o.userId);
      out.push({
        ...base,
        id: `org-${o.id}`,
        sourceKey: null,
        timestamp: o.effectiveDate,
        type,
        userId: o.userId,
        actorId: o.performedById,
        prevPosition: o.fromPosition?.name ?? null,
        newPosition: o.toPosition?.name ?? null,
        prevDepartment: o.fromDepartment?.name ?? null,
        newDepartment: o.toDepartment?.name ?? null,
        prevManager: o.fromManagerId ? (mgrNames.get(o.fromManagerId)?.fullName ?? null) : null,
        newManager: o.toManagerId ? (mgrNames.get(o.toManagerId)?.fullName ?? null) : null,
        reason: o.reason,
        notes: o.notes,
        origin: 'Estrutura organizacional',
      });
    }

    // 2) DepartmentTransferLog — transferências feitas pelo módulo Departamentos
    if (!ctx.actorId) {
      const trWhere: Prisma.DepartmentTransferLogWhereInput = {};
      if (r) trWhere.transferredAt = r;
      if (ctx.affectedIds) trWhere.userId = { in: ctx.affectedIds };
      const trRows = await this.prisma.read.departmentTransferLog.findMany({
        where: trWhere,
        include: {
          fromDepartment: { select: { name: true } },
          toDepartment: { select: { name: true } },
        },
        orderBy: { transferredAt: 'desc' },
        take: SOURCE_CAP,
      });
      for (const t of trRows) {
        out.push({
          ...base,
          id: `transfer-${t.id}`,
          sourceKey: null,
          timestamp: t.transferredAt,
          type: MovementType.TRANSFER,
          userId: t.userId,
          actorId: null,
          prevDepartment: t.fromDepartment?.name ?? null,
          newDepartment: t.toDepartment.name,
          reason: t.reason,
          origin: 'Departamentos',
        });
      }
    }

    // 3) UserAuditLog — edições do utilizador (departamento/cargo/responsável)
    //    + reactivações (ACTIVATED depois de DEACTIVATED/SUSPENDED).
    const uaWhere: Prisma.UserAuditLogWhereInput = {
      action: {
        in: [...MOVEMENT_USER_ACTIONS, 'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_SUSPENDED'],
      },
    };
    if (ctx.affectedIds) uaWhere.userId = { in: ctx.affectedIds };
    const uaRows = await this.prisma.read.userAuditLog.findMany({
      where: uaWhere,
      orderBy: { createdAt: 'asc' },
      take: SOURCE_CAP * 4,
    });
    const firstOff = new Map<number, Date>();
    for (const u of uaRows) {
      if (
        (u.action === 'USER_DEACTIVATED' || u.action === 'USER_SUSPENDED') &&
        !firstOff.has(u.userId)
      ) {
        firstOff.set(u.userId, u.createdAt);
      }
    }
    for (const u of uaRows) {
      if (!this.inRange(u.createdAt, ctx)) continue;
      if (ctx.actorId && u.performedById !== ctx.actorId) continue;
      let meta: { from?: unknown; to?: unknown; reason?: unknown } = {};
      try {
        meta = u.meta ? JSON.parse(u.meta) : {};
      } catch {
        meta = {};
      }
      const mv: Movement = {
        ...base,
        id: `mov-ua-${u.id}`,
        sourceKey: `uaudit-${u.id}`,
        timestamp: u.createdAt,
        type: MovementType.POSITION_CHANGE,
        userId: u.userId,
        actorId: u.performedById,
        origin: 'Utilizadores',
      };
      if (u.action === 'DEPARTMENT_CHANGED') {
        mv.type = MovementType.DEPARTMENT_CHANGE;
        mv.prevDepartment = str(meta.from);
        mv.newDepartment = str(meta.to);
      } else if (u.action === 'POSITION_CHANGED') {
        mv.prevPosition = str(meta.from);
        mv.newPosition = str(meta.to);
      } else if (u.action === 'MANAGER_CHANGED') {
        mv.type = MovementType.MANAGER_CHANGE;
        mv.prevManager = str(meta.from);
        mv.newManager = str(meta.to);
      } else if (u.action === 'USER_ACTIVATED') {
        const off = firstOff.get(u.userId);
        if (!off || off > u.createdAt) continue; // primeira activação, não reactivação
        mv.type = MovementType.REACTIVATION;
      } else {
        continue;
      }
      out.push(mv);
    }

    // 4) Admissões / saídas pelas datas reais do colaborador (só quando não
    //    há OrgChangeLog equivalente). Não se preenchem cargo/departamento:
    //    os valores actuais podem já não ser os da data de admissão.
    if (!ctx.actorId) {
      const hireWhere: Prisma.UserWhereInput = { hireDate: r ?? { not: null } };
      const exitWhere: Prisma.UserWhereInput = { exitDate: r ?? { not: null } };
      if (ctx.affectedIds) {
        hireWhere.id = { in: ctx.affectedIds };
        exitWhere.id = { in: ctx.affectedIds };
      }
      const [hires, exits] = await Promise.all([
        this.prisma.read.user.findMany({
          where: hireWhere,
          select: { id: true, hireDate: true },
          orderBy: { hireDate: 'desc' },
          take: SOURCE_CAP,
        }),
        this.prisma.read.user.findMany({
          where: exitWhere,
          select: { id: true, exitDate: true },
          orderBy: { exitDate: 'desc' },
          take: SOURCE_CAP,
        }),
      ]);
      for (const h of hires) {
        if (!h.hireDate || hiredByOrg.has(h.id)) continue;
        out.push({
          ...base,
          id: `hire-${h.id}`,
          sourceKey: null,
          timestamp: h.hireDate,
          type: MovementType.ADMISSION,
          userId: h.id,
          actorId: null,
          origin: 'Colaboradores',
        });
      }
      for (const e of exits) {
        if (!e.exitDate || exitedByOrg.has(e.id)) continue;
        out.push({
          ...base,
          id: `exit-${e.id}`,
          sourceKey: null,
          timestamp: e.exitDate,
          type: MovementType.EXIT,
          userId: e.id,
          actorId: null,
          origin: 'Colaboradores',
        });
      }
    }

    return out.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private movementDescription(m: Movement): string | null {
    const parts: string[] = [];
    if (m.prevDepartment || m.newDepartment)
      parts.push(`Departamento: ${m.prevDepartment ?? '–'} → ${m.newDepartment ?? '–'}`);
    if (m.prevPosition || m.newPosition)
      parts.push(`Cargo: ${m.prevPosition ?? '–'} → ${m.newPosition ?? '–'}`);
    if (m.prevManager || m.newManager)
      parts.push(`Responsável: ${m.prevManager ?? '–'} → ${m.newManager ?? '–'}`);
    if (m.reason) parts.push(`Motivo: ${m.reason}`);
    return parts.length ? parts.join(' · ') : null;
  }

  private movementToEntry(m: Movement): RawEntry {
    return {
      id: m.id,
      timestamp: m.timestamp,
      origin: m.origin,
      actorId: m.actorId,
      affectedId: m.userId,
      module: EventModule.HR,
      entity: 'User',
      entityId: m.userId,
      eventType: MOVEMENT_EVENT_TYPE[m.type],
      title: MOVEMENT_LABEL[m.type],
      description: this.movementDescription(m),
      status: 'SUCCESS',
    };
  }

  async collectDocuments(ctx: ScopeCtx): Promise<DocumentRecordDto[]> {
    const out: DocumentRecordDto[] = [];
    const r = this.range(ctx);
    const now = new Date();

    // DocAuditLog — histórico real por documento (versões, arquivo, eliminação…)
    const daWhere: Prisma.DocAuditLogWhereInput = {
      action: { notIn: [...DOC_NOISE_ACTIONS] },
    };
    if (r) daWhere.createdAt = r;
    if (ctx.actorId) daWhere.userId = ctx.actorId;
    const daRows = await this.prisma.read.docAuditLog.findMany({
      where: daWhere,
      include: {
        document: {
          select: {
            title: true,
            version: true,
            status: true,
            docCategory: { select: { name: true } },
            category: true,
            owner: { select: { id: true, fullName: true } },
          },
        },
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: SOURCE_CAP,
    });
    for (const d of daRows) {
      const map = DOC_ACTION[d.action];
      if (!map) continue;
      if (ctx.affectedIds && !(d.document.owner && ctx.affectedIds.includes(d.document.owner.id)))
        continue;
      out.push({
        id: `docaudit-${d.id}`,
        timestamp: d.createdAt,
        document: d.document.title,
        subject: d.document.owner?.fullName ?? null,
        type: d.document.docCategory?.name ?? String(d.document.category),
        eventType: map.type,
        action: map.label,
        version: d.document.version,
        user: d.user,
        status: String(d.document.status),
        origin: 'Biblioteca',
      });
    }

    if (!ctx.actorId) {
      // Validação / expiração — datas reais na própria linha do documento
      const docWhere: Prisma.DocumentWhereInput = {
        OR: [{ approvedAt: r ?? { not: null } }, { expiresAt: { lte: now, ...(r ?? {}) } }],
      };
      if (ctx.affectedIds) docWhere.ownerId = { in: ctx.affectedIds };
      const docs = await this.prisma.read.document.findMany({
        where: docWhere,
        select: {
          id: true,
          title: true,
          version: true,
          status: true,
          approvedAt: true,
          expiresAt: true,
          category: true,
          docCategory: { select: { name: true } },
          approver: { select: { id: true, fullName: true } },
          owner: { select: { id: true, fullName: true } },
        },
        take: SOURCE_CAP,
      });
      for (const d of docs) {
        const common = {
          document: d.title,
          subject: d.owner?.fullName ?? null,
          type: d.docCategory?.name ?? String(d.category),
          version: d.version,
          status: String(d.status),
          origin: 'Biblioteca',
        };
        if (d.approvedAt && this.inRange(d.approvedAt, ctx)) {
          out.push({
            ...common,
            id: `docapproved-${d.id}`,
            timestamp: d.approvedAt,
            eventType: HistoryEventType.APPROVED,
            action: 'Documento validado',
            user: d.approver,
          });
        }
        if (d.expiresAt && d.expiresAt <= now && this.inRange(d.expiresAt, ctx)) {
          out.push({
            ...common,
            id: `docexpired-${d.id}`,
            timestamp: d.expiresAt,
            eventType: HistoryEventType.COMPLETED,
            action: 'Documento expirado',
            user: null,
          });
        }
      }

      // Documentos do colaborador (EmployeeDocument)
      const edWhere: Prisma.EmployeeDocumentWhereInput = {
        OR: [
          { createdAt: r ?? {} },
          { signedAt: r ?? { not: null } },
          { deletedAt: r ?? { not: null } },
        ],
      };
      if (ctx.affectedIds) {
        // Employee não tem FK para User — só se pode filtrar por e-mail
        const users = await this.prisma.read.user.findMany({
          where: { id: { in: ctx.affectedIds } },
          select: { email: true },
        });
        edWhere.employee = { email: { in: users.map(u => u.email) } };
      }
      const eds = await this.prisma.read.employeeDocument.findMany({
        where: edWhere,
        include: { employee: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: SOURCE_CAP,
      });
      const uploaders = await this.nameMap(eds.flatMap(e => [e.uploadedById, e.deletedById]));
      for (const e of eds) {
        const common = {
          document: e.name,
          subject: e.employee.name,
          type: e.type,
          version: null,
          status: String(e.status),
          origin: 'Colaboradores',
        };
        if (this.inRange(e.createdAt, ctx)) {
          out.push({
            ...common,
            id: `empdoc-${e.id}`,
            timestamp: e.createdAt,
            eventType: HistoryEventType.CREATED,
            action: 'Documento adicionado',
            user: uploaders.get(e.uploadedById) ?? null,
          });
        }
        if (e.signedAt && this.inRange(e.signedAt, ctx)) {
          out.push({
            ...common,
            id: `empdoc-signed-${e.id}`,
            timestamp: e.signedAt,
            eventType: HistoryEventType.APPROVED,
            action: 'Documento assinado',
            user: null,
          });
        }
        if (e.deletedAt && this.inRange(e.deletedAt, ctx)) {
          out.push({
            ...common,
            id: `empdoc-deleted-${e.id}`,
            timestamp: e.deletedAt,
            eventType: HistoryEventType.DELETED,
            action: 'Documento eliminado',
            user: e.deletedById ? (uploaders.get(e.deletedById) ?? null) : null,
          });
        }
        if (e.expiresAt && e.expiresAt <= now && this.inRange(e.expiresAt, ctx)) {
          out.push({
            ...common,
            id: `empdoc-expired-${e.id}`,
            timestamp: e.expiresAt,
            eventType: HistoryEventType.COMPLETED,
            action: 'Documento expirado',
            user: null,
          });
        }
      }
    }

    return out.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private documentToEntry(d: DocumentRecordDto): RawEntry {
    return {
      id: d.id,
      timestamp: d.timestamp,
      origin: d.origin,
      actorId: d.user?.id ?? null,
      affectedId: null,
      module: EventModule.DOCUMENTS,
      entity: 'Document',
      entityId: null,
      eventType: d.eventType,
      title: d.action,
      description: [d.document, d.subject].filter(Boolean).join(' — '),
      status: d.status,
    };
  }

  // ══════════════════════════════════════════════════════
  // Listagens públicas
  // ══════════════════════════════════════════════════════

  private async finalize(
    raw: RawEntry[],
    scope: HistoryScopeDto,
  ): Promise<{ data: HistoryEntryDto[]; total: number; page: number; limit: number }> {
    const names = await this.nameMap(raw.flatMap(e => [e.actorId, e.affectedId]));
    const search = scope.search?.trim().toLowerCase();
    const entity = scope.entity?.toLowerCase();
    const type = scope.eventType?.toUpperCase();
    const status = scope.status?.toUpperCase();

    const filtered = raw
      .filter(e => {
        if (scope.module && e.module !== scope.module) return false;
        if (entity && !e.entity.toLowerCase().includes(entity)) return false;
        if (type && e.eventType !== type) return false;
        if (status && e.status.toUpperCase() !== status) return false;
        if (search) {
          const hay = [
            e.title,
            e.description,
            e.entity,
            e.actorId ? names.get(e.actorId)?.fullName : '',
            e.affectedId ? names.get(e.affectedId)?.fullName : '',
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const page = scope.page ?? 1;
    const limit = scope.limit ?? 30;
    const data = filtered.slice((page - 1) * limit, page * limit).map(e => {
      const { actorId, affectedId, ...rest } = e;
      return {
        ...rest,
        actor: actorId ? (names.get(actorId) ?? null) : null,
        affected: affectedId ? (names.get(affectedId) ?? null) : null,
        reference: e.entityId != null ? `${e.entity} #${e.entityId}` : null,
      };
    });
    return { data, total: filtered.length, page, limit };
  }

  /** Todas as entradas (já filtradas, sem paginar) — usado por abas e relatórios. */
  async allEntries(scope: HistoryScopeDto, activitiesOnly = false): Promise<RawEntry[]> {
    const ctx = await this.buildCtx(scope);
    if (activitiesOnly) {
      const [audit, docs] = await Promise.all([
        this.collectAudit(ctx, true),
        this.collectDocuments(ctx),
      ]);
      return [...audit, ...docs.map(d => this.documentToEntry(d))];
    }
    const [audit, userAudit, heads, movements, docs] = await Promise.all([
      this.collectAudit(ctx, true),
      this.collectUserAudit(ctx),
      this.collectHeadHistory(ctx),
      this.collectMovements(ctx),
      this.collectDocuments(ctx),
    ]);
    return [
      ...audit,
      ...userAudit,
      ...heads,
      ...movements.map(m => this.movementToEntry(m)),
      ...docs.map(d => this.documentToEntry(d)),
    ];
  }

  /** Aba "Histórico" — linha cronológica central. */
  async getHistory(scope: HistoryScopeDto) {
    const raw = await this.allEntries(scope);
    return this.finalize(raw, scope);
  }

  /** Aba "Actividades" — acções relevantes dos utilizadores na plataforma. */
  async getActivities(scope: HistoryScopeDto) {
    const raw = await this.allEntries(scope, true);
    return this.finalize(raw, scope);
  }

  async resolveEntries(scope: HistoryScopeDto, activitiesOnly = false) {
    const raw = await this.allEntries(scope, activitiesOnly);
    return this.finalize(raw, { ...scope, page: 1, limit: Number.MAX_SAFE_INTEGER });
  }

  /** Aba "Movimentos". */
  async getMovements(scope: HistoryScopeDto) {
    const ctx = await this.buildCtx(scope);
    let list = await this.collectMovements(ctx);
    if (scope.movementType) list = list.filter(m => m.type === scope.movementType);
    const names = await this.nameMap(list.flatMap(m => [m.userId, m.actorId]));
    const search = scope.search?.trim().toLowerCase();
    if (search) {
      list = list.filter(m =>
        [
          names.get(m.userId)?.fullName,
          m.prevDepartment,
          m.newDepartment,
          m.prevPosition,
          m.newPosition,
          m.reason,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }
    const page = scope.page ?? 1;
    const limit = scope.limit ?? 30;
    const data: MovementDto[] = list.slice((page - 1) * limit, page * limit).map(m => {
      const { userId, actorId, sourceKey: _sk, ...rest } = m;
      void _sk;
      return {
        ...rest,
        typeLabel: MOVEMENT_LABEL[m.type],
        employee: names.get(userId) ?? null,
        registeredBy: actorId ? (names.get(actorId) ?? null) : null,
      };
    });
    return { data, total: list.length, page, limit };
  }

  /** Aba "Alterações Organizacionais" — só a estrutura, nunca pessoas. */
  async collectOrgChanges(ctx: ScopeCtx): Promise<OrgChangeDto[]> {
    if (ctx.affectedIds) return [];
    const r = this.range(ctx);
    const out: OrgChangeDto[] = [];

    const depts = await this.prisma.read.department.findMany({
      select: { id: true, name: true, unit: { select: { name: true } } },
    });
    const deptById = new Map(depts.map(d => [d.id, d]));

    const LABEL: Record<string, string> = {
      CREATE: 'Departamento criado',
      UPDATE: 'Departamento actualizado',
      CHILD_CREATED: 'Subdepartamento criado',
      DEACTIVATE: 'Departamento desactivado',
      ACTIVATE: 'Departamento reactivado',
      ARCHIVE: 'Departamento arquivado',
      DELETE: 'Departamento eliminado',
    };

    const audit = await this.prisma.read.auditLog.findMany({
      where: {
        entity: 'Department',
        ...(r ? { timestamp: r } : {}),
        ...(ctx.actorId ? { userId: ctx.actorId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: SOURCE_CAP,
    });
    const people = await this.nameMap(audit.map(a => a.userId));
    for (const a of audit) {
      let meta: Record<string, unknown> = {};
      try {
        meta = a.metadata ? JSON.parse(a.metadata) : {};
      } catch {
        meta = {};
      }
      const dept = a.entityId != null ? deptById.get(a.entityId) : undefined;
      const base = {
        timestamp: a.timestamp,
        department: dept?.name ?? str(meta.name),
        unit: dept?.unit?.name ?? null,
        responsible: a.userId ? (people.get(a.userId) ?? null) : null,
      };
      const label = LABEL[a.action] ?? a.action;
      const changes = Array.isArray(meta.changes)
        ? (meta.changes as Array<{ field: string; before: unknown; after: unknown }>)
        : [];
      if (changes.length) {
        for (const c of changes) {
          out.push({
            ...base,
            id: `org-audit-${a.id}-${c.field}`,
            change: label,
            field: c.field,
            before: str(c.before),
            after: str(c.after),
            reason: null,
          });
        }
      } else {
        out.push({
          ...base,
          id: `org-audit-${a.id}`,
          change: label,
          field: typeof meta.childName === 'string' ? 'Novo subdepartamento' : null,
          before: null,
          after: str(meta.childName) ?? str(meta.name),
          reason: str(meta.reason),
        });
      }
    }

    if (!ctx.actorId) {
      const heads = await this.prisma.read.departmentHeadHistory.findMany({
        where: r ? { startedAt: r } : {},
        include: {
          department: { select: { name: true, unit: { select: { name: true } } } },
          head: { select: { fullName: true } },
          changedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: SOURCE_CAP,
      });
      const byDept = new Map<number, typeof heads>();
      for (const h of heads) {
        const arr = byDept.get(h.departmentId) ?? [];
        arr.push(h);
        byDept.set(h.departmentId, arr);
      }
      for (const arr of byDept.values())
        arr.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
      for (const h of heads) {
        const arr = byDept.get(h.departmentId) ?? [];
        const idx = arr.findIndex(x => x.id === h.id);
        out.push({
          id: `org-head-${h.id}`,
          timestamp: h.startedAt,
          department: h.department.name,
          unit: h.department.unit?.name ?? null,
          change: 'Responsável alterado',
          field: 'Responsável',
          before: idx > 0 ? arr[idx - 1].head.fullName : null,
          after: h.head.fullName,
          responsible: h.changedBy,
          reason: h.reason,
        });
      }
    }
    return out.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getOrgChanges(scope: HistoryScopeDto) {
    const ctx = await this.buildCtx(scope);
    let list = await this.collectOrgChanges(ctx);
    if (scope.departmentId) {
      const d = await this.prisma.read.department.findUnique({
        where: { id: scope.departmentId },
        select: { name: true },
      });
      list = list.filter(x => x.department === d?.name);
    }
    if (scope.search) {
      const s = scope.search.toLowerCase();
      list = list.filter(x =>
        [x.department, x.unit, x.change, x.field, x.before, x.after]
          .join(' ')
          .toLowerCase()
          .includes(s),
      );
    }
    const page = scope.page ?? 1;
    const limit = scope.limit ?? 30;
    return { data: list.slice((page - 1) * limit, page * limit), total: list.length, page, limit };
  }

  async getDocuments(scope: HistoryScopeDto) {
    const ctx = await this.buildCtx(scope);
    let list = await this.collectDocuments(ctx);
    if (scope.eventType) list = list.filter(d => d.eventType === scope.eventType?.toUpperCase());
    if (scope.status)
      list = list.filter(d => d.status.toUpperCase() === scope.status?.toUpperCase());
    if (scope.search) {
      const s = scope.search.toLowerCase();
      list = list.filter(d =>
        [d.document, d.subject, d.type, d.action].join(' ').toLowerCase().includes(s),
      );
    }
    const page = scope.page ?? 1;
    const limit = scope.limit ?? 30;
    return { data: list.slice((page - 1) * limit, page * limit), total: list.length, page, limit };
  }

  // ══════════════════════════════════════════════════════
  // Visão Geral
  // ══════════════════════════════════════════════════════

  async getOverview(scope: HistoryScopeDto) {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startYear = new Date(now.getFullYear(), 0, 1);
    const from = scope.from ? new Date(scope.from) : startYear;
    const to = scope.to ? new Date(scope.to) : now;
    if (scope.to && scope.to.length <= 10) to.setUTCHours(23, 59, 59, 999);
    const period = { gte: from, lte: to };

    const countEvents = async (r?: { gte: Date }) => {
      const parts = await Promise.all([
        this.prisma.read.auditLog.count({
          where: { action: { notIn: NOISE_ACTIONS }, ...(r ? { timestamp: r } : {}) },
        }),
        this.prisma.read.userAuditLog.count({ where: r ? { createdAt: r } : {} }),
        this.prisma.read.orgChangeLog.count({ where: r ? { effectiveDate: r } : {} }),
        this.prisma.read.departmentTransferLog.count({ where: r ? { transferredAt: r } : {} }),
        this.prisma.read.departmentHeadHistory.count({ where: r ? { startedAt: r } : {} }),
        this.prisma.read.docAuditLog.count({
          where: { action: { notIn: [...DOC_NOISE_ACTIONS] }, ...(r ? { createdAt: r } : {}) },
        }),
      ]);
      return parts.reduce((s, n) => s + n, 0);
    };

    const [
      totalEvents,
      eventsToday,
      eventsMonth,
      admissions,
      transfersLog,
      transfersOrg,
      positionChanges,
      departmentChanges,
      salaryChanges,
      evaluationsDone,
      trainingsDone,
      docsLibrary,
      docsEmployee,
      approved,
      rejected,
      recent,
      topUsersRaw,
      byEntity,
    ] = await Promise.all([
      countEvents(),
      countEvents({ gte: startToday }),
      countEvents({ gte: startMonth }),
      this.prisma.read.user.count({ where: { hireDate: period } }),
      this.prisma.read.departmentTransferLog.count({ where: { transferredAt: period } }),
      this.prisma.read.orgChangeLog.count({
        where: { changeType: 'TRANSFER', effectiveDate: period },
      }),
      this.prisma.read.userAuditLog.count({
        where: { action: 'POSITION_CHANGED', createdAt: period },
      }),
      this.prisma.read.userAuditLog.count({
        where: { action: 'DEPARTMENT_CHANGED', createdAt: period },
      }),
      this.countSalaryChanges(from, to),
      this.prisma.read.performanceReview.count({
        where: { status: { in: ['PUBLISHED', 'FINALIZED'] }, updatedAt: period },
      }),
      this.prisma.read.enrollment.count({
        where: { status: 'COMPLETED', completedAt: period },
      }),
      this.prisma.read.document.count({ where: { createdAt: period } }),
      this.prisma.read.employeeDocument.count({ where: { createdAt: period } }),
      this.prisma.read.leaveRequest.count({ where: { status: 'APPROVED', reviewedAt: period } }),
      this.prisma.read.leaveRequest.count({ where: { status: 'REJECTED', reviewedAt: period } }),
      this.getHistory({ page: 1, limit: 10 }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { timestamp: period, userId: { not: null }, action: { notIn: NOISE_ACTIONS } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['action', 'entity'],
        where: { timestamp: period, action: { notIn: NOISE_ACTIONS } },
        _count: { id: true },
      }),
    ]);

    const names = await this.nameMap(topUsersRaw.map(u => u.userId));
    const moduleCounts = new Map<string, number>();
    for (const g of byEntity) {
      const m = deriveModule(g.action, g.entity);
      moduleCounts.set(m, (moduleCounts.get(m) ?? 0) + g._count.id);
    }

    return {
      period: { from, to },
      kpis: {
        totalEvents,
        eventsToday,
        eventsMonth,
        admissions,
        transfers: transfersLog + transfersOrg,
        positionChanges,
        departmentChanges,
        salaryChanges,
        evaluationsCompleted: evaluationsDone,
        trainingsCompleted: trainingsDone,
        documentsAdded: docsLibrary + docsEmployee,
        requestsApproved: approved,
        requestsRejected: rejected,
      },
      recent: recent.data,
      topUsers: topUsersRaw.map(u => ({
        user: u.userId ? (names.get(u.userId) ?? null) : null,
        count: u._count.id,
      })),
      topModules: [...moduleCounts.entries()]
        .map(([module, count]) => ({ module, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /** Alterações salariais = registos de compensação com um anterior do mesmo colaborador. */
  async salaryChanges(
    ctx: ScopeCtx,
  ): Promise<Array<{ id: number; userId: number; at: Date; from: number; to: number }>> {
    const rows = await this.prisma.read.employeeCompensation.findMany({
      where: ctx.affectedIds ? { userId: { in: ctx.affectedIds } } : {},
      select: { id: true, userId: true, effectiveFrom: true, baseSalary: true },
      orderBy: [{ userId: 'asc' }, { effectiveFrom: 'asc' }],
    });
    const out: Array<{ id: number; userId: number; at: Date; from: number; to: number }> = [];
    let prev: (typeof rows)[number] | null = null;
    for (const row of rows) {
      if (prev && prev.userId === row.userId && prev.baseSalary !== row.baseSalary) {
        if (this.inRange(row.effectiveFrom, ctx)) {
          out.push({
            id: row.id,
            userId: row.userId,
            at: row.effectiveFrom,
            from: prev.baseSalary,
            to: row.baseSalary,
          });
        }
      }
      prev = row;
    }
    return out;
  }

  private async countSalaryChanges(from: Date, to: Date): Promise<number> {
    return (await this.salaryChanges({ from, to })).length;
  }

  // ══════════════════════════════════════════════════════
  // Aba "Colaborador" — extras da timeline pessoal
  // ══════════════════════════════════════════════════════

  /** ADMIN/RH vêem qualquer colaborador; os restantes só a si próprios ou à sua equipa directa. */
  async assertCanViewUser(
    actor: { id: number; role?: { name: string } | null },
    targetId: number,
  ): Promise<void> {
    const role = actor.role?.name;
    if (role === 'ADMIN' || role === 'RH' || actor.id === targetId) return;
    const target = await this.prisma.read.user.findUnique({
      where: { id: targetId },
      select: { managerId: true },
    });
    if (!target || target.managerId !== actor.id) {
      throw new ForbiddenException('Sem permissão para ver o histórico deste colaborador');
    }
  }

  /**
   * Eventos que a timeline pessoal original não cobria: admissão/saída,
   * transferências, promoções, mudanças de cargo/departamento/responsável,
   * ausências aprovadas e (só ADMIN/RH ou o próprio) alterações salariais.
   */
  async timelineExtras(
    userId: number,
    filters: { from?: string; to?: string; category?: string },
    canSeeSalary: boolean,
  ): Promise<TimelineEvent[]> {
    const ctx = await this.buildCtx({ from: filters.from, to: filters.to });
    ctx.affectedIds = [userId];
    const events: TimelineEvent[] = [];
    const want = (c: EventCategory) => !filters.category || filters.category === c;

    if (want(EventCategory.CAREER)) {
      const movements = await this.collectMovements(ctx);
      const milestoneTypes: MovementType[] = [
        MovementType.ADMISSION,
        MovementType.PROMOTION,
        MovementType.EXIT,
      ];
      for (const m of movements) {
        events.push({
          id: m.id,
          source: 'MOVEMENT',
          timestamp: m.timestamp,
          category: EventCategory.CAREER,
          module: EventModule.HR,
          impactScore: 0,
          milestone: milestoneTypes.includes(m.type),
          icon: '🛤️',
          title: MOVEMENT_LABEL[m.type],
          action: m.type,
          entity: 'User',
          entityId: userId,
          userId,
          description: this.movementDescription(m),
        });
      }
    }

    if (want(EventCategory.ATTENDANCE)) {
      const r = this.range(ctx);
      const leaves = await this.prisma.read.leaveRequest.findMany({
        where: { userId, status: 'APPROVED', ...(r ? { startDate: r } : {}) },
        select: { id: true, leaveTypeCode: true, startDate: true, endDate: true },
        orderBy: { startDate: 'desc' },
        take: 50,
      });
      for (const l of leaves) {
        events.push({
          id: `leave-${l.id}`,
          source: 'LEAVE',
          timestamp: l.startDate,
          category: EventCategory.ATTENDANCE,
          module: EventModule.HR,
          impactScore: 0,
          milestone: false,
          icon: '🌴',
          title: `Ausência aprovada: ${l.leaveTypeCode}`,
          action: 'LEAVE_APPROVED',
          entity: 'LeaveRequest',
          entityId: l.id,
          userId,
          description: `${l.startDate.toISOString().slice(0, 10)} → ${l.endDate.toISOString().slice(0, 10)}`,
        });
      }
    }

    if (canSeeSalary && want(EventCategory.FINANCIAL)) {
      for (const c of await this.salaryChanges(ctx)) {
        events.push({
          id: `salary-${c.id}`,
          source: 'PAYROLL',
          timestamp: c.at,
          category: EventCategory.FINANCIAL,
          module: EventModule.PAYROLL,
          impactScore: 0,
          milestone: false,
          icon: '💰',
          title: 'Alteração salarial',
          action: 'SALARY_CHANGED',
          entity: 'EmployeeCompensation',
          entityId: c.id,
          userId,
          description: `${c.from} → ${c.to}`,
        });
      }
    }
    return events;
  }
}
