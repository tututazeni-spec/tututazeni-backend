// src/process-standard/process-instances.service.ts
// Aba "Todos os Processos" (docs/Modulo_Processes.md §4): lista centralizada
// das instâncias de processo com campos derivados (progresso, tempo decorrido,
// situação do prazo), filtros completos e as acções de gestão (editar,
// reatribuir, prioridade, suspender/retomar, duplicar, arquivar, histórico,
// exportar). Nunca altera etapas já concluídas nem apaga histórico.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { ProcessStandardService } from './process-standard.service';
import { syncStepActivation } from './process-activation';
import { deriveInstanceMetrics, isActiveStatus } from './process-workflow';
import {
  AssignInstanceDto,
  ChangePriorityDto,
  ProcessInstanceFilterDto,
  UpdateInstanceDto,
} from './process-standard.dto';

const MANAGE_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR];
const ACTIVE_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'] as const;
const DUE_SOON_MS = 48 * 3_600_000;
const EXPORT_LIMIT = 5000;

const LIST_INCLUDE = {
  process: {
    select: {
      id: true,
      code: true,
      title: true,
      category: true,
      riskLevel: true,
      department: {
        select: { id: true, name: true, unit: { select: { id: true, name: true } } },
      },
    },
  },
  initiatedBy: { select: { id: true, fullName: true } },
  targetUser: { select: { id: true, fullName: true } },
  currentResponsible: { select: { id: true, fullName: true } },
  stepProgress: {
    orderBy: { stepOrder: 'asc' },
    select: {
      status: true,
      stepOrder: true,
      step: { select: { title: true, type: true } },
    },
  },
} satisfies Prisma.ProcessInstanceInclude;

type InstanceRow = Prisma.ProcessInstanceGetPayload<{ include: typeof LIST_INCLUDE }>;

@Injectable()
export class ProcessInstancesService {
  private readonly logger = new Logger(ProcessInstancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processes: ProcessStandardService,
  ) {}

  // ─── Mapeamento ───────────────────────────────────────────────────────────

  private toRow(inst: InstanceRow, now = new Date()) {
    const metrics = deriveInstanceMetrics(inst, inst.stepProgress, now);
    const current = inst.stepProgress.find(sp => isActiveStatus(sp.status));
    return {
      id: inst.id,
      code: inst.code ?? `PROC-${inst.id}`,
      name: inst.title ?? inst.process.title,
      description: inst.description,
      type: inst.process.category,
      template: {
        id: inst.process.id,
        code: inst.process.code,
        title: inst.process.title,
        version: inst.processVersion,
      },
      sourceModule: inst.sourceModule,
      entity: { type: inst.sourceEntityType, id: inst.sourceEntityId, target: inst.targetUser },
      unit: inst.process.department?.unit ?? null,
      department: inst.process.department
        ? { id: inst.process.department.id, name: inst.process.department.name }
        : null,
      requester: inst.initiatedBy,
      currentResponsible: inst.currentResponsible,
      currentStep: current ? { title: current.step.title, type: current.step.type } : null,
      priority: inst.priority,
      status: inst.status,
      archived: inst.archivedAt != null,
      progress: metrics.progress,
      createdAt: inst.startedAt,
      startedAt: inst.startedAt,
      dueAt: inst.slaDeadline,
      updatedAt: inst.updatedAt,
      completedAt: inst.completedAt,
      elapsedHours: metrics.elapsedHours,
      remainingHours: metrics.remainingHours,
      deadlineSituation: metrics.deadlineSituation,
    };
  }

  private isManager(user: CurrentUserData) {
    return isPrivileged(user, MANAGE_ROLES);
  }

