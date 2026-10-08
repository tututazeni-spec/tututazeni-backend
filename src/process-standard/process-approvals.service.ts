// src/process-standard/process-approvals.service.ts
// Aba «Aprovações» (docs/Modulo_Processes.md §7): centraliza as decisões das
// etapas de aprovação dos processos. As aprovações são geradas pelo motor
// (ProcessEngineService.ensureApprovals) quando uma etapa REVIEW fica activa;
// aqui listam-se, consultam-se e decidem-se — aprovar, rejeitar, devolver,
// pedir informação, delegar e escalar — com validação de autorização,
// segregação de funções e registo da versão dos dados analisados.
//
// A decisão (aprovar) conclui a etapa de aprovação e desbloqueia as seguintes;
// NÃO conclui a execução operacional posterior (regra 4 do §7).
import { recordAssignment } from './process-assignments';
import { approvalState } from './process-states';
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
import { inDepartmentScope, instanceScopeWhere } from './process-scope';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { TriggerType } from '../automation/automation.dto';
import { writeProcessAuditLog } from './process-audit';
import {
  OPEN_APPROVAL_STATUSES,
  ProcessEngineService,
  type EngineInstance,
} from './process-engine.service';
import { effectiveDependencies } from './process-workflow';
import { ApprovalFilterDto, DecideApprovalDto, RespondApprovalDto } from './process-standard.dto';

const VIEW_ALL_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR, Role.AUDITOR];
const ADMIN_ROLES = [Role.ADMIN, Role.RH];
const DECIDABLE = ['PENDING', 'ESCALATED'];
const user2 = { select: { id: true, fullName: true } } as const;

const APPROVAL_INCLUDE = {
  requester: user2,
  approver: user2,
  instance: {
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      sourceModule: true,
      sourceEntityType: true,
      sourceEntityId: true,
      initiatedById: true,
      targetUserId: true,
      department: { select: { id: true, parentId: true } },
      processVersion: true,
      process: { select: { id: true, code: true, title: true } },
      targetUser: user2,
    },
  },
  step: { include: { step: true } },
} satisfies Prisma.ProcessApprovalInclude;

type ApprovalRow = Prisma.ProcessApprovalGetPayload<{ include: typeof APPROVAL_INCLUDE }>;

@Injectable()
export class ProcessApprovalsService {
  private readonly logger = new Logger(ProcessApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProcessEngineService,
  ) {}

  // ─── Permissões ───────────────────────────────────────────────────────────

  private canViewAll(user: CurrentUserData) {
    return isPrivileged(user, VIEW_ALL_ROLES);
  }

  private isAdmin(user: CurrentUserData) {
    return isPrivileged(user, ADMIN_ROLES);
  }

  private canView(user: CurrentUserData, a: ApprovalRow) {
    const uid = user.id;
    return (
      // §20: o GESTOR vê as aprovações do seu departamento; ADMIN/RH/AUDITOR todas.
      (this.canViewAll(user) && inDepartmentScope(user, a.instance.department)) ||
      a.approverId === uid ||
      a.requesterId === uid ||
      a.previousApproverId === uid ||
      a.instance.targetUserId === uid ||
      a.executorId === uid
    );
  }

  /** O próprio pedido nunca pode ser decidido por quem o fez ou por quem é o alvo. */
  private isSegregated(user: CurrentUserData, a: ApprovalRow) {
    return user.id === a.instance.initiatedById || user.id === a.instance.targetUserId;
  }

  private isDesignatedApprover(user: CurrentUserData, a: ApprovalRow) {
    return a.approverId === user.id || (a.approverId == null && this.isAdmin(user));
  }

  private isLive(a: ApprovalRow) {
    return (
      a.instance.status === 'IN_PROGRESS' &&
      ['PENDING', 'IN_PROGRESS', 'ESCALATED'].includes(a.step.status)
    );
  }

