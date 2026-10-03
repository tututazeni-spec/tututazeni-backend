// src/process-standard/process-calendar.service.ts
// Aba "Calendário e Prazos" (docs/Modulo_Processes.md §10): itens de calendário
// (tarefas e processos) com datas, dependências e conflitos de atribuição;
// reagendamento autorizado com registo do prazo anterior, novo prazo, autor e
// justificação; exportação iCalendar.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InstanceStatus, Prisma, StepProgressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { ProcessStandardService } from './process-standard.service';
import { effectiveDependencies, formatTaskCode, isDoneStatus } from './process-workflow';
import {
  buildIcs,
  CalendarItem,
  classifyDue,
  defaultRange,
  detectAssignmentConflicts,
  plannedDurationHours,
} from './process-calendar';
import { CalendarFilterDto, RescheduleDto } from './process-standard.dto';

const MANAGE_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR];
const MAX_ITEMS = 1000;
const ACTIVE = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'] as const;
const OPEN_APPROVAL = ['PENDING', 'INFO_REQUESTED', 'ESCALATED'];
// Etapas que o motor trata sozinho não têm responsável nem prazo úteis no calendário.
const NON_CALENDAR_TYPES = ['START', 'END', 'GATEWAY', 'PARALLEL'] as const;
const user3 = { select: { id: true, fullName: true } } as const;

