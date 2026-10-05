// src/audit/audit-internal.service.ts
// Aba «Auditorias e Inspeções» (docs/modulo_audit.md §9): auditorias internas
// formais com verificações, evidências, constatações, ações corretivas e
// aprovação final. A aprovação do relatório fica registada como evento de auditoria.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InternalAuditStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import type { AuditActor } from './audit-incidents.service';
import {
  ApproveAuditReportDto,
  AuditActionDto,
  AuditCheckDto,
  AuditEvidenceDto,
  AuditFindingDto,
  AuditStatusDto,
  CreateInternalAuditDto,
  InternalAuditFilterDto,
  UpdateAuditActionDto,
  UpdateAuditCheckDto,
  UpdateInternalAuditDto,
} from './audit-internal.dto';
import { buildPaginatedResponse, calculatePagination } from '../common/helpers/pagination.helper';

const TRANSITIONS: Record<InternalAuditStatus, InternalAuditStatus[]> = {
  PLANNED: ['PREPARING', 'IN_PROGRESS', 'CANCELLED'],
  PREPARING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['IN_REVIEW', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'CANCELLED'],
  AWAITING_CORRECTIVE_ACTIONS: ['IN_REVIEW', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Estados em que ainda se recolhem verificações, evidências e constatações.
const COLLECTING: InternalAuditStatus[] = ['PLANNED', 'PREPARING', 'IN_PROGRESS'];
// Estados em que se podem criar/gerir ações corretivas.
const ACTIONABLE: InternalAuditStatus[] = [
  'IN_PROGRESS',
  'IN_REVIEW',
  'AWAITING_CORRECTIVE_ACTIONS',
];

const STATUS_PT: Record<InternalAuditStatus, string> = {
  PLANNED: 'Planeada',
  PREPARING: 'Em preparação',
  IN_PROGRESS: 'Em execução',
  IN_REVIEW: 'Em revisão',
  AWAITING_CORRECTIVE_ACTIONS: 'A aguardar ações corretivas',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const date = (v?: string) => (v ? new Date(v) : undefined);
const fmt = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');

@Injectable()
export class AuditInternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async usersById(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((i): i is number => typeof i === 'number'))];
    if (!unique.length) return new Map<number, { id: number; fullName: string; email: string }>();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true, email: true },
    });
    return new Map(users.map(u => [u.id, u]));
  }

  private async assertUsers(ids: Array<number | undefined>) {
    const unique = [...new Set(ids.filter((i): i is number => typeof i === 'number'))];
    if (!unique.length) return;
    const found = await this.prisma.user.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException('Utilizador inexistente');
  }

  private async find(id: number) {
    const a = await this.prisma.internalAudit.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Auditoria ${id} não encontrada`);
    return a;
  }

  private requireState(status: InternalAuditStatus, allowed: InternalAuditStatus[], what: string) {
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Não é possível ${what} no estado «${STATUS_PT[status]}»`);
    }
  }

  private record(
    actor: AuditActor,
    action: string,
    id: number,
    extra: Record<string, unknown> = {},
    severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW',
  ) {
    return this.audit.log({
      userId: actor.id,
      action,
      entity: 'InternalAudit',
      entityId: id,
      ip: actor.ip,
      severity,
      metadata: extra,
    });
  }

  // ── Consulta ──────────────────────────────────────────────────────────────

  /** §16 — o AUDITOR só vê/gere as auditorias em que é responsável, equipa ou criador. */
  private auditorScope(viewer?: { id: number; role?: { name?: string | null } | null }) {
    if (!viewer || viewer.role?.name !== 'AUDITOR') return undefined;
    return {
      OR: [
        { leadAuditorId: viewer.id },
        { createdById: viewer.id },
        { teamIds: { has: viewer.id } },
      ],
    } satisfies Prisma.InternalAuditWhereInput;
  }

  async assertAccess(id: number, viewer: { id: number; role?: { name?: string | null } | null }) {
    const scope = this.auditorScope(viewer);
    if (!scope) return;
    const ok = await this.prisma.read.internalAudit.count({ where: { id, ...scope } });
    if (!ok) throw new ForbiddenException('Auditoria fora do seu mandato');
  }

  async list(
    filters: InternalAuditFilterDto,
    viewer?: { id: number; role?: { name?: string | null } | null },
  ) {
    const { page = 1, limit = 20, status, type, search } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const scope = this.auditorScope(viewer);
    const where: Prisma.InternalAuditWhereInput = scope ? { AND: [scope] } : {};
    if (status) where.status = status;
    if (type) where.type = type;
    const term = search?.trim();
    if (term) {
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
      ];
    }
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.read.internalAudit.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { checks: true, findings: true, actions: true, evidences: true } },
        },
      }),
      this.prisma.read.internalAudit.count({ where }),
      this.prisma.read.internalAudit.groupBy({
        by: ['status'],
        where: scope,
        _count: true,
      }),
    ]);
    const users = await this.usersById(rows.map(r => r.leadAuditorId));
    const data = rows.map(({ _count, ...r }) => ({
      ...r,
      counts: _count,
      leadAuditor: r.leadAuditorId ? (users.get(r.leadAuditorId) ?? null) : null,
    }));
    return {
      ...buildPaginatedResponse(data, total, page, limit),
      counts: { byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])) },
    };
  }

  async get(id: number) {
    const a = await this.prisma.read.internalAudit.findUnique({
      where: { id },
      include: {
        checks: { orderBy: { id: 'asc' } },
        evidences: { orderBy: { createdAt: 'desc' } },
        findings: { orderBy: { id: 'asc' } },
        actions: { orderBy: { id: 'asc' } },
      },
    });
    if (!a) throw new NotFoundException(`Auditoria ${id} não encontrada`);
    const history = await this.prisma.read.auditLog.findMany({
      where: { entity: 'InternalAudit', entityId: id },
      orderBy: { timestamp: 'asc' },
      take: 200,
      select: { id: true, action: true, timestamp: true, userId: true, metadata: true },
    });
    const users = await this.usersById([
      a.leadAuditorId,
      a.approvedById,
      a.createdById,
      ...a.teamIds,
      ...a.actions.map(x => x.responsibleId),
      ...a.evidences.map(x => x.addedById),
      ...history.map(h => h.userId),
    ]);
    const u = (i: number | null) => (i ? (users.get(i) ?? null) : null);
    return {
      ...a,
      leadAuditor: u(a.leadAuditorId),
      approvedBy: u(a.approvedById),
      createdBy: u(a.createdById),
      team: a.teamIds.map(i => users.get(i)).filter(Boolean),
      evidences: a.evidences.map(e => ({ ...e, addedBy: u(e.addedById) })),
      actions: a.actions.map(x => ({ ...x, responsible: u(x.responsibleId) })),
      history: history.map(h => {
        let metadata: unknown = null;
        if (h.metadata) {
          try {
            metadata = JSON.parse(h.metadata);
          } catch {
            metadata = h.metadata;
          }
        }
        return { id: h.id, action: h.action, timestamp: h.timestamp, user: u(h.userId), metadata };
      }),
    };
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async create(dto: CreateInternalAuditDto, actor: AuditActor) {
    await this.assertUsers([dto.leadAuditorId, ...(dto.teamIds ?? [])]);
    this.assertDates(dto.periodFrom, dto.periodTo, dto.startDate, dto.dueDate);
    const tmp = await this.prisma.internalAudit.create({
      data: {
        code: `TMP-${randomUUID()}`,
        title: dto.title.trim(),
        objective: dto.objective?.trim() || null,
        scope: dto.scope?.trim() || null,
        type: dto.type,
        modules: dto.modules ?? [],
        periodFrom: date(dto.periodFrom),
        periodTo: date(dto.periodTo),
        criteria: dto.criteria?.trim() || null,
        leadAuditorId: dto.leadAuditorId ?? null,
        teamIds: dto.teamIds ?? [],
        startDate: date(dto.startDate),
        dueDate: date(dto.dueDate),
        createdById: actor.id,
      },
    });
    const a = await this.prisma.internalAudit.update({
      where: { id: tmp.id },
      data: { code: `AUDI-${tmp.createdAt.getUTCFullYear()}-${String(tmp.id).padStart(4, '0')}` },
    });
    await this.record(actor, 'AUDIT_CREATED', a.id, { code: a.code, type: a.type });
    return a;
  }

  private assertDates(pf?: string, pt?: string, start?: string, due?: string) {
    if (pf && pt && new Date(pf) > new Date(pt)) {
      throw new BadRequestException('O fim do período analisado é anterior ao início');
    }
    if (start && due && new Date(start) > new Date(due)) {
      throw new BadRequestException('O prazo é anterior à data de início');
    }
  }

  async update(id: number, dto: UpdateInternalAuditDto, actor: AuditActor) {
    const cur = await this.find(id);
    this.requireState(cur.status, ['PLANNED', 'PREPARING', 'IN_PROGRESS'], 'editar a auditoria');
    await this.assertUsers([dto.leadAuditorId, ...(dto.teamIds ?? [])]);
    this.assertDates(
      dto.periodFrom ?? cur.periodFrom?.toISOString(),
      dto.periodTo ?? cur.periodTo?.toISOString(),
      dto.startDate ?? cur.startDate?.toISOString(),
      dto.dueDate ?? cur.dueDate?.toISOString(),
    );
    const data: Prisma.InternalAuditUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.objective !== undefined) data.objective = dto.objective.trim() || null;
    if (dto.scope !== undefined) data.scope = dto.scope.trim() || null;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.modules !== undefined) data.modules = dto.modules;
    if (dto.periodFrom !== undefined) data.periodFrom = date(dto.periodFrom);
    if (dto.periodTo !== undefined) data.periodTo = date(dto.periodTo);
    if (dto.criteria !== undefined) data.criteria = dto.criteria.trim() || null;
    if (dto.leadAuditorId !== undefined) data.leadAuditorId = dto.leadAuditorId;
    if (dto.teamIds !== undefined) data.teamIds = dto.teamIds;
    if (dto.startDate !== undefined) data.startDate = date(dto.startDate);
    if (dto.dueDate !== undefined) data.dueDate = date(dto.dueDate);
    const a = await this.prisma.internalAudit.update({ where: { id }, data });
    await this.record(actor, 'AUDIT_UPDATED', id, { fields: Object.keys(data) });
    return a;
  }

  async changeStatus(id: number, dto: AuditStatusDto, actor: AuditActor) {
    const cur = await this.find(id);
    if (!TRANSITIONS[cur.status].includes(dto.status)) {
      throw new BadRequestException(
        `Transição inválida: ${STATUS_PT[cur.status]} → ${STATUS_PT[dto.status]}`,
      );
    }
    const data: Prisma.InternalAuditUpdateInput = { status: dto.status };
    if (dto.status === 'CANCELLED') {
      const reason = dto.reason?.trim();
      if (!reason) throw new BadRequestException('Indique a justificação do cancelamento');
      data.cancelReason = reason;
    }
    if (dto.status === 'IN_PROGRESS' && !cur.leadAuditorId) {
      throw new BadRequestException('Defina o auditor responsável antes de iniciar a execução');
    }
    if (dto.status === 'IN_REVIEW' && cur.status === 'IN_PROGRESS') {
      const [checks, pending] = await Promise.all([
        this.prisma.internalAuditCheck.count({ where: { auditId: id } }),
        this.prisma.internalAuditCheck.count({ where: { auditId: id, status: 'PENDING' } }),
      ]);
      if (!checks) throw new BadRequestException('Adicione pelo menos uma verificação');
      if (pending) {
        throw new BadRequestException(`Existem ${pending} verificação(ões) por concluir`);
      }
    }
    const a = await this.prisma.internalAudit.update({ where: { id }, data });
    const label =
      dto.status === 'IN_REVIEW' ? 'AUDIT_SUBMITTED_FOR_REVIEW' : 'AUDIT_STATUS_CHANGED';
    await this.record(actor, label, id, {
      from: cur.status,
      to: dto.status,
      reason: dto.reason ?? null,
    });
    return a;
  }

  /** Aprovação final do relatório — fica registada como evento de auditoria (autor + data). */
  async approveReport(id: number, dto: ApproveAuditReportDto, actor: AuditActor) {
    const cur = await this.find(id);
    this.requireState(
      cur.status,
      ['IN_REVIEW', 'AWAITING_CORRECTIVE_ACTIONS'],
      'aprovar o relatório',
    );
    if (cur.leadAuditorId === actor.id) {
      throw new BadRequestException(
        'O relatório tem de ser aprovado por alguém diferente do auditor responsável',
      );
    }
    const closingReport = dto.closingReport.trim();
    if (!closingReport) throw new BadRequestException('O relatório de encerramento é obrigatório');
    const openActions = await this.prisma.internalAuditAction.count({
      where: { auditId: id, status: { not: 'DONE' } },
    });
    const a = await this.prisma.internalAudit.update({
      where: { id },
      data: {
        result: dto.result,
        closingReport,
        approvedById: actor.id,
        approvedAt: new Date(),
        status: openActions ? 'AWAITING_CORRECTIVE_ACTIONS' : 'COMPLETED',
      },
    });
    await this.record(
      actor,
      'AUDIT_REPORT_APPROVED',
      id,
      { result: dto.result, openActions, status: a.status },
      'MEDIUM',
    );
    return a;
  }

  // ── Verificações ──────────────────────────────────────────────────────────

  async addCheck(id: number, dto: AuditCheckDto, actor: AuditActor) {
    const cur = await this.find(id);
    this.requireState(cur.status, COLLECTING, 'adicionar verificações');
    const c = await this.prisma.internalAuditCheck.create({
      data: { auditId: id, title: dto.title.trim() },
    });
    await this.record(actor, 'AUDIT_CHECK_ADDED', id, { checkId: c.id });
    return c;
  }

  async updateCheck(id: number, checkId: number, dto: UpdateAuditCheckDto, actor: AuditActor) {
    const cur = await this.find(id);
    this.requireState(cur.status, COLLECTING, 'atualizar verificações');
    const existing = await this.prisma.internalAuditCheck.findFirst({
      where: { id: checkId, auditId: id },
    });
    if (!existing) throw new NotFoundException('Verificação não encontrada');
    const c = await this.prisma.internalAuditCheck.update({
      where: { id: checkId },
      data: { status: dto.status, notes: dto.notes?.trim() || null },
    });
    await this.record(actor, 'AUDIT_CHECK_UPDATED', id, { checkId, status: dto.status });
    return c;
  }

  // ── Evidências, constatações, ações ───────────────────────────────────────

  async addEvidence(id: number, dto: AuditEvidenceDto, actor: AuditActor) {
    const cur = await this.find(id);
    this.requireState(cur.status, COLLECTING, 'anexar evidências');
    if (dto.auditLogId) {
      const l = await this.prisma.auditLog.findUnique({
        where: { id: dto.auditLogId },
        select: { id: true },
      });
      if (!l) throw new BadRequestException(`Evento de auditoria ${dto.auditLogId} não existe`);
    }
    const e = await this.prisma.internalAuditEvidence.create({
      data: {
        auditId: id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        url: dto.url?.trim() || null,
        auditLogId: dto.auditLogId ?? null,
        addedById: actor.id,
      },
    });
    await this.record(actor, 'AUDIT_EVIDENCE_ADDED', id, { evidenceId: e.id });
    return e;
  }

  async addFinding(id: number, dto: AuditFindingDto, actor: AuditActor) {
    const cur = await this.find(id);
    this.requireState(cur.status, COLLECTING, 'registar constatações');
    const f = await this.prisma.internalAuditFinding.create({
      data: {
        auditId: id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        nonConformity: dto.nonConformity,
        risk: dto.risk,
        recommendation: dto.recommendation?.trim() || null,
      },
    });
    await this.record(actor, 'AUDIT_FINDING_ADDED', id, {
      findingId: f.id,
      nonConformity: f.nonConformity,
      risk: f.risk,
    });
    return f;
  }

  async addAction(id: number, dto: AuditActionDto, actor: AuditActor) {
    const cur = await this.find(id);
    this.requireState(cur.status, ACTIONABLE, 'criar ações corretivas');
    await this.assertUsers([dto.responsibleId]);
    if (dto.findingId) {
      const f = await this.prisma.internalAuditFinding.findFirst({
        where: { id: dto.findingId, auditId: id },
        select: { id: true },
      });
      if (!f) throw new BadRequestException('Constatação não pertence a esta auditoria');
    }
    const x = await this.prisma.internalAuditAction.create({
      data: {
        auditId: id,
        findingId: dto.findingId ?? null,
        description: dto.description.trim(),
        responsibleId: dto.responsibleId ?? null,
        dueDate: date(dto.dueDate),
      },
    });
    await this.record(actor, 'AUDIT_ACTION_CREATED', id, {
      actionId: x.id,
      responsibleId: x.responsibleId,
    });
    return x;
  }

  async updateAction(id: number, actionId: number, dto: UpdateAuditActionDto, actor: AuditActor) {
    const cur = await this.find(id);
    this.requireState(cur.status, ACTIONABLE, 'atualizar ações corretivas');
    const existing = await this.prisma.internalAuditAction.findFirst({
      where: { id: actionId, auditId: id },
    });
    if (!existing) throw new NotFoundException('Ação corretiva não encontrada');
    const x = await this.prisma.internalAuditAction.update({
      where: { id: actionId },
      data: { status: dto.status, completedAt: dto.status === 'DONE' ? new Date() : null },
    });
    await this.record(actor, 'AUDIT_ACTION_UPDATED', id, { actionId, status: dto.status });

    // Relatório já aprovado e última ação concluída → a auditoria fecha-se.
    if (cur.status === 'AWAITING_CORRECTIVE_ACTIONS' && dto.status === 'DONE') {
      const open = await this.prisma.internalAuditAction.count({
        where: { auditId: id, status: { not: 'DONE' } },
      });
      if (!open) {
        await this.prisma.internalAudit.update({ where: { id }, data: { status: 'COMPLETED' } });
        await this.record(actor, 'AUDIT_COMPLETED', id, { reason: 'Todas as ações concluídas' });
      }
    }
    return x;
  }

  // ── Exportação do relatório final ─────────────────────────────────────────

  async exportReport(id: number, actor: AuditActor) {
    const a = await this.get(id);
    if (a.status !== 'COMPLETED' && a.status !== 'AWAITING_CORRECTIVE_ACTIONS') {
      throw new BadRequestException('Só é possível exportar o relatório depois de aprovado');
    }
    const L: string[] = [];
    L.push(`# Relatório de auditoria ${a.code} — ${a.title}`, '');
    L.push(`- **Tipo:** ${a.type}`, `- **Estado:** ${STATUS_PT[a.status]}`);
    L.push(`- **Resultado:** ${a.result ?? '—'}`);
    L.push(`- **Período analisado:** ${fmt(a.periodFrom)} a ${fmt(a.periodTo)}`);
    L.push(`- **Módulos:** ${a.modules.join(', ') || '—'}`);
    L.push(`- **Auditor responsável:** ${a.leadAuditor?.fullName ?? '—'}`);
    L.push(`- **Equipa:** ${a.team.map(t => t?.fullName).join(', ') || '—'}`);
    L.push(`- **Início / prazo:** ${fmt(a.startDate)} / ${fmt(a.dueDate)}`);
    L.push(`- **Aprovado por:** ${a.approvedBy?.fullName ?? '—'} em ${fmt(a.approvedAt)}`, '');
    L.push('## Objetivo', a.objective ?? '—', '', '## Âmbito', a.scope ?? '—', '');
    L.push('## Critérios e políticas', a.criteria ?? '—', '');
    L.push('## Verificações');
    a.checks.forEach(c => L.push(`- [${c.status}] ${c.title}${c.notes ? ` — ${c.notes}` : ''}`));
    L.push('', '## Constatações');
    a.findings.forEach(f =>
      L.push(
        `- **${f.title}** (${f.nonConformity ? 'não conformidade' : 'observação'}, risco ${f.risk})` +
          `${f.description ? `: ${f.description}` : ''}${f.recommendation ? ` — Recomendação: ${f.recommendation}` : ''}`,
      ),
    );
    L.push('', '## Evidências');
    a.evidences.forEach(e =>
      L.push(
        `- ${e.title}${e.url ? ` (${e.url})` : ''}${e.auditLogId ? ` [evento #${e.auditLogId}]` : ''}`,
      ),
    );
    L.push('', '## Plano de ações corretivas');
    a.actions.forEach(x =>
      L.push(
        `- [${x.status}] ${x.description} — ${x.responsible?.fullName ?? 'sem responsável'}, prazo ${fmt(x.dueDate)}`,
      ),
    );
    L.push('', '## Relatório de encerramento', a.closingReport ?? '—', '');

    await this.audit.log({
      userId: actor.id,
      action: 'EXPORT',
      entity: 'InternalAudit',
      entityId: id,
      ip: actor.ip,
      severity: 'MEDIUM',
      metadata: { format: 'markdown', code: a.code },
    });
    return { filename: `${a.code}.md`, content: L.join('\n') };
  }
}