  private async findForAccess(id: number) {
    const inst = await this.prisma.read.processInstance.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        initiatedById: true,
        targetUserId: true,
        currentResponsibleId: true,
        slaDeadline: true,
        suspendedAt: true,
        archivedAt: true,
        processId: true,
        stepProgress: { select: { assigneeId: true, reviewerId: true } },
      },
    });
    if (!inst) throw new NotFoundException('Instância não encontrada');
    return inst;
  }

  private isParticipant(
    user: CurrentUserData,
    inst: Awaited<ReturnType<ProcessInstancesService['findForAccess']>>,
  ) {
    const uid = String(user.id);
    return (
      [inst.initiatedById, inst.targetUserId, inst.currentResponsibleId].some(
        v => v != null && String(v) === uid,
      ) ||
      inst.stepProgress.some(sp => String(sp.assigneeId) === uid || String(sp.reviewerId) === uid)
    );
  }

  private assertManager(user: CurrentUserData) {
    if (!this.isManager(user)) {
      throw new ForbiddenException('Sem permissão para gerir processos');
    }
  }

  // ─── Listagem ─────────────────────────────────────────────────────────────

  private buildWhere(
    f: ProcessInstanceFilterDto,
    user: CurrentUserData,
    now = new Date(),
  ): Prisma.ProcessInstanceWhereInput {
    const and: Prisma.ProcessInstanceWhereInput[] = [];
    const where: Prisma.ProcessInstanceWhereInput = { AND: and };

    if (f.status) where.status = f.status;
    if (f.priority) where.priority = f.priority;
    if (f.sourceModule) where.sourceModule = f.sourceModule;
    if (f.requesterId) where.initiatedById = f.requesterId;
    if (f.templateId) where.processId = f.templateId;
    where.archivedAt = f.archived ? { not: null } : null;

    const processWhere: Prisma.ProcessStandardWhereInput = {};
    if (f.departmentId) processWhere.departmentId = f.departmentId;
    if (f.unitId) processWhere.department = { unitId: f.unitId };
    if (f.category) processWhere.category = f.category;
    if (Object.keys(processWhere).length) where.process = processWhere;

    if (f.responsibleId) {
      and.push({
        OR: [
          { currentResponsibleId: f.responsibleId },
          {
            stepProgress: {
              some: { assigneeId: f.responsibleId, status: { in: [...ACTIVE_TASK_STATUSES] } },
            },
          },
        ],
      });
    }

    const endOfDay = (v: string) => {
      const d = new Date(v);
      if (!v.includes('T')) d.setUTCHours(23, 59, 59, 999);
      return d;
    };
    if (f.createdFrom || f.createdTo) {
      where.startedAt = {
        ...(f.createdFrom ? { gte: new Date(f.createdFrom) } : {}),
        ...(f.createdTo ? { lte: endOfDay(f.createdTo) } : {}),
      };
    }
    const due: Prisma.DateTimeNullableFilter = {};
    if (f.dueFrom) due.gte = new Date(f.dueFrom);
    if (f.dueTo) due.lte = endOfDay(f.dueTo);
    if (f.deadline === 'overdue') {
      where.status = 'IN_PROGRESS';
      due.lt = now;
    } else if (f.deadline === 'due_soon') {
      where.status = 'IN_PROGRESS';
      due.gte = now;
      due.lte = new Date(now.getTime() + DUE_SOON_MS);
    }
    if (Object.keys(due).length) where.slaDeadline = due;

    const search = f.search?.trim();
    if (search) {
      and.push({
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { process: { title: { contains: search, mode: 'insensitive' } } },
          { process: { code: { contains: search, mode: 'insensitive' } } },
          { sourceEntityId: { contains: search, mode: 'insensitive' } },
          { sourceEntityType: { contains: search, mode: 'insensitive' } },
          { targetUser: { fullName: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    // Âmbito (§20): quem não gere processos só vê os seus.
    if (!this.isManager(user)) {
      and.push({
        OR: [
          { initiatedById: user.id },
          { targetUserId: user.id },
          { currentResponsibleId: user.id },
          { stepProgress: { some: { OR: [{ assigneeId: user.id }, { reviewerId: user.id }] } } },
        ],
      });
    }
    return where;
  }

  async list(filters: ProcessInstanceFilterDto, user: CurrentUserData) {
    const { page = 1, limit = 20 } = filters;
    const where = this.buildWhere(filters, user);

    const [rows, total] = await Promise.all([
      this.prisma.read.processInstance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: LIST_INCLUDE,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.read.processInstance.count({ where }),
    ]);

    const now = new Date();
    return {
      data: rows.map(r => this.toRow(r, now)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Opções dos filtros (módulos de origem, tipos, modelos, pessoas, unidades). */
  async filterOptions(user: CurrentUserData) {
    const scope = this.buildWhere({}, user);
    const [modules, categories, templates, departments, units] = await Promise.all([
      this.prisma.read.processInstance.findMany({
        where: { ...scope, sourceModule: { not: null } },
        distinct: ['sourceModule'],
        select: { sourceModule: true },
      }),
      this.prisma.read.processStandard.findMany({
        where: { category: { not: null } },
        distinct: ['category'],
        select: { category: true },
      }),
      this.prisma.read.processStandard.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, code: true, title: true },
        orderBy: { title: 'asc' },
      }),
      this.prisma.read.department.findMany({
        where: { processStandards: { some: {} } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.unit.findMany({
        where: { departments: { some: { processStandards: { some: {} } } } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      sourceModules: modules.map(m => m.sourceModule).filter((m): m is string => !!m),
      categories: categories.map(c => c.category).filter((c): c is string => !!c),
      templates,
      departments,
      units,
    };
  }

  async exportCsv(filters: ProcessInstanceFilterDto, user: CurrentUserData) {
    const rows = await this.prisma.read.processInstance.findMany({
      where: this.buildWhere(filters, user),
      take: EXPORT_LIMIT,
      include: LIST_INCLUDE,
      orderBy: { startedAt: 'desc' },
    });
    const now = new Date();
    const header = [
      'Código',
      'Nome',
      'Tipo',
      'Modelo',
      'Módulo de origem',
      'Entidade',
      'Unidade',
      'Departamento',
      'Solicitante',
      'Responsável actual',
      'Prioridade',
      'Estado',
      'Progresso (%)',
      'Início',
      'Prazo final',
      'Última actualização',
      'Tempo decorrido (h)',
      'Tempo restante (h)',
      'Situação do prazo',
    ];
    const esc = (v: unknown) => {
      let t = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
      // Evita injecção de fórmulas ao abrir no Excel.
      if (/^[=+\-@]/.test(t)) t = `'${t}`;
      return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = rows.map(r => {
      const x = this.toRow(r, now);
      return [
        x.code,
        x.name,
        x.type,
        x.template.code,
        x.sourceModule,
        [x.entity.type, x.entity.id].filter(Boolean).join(' '),
        x.unit?.name,
        x.department?.name,
        x.requester.fullName,
        x.currentResponsible?.fullName,
        x.priority,
        x.status,
        x.progress,
        x.startedAt,
        x.dueAt,
        x.updatedAt,
        x.elapsedHours,
        x.remainingHours,
        x.deadlineSituation,
      ]
        .map(esc)
        .join(',');
    });
    return { csv: '﻿' + [header.map(esc).join(','), ...lines].join('\r\n'), count: rows.length };
  }

  // ─── Criar (Novo Processo) ────────────────────────────────────────────────
  // Delegado em startInstance (valida modelo activo, acesso, duplicados).

  // ─── Acções ───────────────────────────────────────────────────────────────

  async update(id: number, dto: UpdateInstanceDto, user: CurrentUserData) {
    const inst = await this.findForAccess(id);
    if (!this.isManager(user) && String(user.id) !== String(inst.initiatedById)) {
      throw new NotFoundException('Instância não encontrada');
    }
    if (!['IN_PROGRESS', 'ON_HOLD'].includes(inst.status)) {
      throw new BadRequestException('Só processos em execução ou suspensos podem ser editados');
    }

    const data: Prisma.ProcessInstanceUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.notes !== undefined) data.notes = dto.notes;
    const meta: Record<string, unknown> = { fields: Object.keys(dto).filter(k => k !== 'reason') };
    if (dto.dueAt !== undefined) {
      if (!dto.reason?.trim()) {
        throw new BadRequestException('A alteração do prazo exige uma justificação');
      }
      data.slaDeadline = new Date(dto.dueAt);
      meta.previousDueAt = inst.slaDeadline;
      meta.newDueAt = data.slaDeadline;
      meta.reason = dto.reason.trim();
    }

    const updated = await this.prisma.processInstance.update({
      where: { id },
      data,
      include: LIST_INCLUDE,
    });
    await this.processes.writeAuditLog({
      instanceId: id,
      processId: inst.processId,
      userId: user.id,
      action: 'INSTANCE_UPDATED',
      meta,
    });
    return this.toRow(updated);
  }

  async assign(id: number, dto: AssignInstanceDto, user: CurrentUserData) {
    this.assertManager(user);
    const inst = await this.findForAccess(id);
    if (!['IN_PROGRESS', 'ON_HOLD'].includes(inst.status)) {
      throw new BadRequestException('Só processos em execução ou suspensos podem ser reatribuídos');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: dto.responsibleId },
      select: { id: true, active: true },
    });
    if (!target || !target.active) throw new NotFoundException('Utilizador não encontrado');

    const previous = inst.currentResponsibleId;
    await this.prisma.stepProgress.updateMany({
      where: { instanceId: id, status: { in: [...ACTIVE_TASK_STATUSES] } },
      data: { assigneeId: dto.responsibleId, assignedAt: new Date() },
    });
    await this.prisma.processInstance.update({
      where: { id },
      data: { currentResponsibleId: dto.responsibleId },
    });
    await this.processes.writeAuditLog({
      instanceId: id,
      processId: inst.processId,
      userId: user.id,
      action: 'INSTANCE_REASSIGNED',
      meta: { from: previous, to: dto.responsibleId, reason: dto.reason },
    });
    if (dto.responsibleId !== user.id) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: dto.responsibleId,
        type: 'PROCESS_TASK_ASSIGNED',
        message: `Passou a ser o responsável pelo processo ${inst.code ?? `#${id}`}`,
      });
    }
    return this.getRow(id);
  }

  async changePriority(id: number, dto: ChangePriorityDto, user: CurrentUserData) {
    this.assertManager(user);
    const inst = await this.findForAccess(id);
    const before = await this.prisma.processInstance.findUnique({
      where: { id },
      select: { priority: true },
    });
    await this.prisma.processInstance.update({ where: { id }, data: { priority: dto.priority } });
    await this.processes.writeAuditLog({
      instanceId: id,
      processId: inst.processId,
      userId: user.id,
      action: 'INSTANCE_PRIORITY_CHANGED',
      meta: { from: before?.priority, to: dto.priority },
    });
    return this.getRow(id);
  }

  async suspend(id: number, user: CurrentUserData, reason?: string) {
    this.assertManager(user);
    const inst = await this.findForAccess(id);
    if (inst.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Só processos em execução podem ser suspensos');
    }
    await this.prisma.processInstance.update({
      where: { id },
      data: { status: 'ON_HOLD', suspendedAt: new Date() },
    });
    await this.processes.writeAuditLog({
      instanceId: id,
      processId: inst.processId,
      userId: user.id,
      action: 'INSTANCE_SUSPENDED',
      meta: { reason },
    });
    return this.getRow(id);
  }

  async resume(id: number, user: CurrentUserData, reason?: string) {
    this.assertManager(user);
    const inst = await this.findForAccess(id);
    if (inst.status !== 'ON_HOLD') {
      throw new BadRequestException('Só processos suspensos podem ser retomados');
    }
    const now = new Date();
    // O tempo em suspensão não conta para o prazo: o prazo desloca-se outro tanto.
    const shiftedDeadline =
      inst.suspendedAt && inst.slaDeadline
        ? new Date(inst.slaDeadline.getTime() + (now.getTime() - inst.suspendedAt.getTime()))
        : inst.slaDeadline;
    await this.prisma.processInstance.update({
      where: { id },
      data: { status: 'IN_PROGRESS', suspendedAt: null, slaDeadline: shiftedDeadline },
    });
    // Etapas rejeitadas (que colocaram o processo em espera) voltam a ser trabalháveis.
    const reopened = await this.prisma.stepProgress.updateMany({
      where: { instanceId: id, status: 'REJECTED' },
      data: {
        status: 'PENDING',
        startedAt: now,
        completedAt: null,
        completedById: null,
        returnCount: { increment: 1 },
        returnReason: reason ?? 'Processo retomado após rejeição',
      },
    });
    await syncStepActivation(this.prisma, id);
    await this.processes.writeAuditLog({
      instanceId: id,
      processId: inst.processId,
      userId: user.id,
      action: 'INSTANCE_RESUMED',
      meta: { reason, reopenedSteps: reopened.count, newDueAt: shiftedDeadline },
    });
    return this.getRow(id);
  }

  /** "Duplicar a partir de um modelo": nova instância do mesmo modelo, com os mesmos dados de abertura. */
  async duplicate(id: number, user: CurrentUserData) {
    this.assertManager(user);
    const src = await this.prisma.read.processInstance.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('Instância não encontrada');

    // Sem a referência de origem: seria bloqueado pela regra anti-duplicados.
    const created = await this.processes.startInstance(
      src.processId,
      user.id,
      {
        targetUserId: src.targetUserId,
        title: src.title ?? undefined,
        description: src.description ?? undefined,
        priority: src.priority,
        notes: src.notes ?? undefined,
        sourceModule: src.sourceModule ?? undefined,
      },
      user,
    );
    await this.processes.writeAuditLog({
      instanceId: created.id,
      processId: src.processId,
      userId: user.id,
      action: 'INSTANCE_DUPLICATED',
      meta: { from: src.id, fromCode: src.code },
    });
    return created;
  }

  async archive(id: number, user: CurrentUserData) {
    this.assertManager(user);
    const inst = await this.findForAccess(id);
    if (!['COMPLETED', 'CANCELLED'].includes(inst.status)) {
      throw new BadRequestException('Só processos concluídos ou cancelados podem ser arquivados');
    }
    if (inst.archivedAt) return this.getRow(id);
    await this.prisma.processInstance.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.processes.writeAuditLog({
      instanceId: id,
      processId: inst.processId,
      userId: user.id,
      action: 'INSTANCE_ARCHIVED',
    });
    return this.getRow(id);
  }

  async history(id: number, user: CurrentUserData, page = 1, limit = 50) {
    const inst = await this.findForAccess(id);
    if (!this.isManager(user) && !this.isParticipant(user, inst)) {
      throw new NotFoundException('Instância não encontrada');
    }
    const where: Prisma.ProcessAuditLogWhereInput = { instanceId: id };
    const [data, total] = await Promise.all([
      this.prisma.read.processAuditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.processAuditLog.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  private async getRow(id: number) {
    const row = await this.prisma.processInstance.findUnique({
      where: { id },
      include: LIST_INCLUDE,
    });
    if (!row) throw new NotFoundException('Instância não encontrada');
    return this.toRow(row);
  }
}