  private permissions(user: CurrentUserData, a: ApprovalRow) {
    const live = this.isLive(a);
    const designated = this.isDesignatedApprover(user, a);
    const segregated = this.isSegregated(user, a);
    const canDecide = live && DECIDABLE.includes(a.status) && designated && !segregated;
    return {
      canDecide,
      canDelegate:
        live &&
        DECIDABLE.includes(a.status) &&
        ((designated && a.step.step.allowDelegation) || this.isAdmin(user)),
      canEscalate: live && DECIDABLE.includes(a.status) && (designated || this.isAdmin(user)),
      canRespond:
        live &&
        a.status === 'INFO_REQUESTED' &&
        (a.requesterId === user.id || a.instance.targetUserId === user.id || this.canViewAll(user)),
      segregated,
    };
  }

  // ─── Leitura ──────────────────────────────────────────────────────────────

  private isOverdue(a: { dueAt: Date | null; status: string }) {
    return (
      !!a.dueAt &&
      a.dueAt < new Date() &&
      (OPEN_APPROVAL_STATUSES as readonly string[]).includes(a.status)
    );
  }

  private toView(a: ApprovalRow, nextTitles: string[], user: CurrentUserData) {
    return {
      id: a.id,
      code: a.code,
      process: a.instance.process,
      instance: {
        id: a.instance.id,
        code: a.instance.code,
        title: a.instance.title ?? a.instance.process.title,
        priority: a.instance.priority,
        status: a.instance.status,
      },
      step: {
        id: a.stepId,
        order: a.step.stepOrder,
        title: a.step.step.title,
        type: a.step.step.type,
      },
      sourceModule: a.instance.sourceModule,
      entity: {
        type: a.instance.sourceEntityType,
        id: a.instance.sourceEntityId,
        target: a.instance.targetUser,
      },
      requester: a.requester,
      approver: a.approver,
      approverRole: a.approverRole,
      level: a.level,
      escalationLevel: a.escalationLevel,
      round: a.round,
      sequence: a.sequence,
      mode: a.mode,
      status: a.status,
      // §18: estado canónico; a delegação é informação à parte, não um estado.
      standardStatus: approvalState(a).state,
      delegated: approvalState(a).delegated,
      submittedAt: a.submittedAt,
      dueAt: a.dueAt,
      isOverdue: this.isOverdue(a),
      requesterComment: a.requesterComment,
      documentIds: a.documentIds,
      dataVersion: a.dataVersion,
      decidedVersion: a.decidedVersion,
      decision: a.decision,
      justification: a.justification,
      decidedAt: a.decidedAt,
      decidedById: a.decidedById,
      nextSteps: nextTitles,
      executorId: a.executorId,
      permissions: this.permissions(user, a),
    };
  }

  private async nextStepTitles(rows: ApprovalRow[]) {
    const wanted = rows.filter(r => r.nextStepOrders.length > 0);
    const out = new Map<number, string[]>();
    if (wanted.length === 0) return out;
    const steps = await this.prisma.read.stepProgress.findMany({
      where: { instanceId: { in: [...new Set(wanted.map(r => r.instanceId))] } },
      select: { instanceId: true, stepOrder: true, step: { select: { title: true } } },
    });
    for (const r of wanted) {
      out.set(
        r.id,
        steps
          .filter(s => s.instanceId === r.instanceId && r.nextStepOrders.includes(s.stepOrder))
          .map(s => s.step.title),
      );
    }
    return out;
  }