const TASK_SELECT = {
  id: true,
  instanceId: true,
  stepId: true,
  stepOrder: true,
  status: true,
  startedAt: true,
  assignedAt: true,
  completedAt: true,
  slaDeadline: true,
  assignee: user3,
  step: {
    select: {
      title: true,
      order: true,
      parallel: true,
      dependsOnOrders: true,
      estimatedMinutes: true,
      slaHours: true,
      responsible: user3,
    },
  },
  instance: {
    select: {
      id: true,
      code: true,
      title: true,
      priority: true,
      startedAt: true,
      process: {
        select: {
          id: true,
          code: true,
          title: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.StepProgressSelect;

const INSTANCE_SELECT = {
  id: true,
  code: true,
  title: true,
  status: true,
  priority: true,
  startedAt: true,
  slaDeadline: true,
  completedAt: true,
  currentResponsible: user3,
  process: {
    select: {
      id: true,
      code: true,
      title: true,
      department: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ProcessInstanceSelect;

const parseMeta = (meta: string | null): Record<string, unknown> => {
  if (!meta) return {};
  try {
    const v: unknown = JSON.parse(meta);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

@Injectable()
export class ProcessCalendarService {
  private readonly logger = new Logger(ProcessCalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processes: ProcessStandardService,
  ) {}

  private isManager(user: CurrentUserData) {
    return isPrivileged(user, MANAGE_ROLES);
  }

  private endOfDay(v: string) {
    const d = new Date(v);
    if (!v.includes('T')) d.setUTCHours(23, 59, 59, 999);
    return d;
  }

  // ─── Consulta ─────────────────────────────────────────────────────────────

  /** Itens do calendário já filtrados pelo âmbito do utilizador. */
  async collectItems(f: CalendarFilterDto, user: CurrentUserData, now = new Date()) {
    const manager = this.isManager(user);
    const scope = f.scope ?? (manager ? 'all' : 'mine');
    if (scope === 'all' && !manager) {
      throw new ForbiddenException('Apenas perfis de gestão podem ver todos os prazos');
    }
    const def = defaultRange(now);
    const from = f.from ? new Date(f.from) : def.from;
    const to = f.to ? this.endOfDay(f.to) : def.to;
    if (from > to) throw new BadRequestException('O intervalo de datas é inválido');
    const kind = f.kind ?? 'ALL';

    const items: CalendarItem[] = [];

    if (kind !== 'PROCESS') items.push(...(await this.taskItems(f, user, scope, from, to, now)));
    if (kind !== 'TASK') items.push(...(await this.processItems(f, user, scope, from, to)));

    items.sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
    return {
      items: items.slice(0, MAX_ITEMS),
      from,
      to,
      scope,
      truncated: items.length > MAX_ITEMS,
    };
  }

  private async taskItems(
    f: CalendarFilterDto,
    user: CurrentUserData,
    scope: 'mine' | 'all',
    from: Date,
    to: Date,
    now: Date,
  ): Promise<CalendarItem[]> {
    const and: Prisma.StepProgressWhereInput[] = [
      {
        OR: [
          { slaDeadline: { gte: from, lte: to } },
          { startedAt: { gte: from, lte: to } },
          { completedAt: { gte: from, lte: to } },
        ],
      },
    ];
    const where: Prisma.StepProgressWhereInput = {
      AND: and,
      step: { type: { notIn: [...NON_CALENDAR_TYPES] } },
      instance: { archivedAt: null },
    };
    if (scope === 'mine') {
      and.push({
        OR: [
          { assigneeId: user.id },
          { reviewerId: user.id },
          { assigneeId: null, step: { responsibleId: user.id } },
          { assigneeId: null, instance: { targetUserId: user.id } },
        ],
      });
    }
    if (f.status) where.status = f.status as StepProgressStatus;
    if (f.instanceId) where.instanceId = f.instanceId;
    if (f.overdue) {
      where.status = { in: [...ACTIVE] };
      where.slaDeadline = { lt: now };
    }
    if (f.responsibleId) {
      and.push({
        OR: [
          { assigneeId: f.responsibleId },
          { assigneeId: null, step: { responsibleId: f.responsibleId } },
        ],
      });
    }
    const instanceWhere: Prisma.ProcessInstanceWhereInput = { archivedAt: null };
    if (f.priority) instanceWhere.priority = f.priority;
    const processWhere: Prisma.ProcessStandardWhereInput = {};
    if (f.departmentId) processWhere.departmentId = f.departmentId;
    if (f.unitId) processWhere.department = { unitId: f.unitId };
    if (Object.keys(processWhere).length) instanceWhere.process = processWhere;
    where.instance = instanceWhere;
    const search = f.search?.trim();
    if (search) {
      and.push({
        OR: [
          { step: { title: { contains: search, mode: 'insensitive' } } },
          { instance: { code: { contains: search, mode: 'insensitive' } } },
          { instance: { title: { contains: search, mode: 'insensitive' } } },
          { instance: { process: { title: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    const rows = await this.prisma.read.stepProgress.findMany({
      where,
      select: TASK_SELECT,
      orderBy: [{ slaDeadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: MAX_ITEMS + 1,
    });
    if (rows.length === 0) return [];

    const instanceIds = [...new Set(rows.map(r => r.instanceId))];
    const [siblings, approvals] = await Promise.all([
      this.prisma.read.stepProgress.findMany({
        where: { instanceId: { in: instanceIds } },
        select: {
          instanceId: true,
          stepOrder: true,
          status: true,
          completedAt: true,
          step: { select: { title: true, order: true, parallel: true, dependsOnOrders: true } },
        },
      }),
      this.prisma.read.processApproval.findMany({
        where: {
          instanceId: { in: instanceIds },
          status: { in: OPEN_APPROVAL },
          dueAt: { not: null },
        },
        select: { instanceId: true, stepId: true, dueAt: true },
      }),
    ]);
    const sibByInstance = new Map<number, typeof siblings>();
    for (const s of siblings)
      sibByInstance.set(s.instanceId, [...(sibByInstance.get(s.instanceId) ?? []), s]);
    const approvalDue = new Map<string, Date>();
    for (const a of approvals) {
      const k = `${a.instanceId}|${a.stepId}`;
      const cur = approvalDue.get(k);
      if (a.dueAt && (!cur || a.dueAt < cur)) approvalDue.set(k, a.dueAt);
    }

    return rows.map(r => {
      const sibs = sibByInstance.get(r.instanceId) ?? [];
      const deps = effectiveDependencies(sibs.map(s => s.step)).get(r.step.order) ?? [];
      const depRows = sibs.filter(s => deps.includes(s.stepOrder));
      const latestDepDone = depRows
        .map(d => d.completedAt)
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const startAt = r.startedAt ?? r.assignedAt ?? latestDepDone ?? r.instance.startedAt;
      const assignee = r.assignee ?? r.step.responsible ?? null;
      return {
        key: `T${r.instanceId}-${r.stepId}`,
        kind: 'TASK' as const,
        instanceId: r.instanceId,
        stepId: r.stepId,
        code: formatTaskCode(r.instance.code, r.instance.id, r.step.order),
        title: r.step.title,
        processTitle: r.instance.title ?? r.instance.process.title,
        processCode: r.instance.code ?? `PROC-${r.instance.id}`,
        assignee,
        department: r.instance.process.department,
        startAt,
        dueAt: r.slaDeadline,
        durationHours: plannedDurationHours(
          r.step.estimatedMinutes,
          r.step.slaHours,
          startAt,
          r.slaDeadline,
        ),
        status: r.status,
        priority: r.instance.priority,
        dependencies: depRows.map(d => ({
          order: d.stepOrder,
          title: d.step.title,
          status: d.status,
          done: isDoneStatus(d.status),
        })),
        approvalDueAt: approvalDue.get(`${r.instanceId}|${r.stepId}`) ?? null,
        completedAt: r.completedAt,
      };
    });
  }

  private async processItems(
    f: CalendarFilterDto,
    user: CurrentUserData,
    scope: 'mine' | 'all',
    from: Date,
    to: Date,
  ): Promise<CalendarItem[]> {
    // Filtros específicos de tarefa (instância/estado de etapa) não se aplicam aos processos.
    if (f.instanceId) return [];
    const and: Prisma.ProcessInstanceWhereInput[] = [
      {
        OR: [{ slaDeadline: { gte: from, lte: to } }, { completedAt: { gte: from, lte: to } }],
      },
    ];
    const where: Prisma.ProcessInstanceWhereInput = { AND: and, archivedAt: null };
    if (f.priority) where.priority = f.priority;
    if (f.status) {
      if (!['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD'].includes(f.status)) return [];
      where.status = f.status as InstanceStatus;
    }
    if (f.overdue) {
      where.status = 'IN_PROGRESS';
      where.slaDeadline = { lt: new Date() };
    }
    const processWhere: Prisma.ProcessStandardWhereInput = {};
    if (f.departmentId) processWhere.departmentId = f.departmentId;
    if (f.unitId) processWhere.department = { unitId: f.unitId };
    if (Object.keys(processWhere).length) where.process = processWhere;
    if (f.responsibleId) where.currentResponsibleId = f.responsibleId;
    const search = f.search?.trim();
    if (search) {
      and.push({
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { process: { title: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    if (scope === 'mine') {
      and.push({
        OR: [
          { initiatedById: user.id },
          { targetUserId: user.id },
          { currentResponsibleId: user.id },
          { stepProgress: { some: { OR: [{ assigneeId: user.id }, { reviewerId: user.id }] } } },
        ],
      });
    }

    const rows = await this.prisma.read.processInstance.findMany({
      where,
      select: INSTANCE_SELECT,
      orderBy: [{ slaDeadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: MAX_ITEMS + 1,
    });
    return rows.map(r => ({
      key: `P${r.id}`,
      kind: 'PROCESS' as const,
      instanceId: r.id,
      stepId: null,
      code: r.code ?? `PROC-${r.id}`,
      title: r.title ?? r.process.title,
      processTitle: r.process.title,
      processCode: r.process.code,
      assignee: r.currentResponsible,
      department: r.process.department,
      startAt: r.startedAt,
      dueAt: r.slaDeadline,
      durationHours: plannedDurationHours(null, null, r.startedAt, r.slaDeadline),
      status: r.status,
      priority: r.priority,
      dependencies: [],
      approvalDueAt: null,
      completedAt: r.completedAt,
    }));
  }

  private toView(it: CalendarItem, now: Date) {
    return { ...it, ...classifyDue(it, now) };
  }

  async calendar(filters: CalendarFilterDto, user: CurrentUserData) {
    const now = new Date();
    const { items, from, to, scope, truncated } = await this.collectItems(filters, user, now);
    const views = items.map(i => this.toView(i, now));
    const conflicts = detectAssignmentConflicts(items);
    const conflictKeys = new Set(conflicts.flatMap(c => c.itemKeys));
    return {
      range: { from, to },
      scope,
      truncated,
      data: views.map(v => ({ ...v, hasConflict: conflictKeys.has(v.key) })),
      conflicts,
      summary: {
        total: views.length,
        overdue: views.filter(v => v.isOverdue).length,
        dueSoon: views.filter(v => v.isDueSoon).length,
        conflicts: conflicts.length,
      },
    };
  }

  async exportIcs(filters: CalendarFilterDto, user: CurrentUserData) {
    const { items } = await this.collectItems(filters, user);
    return buildIcs(items);
  }

  // ─── Reagendamento ────────────────────────────────────────────────────────

  async reschedule(instanceId: number, stepId: number, user: CurrentUserData, dto: RescheduleDto) {
    const t = await this.prisma.stepProgress.findUnique({
      where: { instanceId_stepId: { instanceId, stepId } },
      select: {
        id: true,
        status: true,
        startedAt: true,
        slaDeadline: true,
        assigneeId: true,
        step: { select: { title: true, responsibleId: true } },
        instance: {
          select: {
            id: true,
            code: true,
            status: true,
            slaDeadline: true,
            initiatedById: true,
            process: { select: { id: true, ownerId: true } },
          },
        },
      },
    });
    if (!t) throw new NotFoundException('Tarefa não encontrada');
    const uid = String(user.id);
    const allowed =
      this.isManager(user) ||
      String(t.instance.process.ownerId) === uid ||
      String(t.instance.initiatedById) === uid;
    // 404 para não revelar a existência de tarefas alheias.
    if (!allowed) throw new NotFoundException('Tarefa não encontrada');

    if (!['IN_PROGRESS', 'ON_HOLD'].includes(t.instance.status)) {
      throw new BadRequestException('Só é possível reagendar tarefas de processos em curso');
    }
    if (['COMPLETED', 'CANCELLED', 'SKIPPED', 'REJECTED'].includes(t.status)) {
      throw new BadRequestException(`Tarefa em estado ${t.status} não pode ser reagendada`);
    }
    const next = new Date(dto.dueAt);
    if (Number.isNaN(next.getTime())) throw new BadRequestException('Prazo inválido');
    if (t.startedAt && next < t.startedAt) {
      throw new BadRequestException('O novo prazo não pode ser anterior ao início da tarefa');
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('A alteração do prazo exige uma justificação');
    if (t.slaDeadline && t.slaDeadline.getTime() === next.getTime()) {
      throw new BadRequestException('O novo prazo é igual ao actual');
    }

    await this.prisma.stepProgress.update({ where: { id: t.id }, data: { slaDeadline: next } });
    await this.processes.writeAuditLog({
      instanceId,
      processId: t.instance.process.id,
      userId: user.id,
      action: 'STEP_DEADLINE_CHANGED',
      meta: { stepId, previousDueAt: t.slaDeadline, newDueAt: next, reason },
    });
    const label = `"${t.step.title}" (${t.instance.code ?? `#${instanceId}`})`;
    const assignee = t.assigneeId ?? t.step.responsibleId;
    if (assignee && assignee !== user.id) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: assignee,
        type: 'PROCESS_TASK_RESCHEDULED',
        message: `O prazo da tarefa ${label} foi alterado: ${reason}`,
      });
    }
    return {
      instanceId,
      stepId,
      previousDueAt: t.slaDeadline,
      dueAt: next,
      exceedsProcessDeadline: !!t.instance.slaDeadline && next > t.instance.slaDeadline,
    };
  }

  /** Histórico de alterações de prazo (anterior, novo, autor, justificação). */
  async deadlineHistory(instanceId: number, stepId: number | null, user: CurrentUserData) {
    const inst = await this.prisma.read.processInstance.findUnique({
      where: { id: instanceId },
      select: {
        initiatedById: true,
        targetUserId: true,
        currentResponsibleId: true,
        process: { select: { ownerId: true } },
        stepProgress: { select: { assigneeId: true, reviewerId: true } },
      },
    });
    if (!inst) throw new NotFoundException('Processo não encontrado');
    const uid = String(user.id);
    const visible =
      this.isManager(user) ||
      [inst.initiatedById, inst.targetUserId, inst.currentResponsibleId, inst.process.ownerId].some(
        v => v != null && String(v) === uid,
      ) ||
      inst.stepProgress.some(s => String(s.assigneeId) === uid || String(s.reviewerId) === uid);
    if (!visible) throw new NotFoundException('Processo não encontrado');

    const logs = await this.prisma.read.processAuditLog.findMany({
      where: {
        instanceId,
        action: { in: ['STEP_DEADLINE_CHANGED', 'INSTANCE_UPDATED'] },
        meta: { contains: 'newDueAt' },
      },
      include: { user: user3 },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return logs
      .map(l => ({ log: l, meta: parseMeta(l.meta) }))
      .filter(({ log, meta }) =>
        stepId == null
          ? log.action === 'INSTANCE_UPDATED'
          : log.action === 'STEP_DEADLINE_CHANGED' && meta.stepId === stepId,
      )
      .map(({ log, meta }) => ({
        id: log.id,
        at: log.createdAt,
        author: log.user,
        previousDueAt: (meta.previousDueAt as string | null) ?? null,
        newDueAt: (meta.newDueAt as string | null) ?? null,
        reason: (meta.reason as string | null) ?? null,
      }));
  }
}