  private buildWhere(
    filters: ApprovalFilterDto,
    user: CurrentUserData,
  ): Prisma.ProcessApprovalWhereInput {
    const and: Prisma.ProcessApprovalWhereInput[] = [];
    const wantsAll = filters.scope === 'all';
    if (wantsAll && !this.canViewAll(user)) {
      throw new ForbiddenException('O âmbito "todas" exige perfil de gestão');
    }
    if (filters.scope === 'requested') {
      and.push({ requesterId: user.id });
    } else if (!wantsAll) {
      and.push({ approverId: user.id });
    } else {
      const scoped = instanceScopeWhere(user);
      if (Object.keys(scoped).length) and.push({ instance: scoped });
    }

    const status = filters.status;
    if (status === 'open') and.push({ status: { in: [...OPEN_APPROVAL_STATUSES] } });
    else if (status === 'decided') {
      and.push({ status: { in: ['APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'] } });
    } else if (status) and.push({ status });

    if (filters.sourceModule) and.push({ instance: { sourceModule: filters.sourceModule } });
    if (filters.processId) and.push({ instance: { processId: filters.processId } });
    if (filters.instanceId) and.push({ instanceId: filters.instanceId });
    if (filters.overdue) {
      and.push({ dueAt: { lt: new Date() }, status: { in: [...OPEN_APPROVAL_STATUSES] } });
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      and.push({
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { instance: { code: { contains: q, mode: 'insensitive' } } },
          { instance: { title: { contains: q, mode: 'insensitive' } } },
          { instance: { process: { title: { contains: q, mode: 'insensitive' } } } },
          { step: { step: { title: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  async list(filters: ApprovalFilterDto, user: CurrentUserData) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where = this.buildWhere(filters, user);
    const [rows, total] = await Promise.all([
      this.prisma.read.processApproval.findMany({
        where,
        include: APPROVAL_INCLUDE,
        orderBy: [{ submittedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.read.processApproval.count({ where }),
    ]);
    const next = await this.nextStepTitles(rows);
    const kpis = await this.kpis(filters, user);
    return {
      data: rows.map(r => this.toView(r, next.get(r.id) ?? [], user)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      scope: filters.scope ?? 'mine',
      kpis,
    };
  }

  /** Indicadores sobre o mesmo âmbito da lista (sem filtros de estado/pesquisa). */
  private async kpis(filters: ApprovalFilterDto, user: CurrentUserData) {
    const scoped = this.buildWhere({ scope: filters.scope }, user);
    const open = { status: { in: [...OPEN_APPROVAL_STATUSES] } };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const [pending, overdue, decidedToday, recent] = await Promise.all([
      this.prisma.read.processApproval.count({ where: { AND: [scoped, open] } }),
      this.prisma.read.processApproval.count({
        where: { AND: [scoped, open, { dueAt: { lt: new Date() } }] },
      }),
      this.prisma.read.processApproval.count({
        where: { AND: [scoped, { decidedAt: { gte: startOfDay } }] },
      }),
      this.prisma.read.processApproval.findMany({
        where: { AND: [scoped, { decidedAt: { gte: since } }] },
        select: { submittedAt: true, decidedAt: true, status: true },
        take: 500,
      }),
    ]);
    const durations = recent
      .filter(r => r.decidedAt)
      .map(r => ((r.decidedAt as Date).getTime() - r.submittedAt.getTime()) / 3_600_000);
    const approved = recent.filter(r => r.status === 'APPROVED').length;
    return {
      pending,
      overdue,
      decidedToday,
      avgDecisionHours: durations.length
        ? Math.round((durations.reduce((s, v) => s + v, 0) / durations.length) * 10) / 10
        : null,
      approvalRate: recent.length ? Math.round((approved / recent.length) * 100) : null,
    };
  }

  private async load(id: number): Promise<ApprovalRow> {
    const a = await this.prisma.processApproval.findUnique({
      where: { id },
      include: APPROVAL_INCLUDE,
    });
    if (!a) throw new NotFoundException('Pedido de aprovação não encontrado');
    return a;
  }

  async detail(id: number, user: CurrentUserData) {
    const a = await this.load(id);
    // 404 (não 403) para não revelar a existência de pedidos alheios.
    if (!this.canView(user, a)) throw new NotFoundException('Pedido de aprovação não encontrado');
    const next = await this.nextStepTitles([a]);

    const [siblings, comments, audit] = await Promise.all([
      this.prisma.processApproval.findMany({
        where: { instanceId: a.instanceId, stepId: a.stepId, round: a.round },
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          code: true,
          sequence: true,
          status: true,
          decision: true,
          decidedAt: true,
          approver: user2,
        },
      }),
      this.prisma.processStepComment.findMany({
        where: { instanceId: a.instanceId, stepId: a.stepId },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          id: true,
          kind: true,
          body: true,
          createdAt: true,
          author: user2,
        },
      }),
      this.prisma.processAuditLog.findMany({
        where: { instanceId: a.instanceId, action: { startsWith: 'APPROVAL' } },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: { user: user2 },
      }),
    ]);
    const history = audit
      .map(e => ({
        id: e.id,
        action: e.action,
        createdAt: e.createdAt,
        user: e.user,
        meta: e.meta ? safeParse(e.meta) : null,
      }))
      .filter(e => {
        const m = e.meta as { approvalId?: number; stepId?: number } | null;
        return m?.approvalId === a.id || (m?.approvalId == null && m?.stepId === a.stepId);
      });

    return {
      ...this.toView(a, next.get(a.id) ?? [], user),
      snapshot: a.dataSnapshot ? safeParse(a.dataSnapshot) : null,
      group: siblings,
      comments,
      history,
    };
  }

  // ─── Decisões ─────────────────────────────────────────────────────────────

  private async notify(
    userId: number | null | undefined,
    actorId: number,
    type: string,
    message: string,
  ) {
    if (!userId || userId === actorId) return;
    await createNotificationSafe(this.prisma, this.logger, { userId, type, message });
  }

  private label(a: ApprovalRow) {
    return `${a.code} — "${a.step.step.title}" (${a.instance.code ?? `#${a.instanceId}`})`;
  }

  private audit(a: ApprovalRow, userId: number, action: string, meta?: object) {
    return writeProcessAuditLog(this.prisma, this.logger, {
      processId: a.instance.process.id,
      instanceId: a.instanceId,
      userId,
      action,
      meta: { approvalId: a.id, stepId: a.stepId, ...meta },
    });
  }

  private requireJustification(dto: DecideApprovalDto) {
    if (!dto.justification?.trim()) {
      throw new BadRequestException('Esta decisão exige uma justificação');
    }
    return dto.justification.trim();
  }

  async decide(id: number, user: CurrentUserData, dto: DecideApprovalDto) {
    const a = await this.load(id);
    if (!this.canView(user, a)) throw new NotFoundException('Pedido de aprovação não encontrado');

    const perms = this.permissions(user, a);
    if (!DECIDABLE.includes(a.status)) {
      throw new BadRequestException(
        a.status === 'WAITING'
          ? 'Este pedido aguarda a decisão dos aprovadores anteriores'
          : a.status === 'INFO_REQUESTED'
            ? 'Aguarda a resposta ao pedido de informação'
            : `O pedido já está ${a.status}`,
      );
    }
    if (!this.isLive(a)) {
      throw new BadRequestException('O processo ou a etapa já não aceita decisões');
    }

    if (dto.decision === 'DELEGATE') return this.delegate(a, user, dto, perms.canDelegate);
    if (dto.decision === 'ESCALATE') return this.escalate(a, user, dto, perms.canEscalate);

    // Regra 1 e 6 (§7): só o aprovador designado decide, e nunca o próprio pedido.
    if (perms.segregated) {
      throw new ForbiddenException(
        'Segregação de funções: não pode decidir um pedido que submeteu ou que lhe diz respeito',
      );
    }
    if (!perms.canDecide) {
      throw new ForbiddenException('Não está autorizado a decidir este pedido de aprovação');
    }

    switch (dto.decision) {
      case 'APPROVE':
        return this.approve(a, user, dto.justification?.trim());
      case 'REJECT':
        return this.reject(a, user, this.requireJustification(dto));
      case 'RETURN':
        return this.returnForCorrection(a, user, this.requireJustification(dto));
      case 'REQUEST_INFO':
        return this.requestInfo(a, user, this.requireJustification(dto));
      default:
        throw new BadRequestException('Decisão desconhecida');
    }
  }

  /** Grava a decisão terminal, com a versão dos dados analisados (regra 5). */
  private async stamp(
    a: ApprovalRow,
    user: CurrentUserData,
    status: 'APPROVED' | 'REJECTED' | 'RETURNED',
    justification?: string,
  ) {
    const inst = await this.engine.loadInstance(a.instanceId);
    const sp = inst?.stepProgress.find(p => p.stepId === a.stepId);
    const decidedVersion = inst && sp ? this.engine.snapshotHash(inst, sp) : null;
    await this.prisma.processApproval.update({
      where: { id: a.id },
      data: {
        status,
        decision: status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : 'RETURN',
        justification,
        decidedAt: new Date(),
        decidedById: user.id,
        decidedVersion,
      },
    });
    return { inst, sp };
  }

  private async emitDecided(a: ApprovalRow, user: CurrentUserData, decision: string) {
    const inst = await this.engine.loadInstance(a.instanceId);
    const sp = inst?.stepProgress.find(p => p.stepId === a.stepId);
    if (!inst || !sp) return;
    await this.engine.emit(
      TriggerType.APPROVAL_DECIDED,
      { ...this.engine.eventPayload(inst, sp), approvalId: a.id, decision, deciderId: user.id },
      `approval.decided:${a.id}:${decision}`,
    );
  }

  private async cancelOthersInRound(a: ApprovalRow) {
    await this.prisma.processApproval.updateMany({
      where: {
        instanceId: a.instanceId,
        stepId: a.stepId,
        round: a.round,
        id: { not: a.id },
        status: { in: [...OPEN_APPROVAL_STATUSES] },
      },
      data: { status: 'CANCELLED' },
    });
  }

  private async approve(a: ApprovalRow, user: CurrentUserData, justification?: string) {
    const { inst, sp } = await this.stamp(a, user, 'APPROVED', justification);
    await this.audit(a, user.id, 'APPROVAL_APPROVED', { justification });

    // Várias aprovações: sequencial → próximo aprovador; paralelo → espera os restantes;
    // qualquer → a primeira aprovação basta.
    let finished = false;
    if (a.mode === 'ANY') {
      await this.cancelOthersInRound(a);
      finished = true;
    } else {
      const remaining = await this.prisma.processApproval.findMany({
        where: {
          instanceId: a.instanceId,
          stepId: a.stepId,
          round: a.round,
          status: { in: [...OPEN_APPROVAL_STATUSES] },
        },
        orderBy: { sequence: 'asc' },
      });
      if (remaining.length === 0) finished = true;
      else if (a.mode === 'SEQUENTIAL') {
        const nextRow = remaining.find(r => r.status === 'WAITING');
        if (nextRow && !remaining.some(r => r.status !== 'WAITING')) {
          await this.prisma.processApproval.update({
            where: { id: nextRow.id },
            data: { status: 'PENDING' },
          });
          if (inst && sp)
            await this.engine.announceApproval(inst, sp, nextRow.id, nextRow.approverId);
        }
      }
    }

    if (finished && inst && sp) await this.finalizeApproved(inst, sp.id, a, user);
    await this.notify(
      a.requesterId,
      user.id,
      'PROCESS_APPROVAL_DECIDED',
      `${this.label(a)} foi aprovado${finished ? '' : ' (aguarda os restantes aprovadores)'}`,
    );
    await this.emitDecided(a, user, 'APPROVE');
    return this.detail(a.id, user);
  }

  /** Conclui a etapa de aprovação (decisão ≠ execução) e deixa o motor avançar o fluxo. */
  private async finalizeApproved(
    inst: EngineInstance,
    progressId: number,
    a: ApprovalRow,
    user: CurrentUserData,
  ) {
    const now = new Date();
    const sp = inst.stepProgress.find(p => p.id === progressId);
    if (!sp) return;
    await this.prisma.stepProgress.update({
      where: { id: sp.id },
      data: {
        status: 'COMPLETED',
        result: 'APPROVED',
        action: 'APPROVE',
        completedById: user.id,
        completedAt: now,
        startedAt: sp.startedAt ?? now,
        duration: sp.startedAt ? Math.round((now.getTime() - sp.startedAt.getTime()) / 60000) : 0,
      },
    });
    sp.status = 'COMPLETED';
    sp.result = 'APPROVED';
    await this.audit(a, user.id, 'APPROVAL_STEP_COMPLETED', { result: 'APPROVED' });
    await this.engine.runActions(inst, sp, sp.step.successActions);
    await this.engine.advance(inst.id);
    // O responsável pela execução é avisado de que a aprovação foi dada (a execução continua dele).
    await this.notify(
      a.executorId,
      user.id,
      'PROCESS_APPROVAL_EXECUTION',
      `Aprovado: ${this.label(a)} — pode avançar com a execução`,
    );
  }

  private async reject(a: ApprovalRow, user: CurrentUserData, justification: string) {
    const { inst, sp } = await this.stamp(a, user, 'REJECTED', justification);
    await this.cancelOthersInRound(a);
    await this.audit(a, user.id, 'APPROVAL_REJECTED', {
      justification,
      rule: a.step.step.onReject,
    });
    await this.notify(
      a.requesterId,
      user.id,
      'PROCESS_APPROVAL_DECIDED',
      `${this.label(a)} foi rejeitado: ${justification}`,
    );
    await this.emitDecided(a, user, 'REJECT');
    if (!inst || !sp) return this.detail(a.id, user);

    // Regra definida no modelo para a rejeição (regra 3). Sem etapa anterior, "devolver"
    // não é possível — cai para suspender.
    const rule =
      a.step.step.onReject === 'RETURN' && this.previousSteps(inst, a).length === 0
        ? 'HOLD'
        : a.step.step.onReject;
    switch (rule) {
      case 'CANCEL':
        await this.engine.cancelByEngine(inst, `Aprovação rejeitada: ${justification}`);
        break;
      case 'RETURN':
        await this.returnPrevious(inst, a, user, justification);
        break;
      case 'BRANCH': {
        const now = new Date();
        await this.prisma.stepProgress.update({
          where: { id: sp.id },
          data: {
            status: 'COMPLETED',
            result: 'REJECTED',
            action: 'REJECT',
            notes: justification,
            completedById: user.id,
            completedAt: now,
          },
        });
        sp.status = 'COMPLETED';
        sp.result = 'REJECTED';
        await this.engine.runActions(inst, sp, sp.step.failureActions);
        await this.engine.advance(inst.id);
        break;
      }
      default: {
        // HOLD: a etapa fica rejeitada e o processo suspenso até decisão da gestão.
        await this.prisma.stepProgress.update({
          where: { id: sp.id },
          data: {
            status: 'REJECTED',
            notes: justification,
            completedById: user.id,
            completedAt: new Date(),
          },
        });
        await this.prisma.processInstance.update({
          where: { id: inst.id },
          data: { status: 'ON_HOLD', suspendedAt: new Date() },
        });
        await this.engine.runActions(inst, sp, sp.step.failureActions);
      }
    }
    return this.detail(a.id, user);
  }

  private async returnForCorrection(a: ApprovalRow, user: CurrentUserData, justification: string) {
    const inst = await this.engine.loadInstance(a.instanceId);
    if (!inst) throw new NotFoundException('Instância não encontrada');
    // Valida antes de gravar a decisão: só se devolve se houver etapa anterior.
    const targets = this.previousSteps(inst, a);
    if (targets.length === 0) {
      throw new BadRequestException('Esta aprovação não tem etapa anterior para devolver');
    }
    const max = a.step.step.maxReturns;
    if (max != null && targets.some(t => t.returnCount >= max)) {
      throw new BadRequestException(`Foi atingido o limite de ${max} devoluções para correcção`);
    }
    await this.stamp(a, user, 'RETURNED', justification);
    await this.cancelOthersInRound(a);
    await this.audit(a, user.id, 'APPROVAL_RETURNED', { justification });
    await this.returnPrevious(inst, a, user, justification);
    await this.notify(
      a.requesterId,
      user.id,
      'PROCESS_APPROVAL_DECIDED',
      `${this.label(a)} foi devolvido para correcção: ${justification}`,
    );
    await this.emitDecided(a, user, 'RETURN');
    return this.detail(a.id, user);
  }

  private previousSteps(inst: EngineInstance, a: ApprovalRow) {
    const deps = effectiveDependencies(inst.stepProgress.map(p => p.step));
    const orders = deps.get(a.step.stepOrder) ?? [];
    return inst.stepProgress.filter(
      p => orders.includes(p.stepOrder) && ['COMPLETED', 'REJECTED'].includes(p.status),
    );
  }

  /** Reabre as etapas anteriores com o motivo; o motor devolve esta etapa a "em espera". */
  private async returnPrevious(
    inst: EngineInstance,
    a: ApprovalRow,
    user: CurrentUserData,
    reason: string,
  ) {
    const targets = this.previousSteps(inst, a);
    for (const t of targets) {
      await this.prisma.stepProgress.update({
        where: { id: t.id },
        data: {
          status: 'PENDING',
          completedAt: null,
          completedById: null,
          returnCount: { increment: 1 },
          returnReason: reason,
          startedAt: new Date(),
        },
      });
      await this.prisma.processStepComment.create({
        data: {
          instanceId: inst.id,
          stepId: t.stepId,
          authorId: user.id,
          kind: 'SYSTEM',
          body: `Devolvida pela aprovação ${a.code}: ${reason}`,
        },
      });
      await this.notify(
        t.assigneeId ?? t.completedById,
        user.id,
        'PROCESS_TASK_RETURNED',
        `A tarefa "${t.step.title}" (${inst.code ?? `#${inst.id}`}) foi devolvida para correcção: ${reason}`,
      );
    }
    // Se o pedido estava suspenso (rejeição com HOLD anterior), retoma.
    await this.engine.advance(inst.id);
  }

  private async requestInfo(a: ApprovalRow, user: CurrentUserData, question: string) {
    await this.prisma.processApproval.update({
      where: { id: a.id },
      data: { status: 'INFO_REQUESTED' },
    });
    await this.prisma.processStepComment.create({
      data: {
        instanceId: a.instanceId,
        stepId: a.stepId,
        authorId: user.id,
        kind: 'CLARIFICATION',
        body: `Informação adicional solicitada (${a.code}): ${question}`,
      },
    });
    await this.audit(a, user.id, 'APPROVAL_INFO_REQUESTED', { question });
    await this.notify(
      a.requesterId,
      user.id,
      'PROCESS_APPROVAL_INFO',
      `${this.label(a)}: ${question}`,
    );
    await this.notify(
      a.instance.targetUserId,
      user.id,
      'PROCESS_APPROVAL_INFO',
      `${this.label(a)}: ${question}`,
    );
    return this.detail(a.id, user);
  }

  /** O solicitante responde ao pedido de informação; o aprovador volta a poder decidir. */
  async respond(id: number, user: CurrentUserData, dto: RespondApprovalDto) {
    const a = await this.load(id);
    if (!this.canView(user, a)) throw new NotFoundException('Pedido de aprovação não encontrado');
    if (!this.permissions(user, a).canRespond) {
      throw new ForbiddenException('Não pode responder a este pedido de informação');
    }
    // Os dados podem ter mudado: a nova versão fica registada como a submetida.
    const inst = await this.engine.loadInstance(a.instanceId);
    const sp = inst?.stepProgress.find(p => p.stepId === a.stepId);
    const hash = inst && sp ? this.engine.snapshotHash(inst, sp) : a.dataVersion;
    await this.prisma.processApproval.update({
      where: { id: a.id },
      data: { status: a.escalationLevel > 0 ? 'ESCALATED' : 'PENDING', dataVersion: hash },
    });
    await this.prisma.processStepComment.create({
      data: {
        instanceId: a.instanceId,
        stepId: a.stepId,
        authorId: user.id,
        kind: 'COMMENT',
        body: `Resposta ao pedido de informação (${a.code}): ${dto.message.trim()}`,
      },
    });
    await this.audit(a, user.id, 'APPROVAL_INFO_PROVIDED', { message: dto.message.trim() });
    await this.notify(
      a.approverId,
      user.id,
      'PROCESS_APPROVAL_INFO',
      `${this.label(a)}: informação adicional fornecida`,
    );
    return this.detail(a.id, user);
  }

  private async delegate(
    a: ApprovalRow,
    user: CurrentUserData,
    dto: DecideApprovalDto,
    allowed: boolean,
  ) {
    if (!allowed) throw new ForbiddenException('Não é permitido delegar esta aprovação');
    if (!dto.delegateToId) throw new BadRequestException('Indique o novo aprovador');
    if (dto.delegateToId === a.approverId)
      throw new BadRequestException('Já é o aprovador deste pedido');
    await this.assertValidApprover(a, dto.delegateToId);
    const justification = dto.justification?.trim();
    await this.prisma.processApproval.update({
      where: { id: a.id },
      data: {
        approverId: dto.delegateToId,
        approverRole: null,
        previousApproverId: a.approverId,
      },
    });
    await recordAssignment(this.prisma, {
      instanceId: a.instanceId,
      stepId: a.stepId,
      kind: 'DELEGATE',
      assigneeId: dto.delegateToId,
      delegatedFromId: a.approverId,
      assignedById: user.id,
      reason: justification,
    });
    await this.audit(a, user.id, 'APPROVAL_DELEGATED', {
      from: a.approverId,
      to: dto.delegateToId,
      justification,
    });
    await this.notify(
      dto.delegateToId,
      user.id,
      'PROCESS_APPROVAL_REQUESTED',
      `Aprovação delegada em si: ${this.label(a)}`,
    );
    return this.detail(a.id, user);
  }

  private async escalate(
    a: ApprovalRow,
    user: CurrentUserData,
    dto: DecideApprovalDto,
    allowed: boolean,
  ) {
    if (!allowed) throw new ForbiddenException('Não pode escalar esta aprovação');
    const justification = this.requireJustification(dto);
    let toId = dto.escalateToId ?? null;
    if (!toId) {
      const base = a.approverId ?? user.id;
      const u = await this.prisma.user.findUnique({
        where: { id: base },
        select: { managerId: true },
      });
      toId = u?.managerId ?? null;
    }
    if (!toId) {
      throw new BadRequestException(
        'Não há nível superior definido — indique o aprovador de destino',
      );
    }
    await this.assertValidApprover(a, toId);
    await this.prisma.processApproval.update({
      where: { id: a.id },
      data: {
        approverId: toId,
        approverRole: null,
        previousApproverId: a.approverId,
        status: 'ESCALATED',
        escalationLevel: { increment: 1 },
      },
    });
    await this.audit(a, user.id, 'APPROVAL_ESCALATED', {
      from: a.approverId,
      to: toId,
      justification,
    });
    await this.notify(
      toId,
      user.id,
      'PROCESS_APPROVAL_REQUESTED',
      `Aprovação escalada para si: ${this.label(a)} — ${justification}`,
    );
    return this.detail(a.id, user);
  }

  /** O novo aprovador existe, está activo e não é parte interessada no pedido. */
  private async assertValidApprover(a: ApprovalRow, userId: number) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, active: true },
    });
    if (!u || !u.active) throw new BadRequestException('Aprovador inválido ou inactivo');
    if (userId === a.instance.initiatedById || userId === a.instance.targetUserId) {
      throw new BadRequestException(
        'Segregação de funções: o solicitante ou o colaborador-alvo não podem ser aprovadores',
      );
    }
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
