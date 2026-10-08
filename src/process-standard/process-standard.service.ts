// src/process-standard/process-standard.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildOverview } from './process-overview';
import {
  addHours,
  effectiveDependencies,
  simulateScenario,
  validateWorkflow,
} from './process-workflow';
import { recordAssignment } from './process-assignments';
import { isOverdue, processState, taskState } from './process-states';
import { syncStepActivation } from './process-activation';
import { loadSetting } from './process-settings.loader';
import {
  codePrefix,
  formatCode,
  NumberingConfig,
  resolveSlaHours,
  sequenceOf,
  WorkCalendarConfig,
} from './process-settings';
import { ProcessAuditEntry, writeProcessAuditLog } from './process-audit';
import { ProcessEngineService, OPEN_APPROVAL_STATUSES } from './process-engine.service';
import { TriggerType } from '../automation/automation.dto';
import {
  buildConditionContext,
  evaluateConditionSet,
  parseConditionSet,
} from './process-conditions';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { inDepartmentScope } from './process-scope';
import { missingStartData, startRequirements } from './process-start-requirements';
import { CurrentUserData } from '../common/decorators';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { ApprovalDecision, InstanceStatus } from '@prisma/client';
import {
  CreateProcessDto,
  UpdateProcessDto,
  ProcessFilterDto,
  StartInstanceDto,
  CompleteStepDto,
  RejectStepDto,
  ApprovalActionDto,
  ProcessDashboardFilterDto,
  ProcessStepDto,
  DuplicateProcessDto,
  SimulateFlowDto,
} from './process-standard.dto';

const PROCESS_PRIVILEGED_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR];
const TEMPLATE_ADMIN_ROLES = [Role.ADMIN, Role.RH];
const ACTIVE_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'ESCALATED'] as const;
const COMPLETABLE_STATUSES = ['PENDING', 'IN_PROGRESS', 'ESCALATED'];

const toDate = (v?: string | null) => (v ? new Date(v) : undefined);

@Injectable()
export class ProcessStandardService {
  private readonly logger = new Logger(ProcessStandardService.name);

  // O motor é opcional para que os testes unitários do serviço continuem a
  // funcionar só com o PrismaService; em produção é sempre injectado.
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly engine?: ProcessEngineService,
  ) {}

  private advance(instanceId: number) {
    return this.engine
      ? this.engine.advance(instanceId)
      : syncStepActivation(this.prisma, instanceId);
  }

  private async runStepActions(instanceId: number, stepId: number, raw: unknown) {
    if (!this.engine || !raw) return;
    const inst = await this.engine.loadInstance(instanceId);
    const sp = inst?.stepProgress.find(p => p.stepId === stepId);
    if (inst && sp) await this.engine.runActions(inst, sp, raw);
  }

  /** Emite um evento do processo para as automações (`stepId` acrescenta os dados da etapa). */
  private async emitEvent(
    event: TriggerType,
    instanceId: number,
    stepId: number | undefined,
    dedupeKey: string,
    extra: Record<string, unknown> = {},
  ) {
    if (!this.engine) return;
    const inst = await this.engine.loadInstance(instanceId);
    if (!inst) return;
    const sp = stepId ? inst.stepProgress.find(p => p.stepId === stepId) : undefined;
    await this.engine.emit(event, { ...this.engine.eventPayload(inst, sp), ...extra }, dedupeKey);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private nextVersion(current: string): string {
    const parts = current.split('.').map(Number);
    parts[1] = (parts[1] ?? 0) + 1;
    return parts.join('.');
  }

  private stepData(s: ProcessStepDto) {
    return {
      type: s.type,
      title: s.title,
      description: s.description,
      order: s.order,
      responsibleId: s.responsibleId,
      responsibleRole: s.responsibleRole,
      slaHours: s.slaHours,
      estimatedMinutes: s.estimatedMinutes,
      formSchema: s.formSchema ? JSON.stringify(s.formSchema) : null,
      exitConditions: s.exitConditions ? JSON.stringify(s.exitConditions) : null,
      requiresUpload: s.requiresUpload ?? false,
      checklist: s.checklist ?? [],
      dependsOnOrders: s.dependsOnOrders ?? [],
      parallel: s.parallel ?? false,
      reviewerId: s.reviewerId,
      config: s.config ? JSON.stringify(s.config) : null,
      entryConditions: s.entryConditions ? JSON.stringify(s.entryConditions) : null,
      requiredData: s.requiredData ?? [],
      approverIds: s.approverIds ?? [],
      approvalMode: s.approvalMode ?? 'SEQUENTIAL',
      allowDelegation: s.allowDelegation ?? true,
      onReject: s.onReject ?? 'HOLD',
      maxReturns: s.maxReturns,
      successActions: s.successActions?.length ? JSON.stringify(s.successActions) : null,
      failureActions: s.failureActions?.length ? JSON.stringify(s.failureActions) : null,
      escalationAfterHours: s.escalationAfterHours,
      escalationToId: s.escalationToId,
      escalationToRole: s.escalationToRole,
      calendarMode: s.calendarMode ?? 'CALENDAR',
      posX: s.posX,
      posY: s.posY,
    };
  }

  /** Dependências inválidas ou ciclos impedem guardar o modelo (§8: "validar ciclos infinitos"). */
  private assertStructure(steps: ProcessStepDto[]) {
    const { structural } = validateWorkflow(steps);
    if (structural.length) throw new BadRequestException(structural.join(' '));
  }

  async writeAuditLog(opts: ProcessAuditEntry) {
    await writeProcessAuditLog(this.prisma, this.logger, opts);
  }

  // ─── LISTAGEM ─────────────────────────────────────────────────────────────

  async findAll(filters: ProcessFilterDto, user?: CurrentUserData) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      riskLevel,
      departmentId,
      category,
      involvedModule,
      ownerId,
    } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.ProcessStandardWhereInput = {};
    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (departmentId) where.departmentId = departmentId;
    if (category) where.category = category;
    if (involvedModule) where.involvedModules = { has: involvedModule };
    if (ownerId) where.ownerId = ownerId;

    // §5 regras de acesso/confidencialidade: quem não gere modelos só vê os
    // publicados, não restritos e abertos à sua função.
    if (user && !isPrivileged(user, PROCESS_PRIVILEGED_ROLES)) {
      where.status = 'ACTIVE';
      where.confidentiality = { not: 'RESTRICTED' };
      where.AND = [
        {
          OR: [{ accessRoles: { isEmpty: true } }, { accessRoles: { has: user.role?.name ?? '' } }],
        },
      ];
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.read.processStandard.findMany({
        where,
        skip,
        take: limit,
        include: {
          owner: { select: { id: true, fullName: true } },
          department: { select: { id: true, name: true } },
          _count: { select: { steps: true, instances: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.read.processStandard.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── DETALHE ─────────────────────────────────────────────────────────────

  async findOne(id: number) {
    const p = await this.prisma.read.processStandard.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            responsible: { select: { id: true, fullName: true } },
            reviewer: { select: { id: true, fullName: true } },
          },
        },
        owner: { select: { id: true, fullName: true } },
        department: { select: { id: true, name: true } },
        versions: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { instances: true } },
      },
    });
    if (!p) throw new NotFoundException('Processo não encontrado');
    return p;
  }

  // ─── CRIAR ────────────────────────────────────────────────────────────────

  async create(ownerId: number, dto: CreateProcessDto) {
    const existing = await this.prisma.processStandard.findFirst({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException(`Código ${dto.code} já existe`);

    this.assertStructure(dto.steps);
    const { steps, ...data } = dto;

    const process = await this.prisma.processStandard.create({
      data: {
        ...data,
        nextReviewDate: toDate(data.nextReviewDate),
        effectiveFrom: toDate(data.effectiveFrom),
        ownerId: data.ownerId ?? ownerId,
        status: 'DRAFT',
        version: '1.0',
        tags: data.tags ?? [],
        steps: { create: steps.map(s => this.stepData(s)) },
      },
      include: {
        steps: { orderBy: { order: 'asc' } },
        owner: { select: { id: true, fullName: true } },
      },
    });

    await this.writeAuditLog({
      processId: process.id,
      userId: ownerId,
      action: 'CREATED',
      meta: { code: dto.code, version: '1.0' },
    });

    return process;
  }

  // ─── ACTUALIZAR ────────────────────────────────────────────────────────────

  async update(id: number, dto: UpdateProcessDto, updatedById: number) {
    const existing = await this.findOne(id);

    // O controller documenta esta rota como "apenas DRAFT" — o guard original
    // só bloqueava ACTIVE, deixando IN_REVIEW (editável a meio do workflow de
    // aprovação, invalidando silenciosamente a revisão em curso) e ARCHIVED
    // (processo supostamente encerrado) editáveis também.
    if (existing.status !== 'DRAFT') {
      throw new ForbiddenException(
        existing.status === 'ACTIVE'
          ? 'Processo activo não pode ser editado directamente. Crie uma nova versão.'
          : 'Apenas processos em DRAFT podem ser editados.',
      );
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await this.prisma.read.processStandard.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (codeExists) throw new ConflictException(`Código ${dto.code} já em uso`);
    }

    if (dto.steps?.length) this.assertStructure(dto.steps);
    const { steps, ...data } = dto;

    await this.prisma.processStandard.update({
      where: { id },
      data: {
        ...data,
        nextReviewDate: toDate(data.nextReviewDate),
        effectiveFrom: toDate(data.effectiveFrom),
        tags: data.tags ?? undefined,
      },
    });

    if (steps?.length) {
      // StepProgress.stepId → ProcessStep é ON DELETE RESTRICT. Um processo
      // pode chegar aqui em DRAFT depois de createNewVersion() (que apenas
      // reinicia o status, sem tocar nas ProcessStep) tendo já instâncias
      // antigas com progresso registado contra os steps actuais — substituir
      // os steps rebentava com uma violação de FK em bruto (500).
      const existingStepIds = existing.steps.map(s => s.id);
      if (existingStepIds.length) {
        const progressCount = await this.prisma.stepProgress.count({
          where: { stepId: { in: existingStepIds } },
        });
        if (progressCount > 0) {
          throw new BadRequestException(
            'Não é possível substituir as etapas: já existem instâncias com progresso registado nas etapas actuais.',
          );
        }
      }
      await this.prisma.processStep.deleteMany({ where: { processId: id } });
      await this.prisma.processStep.createMany({
        data: steps.map(s => ({ processId: id, ...this.stepData(s) })),
      });
    }

    await this.writeAuditLog({
      processId: id,
      userId: updatedById,
      action: 'UPDATED',
      meta: { fields: Object.keys(dto) },
    });

    return this.findOne(id);
  }

  // ─── NOVA VERSÃO ──────────────────────────────────────────────────────────

  async createNewVersion(id: number, userId: number) {
    const existing = await this.findOne(id);

    // Guardar snapshot da versão actual
    await this.prisma.processVersion.create({
      data: {
        processId: id,
        version: existing.version,
        snapshot: JSON.stringify(existing),
        createdById: userId,
      },
    });

    const newVersion = this.nextVersion(existing.version);

    const updated = await this.prisma.processStandard.update({
      where: { id },
      data: {
        version: newVersion,
        status: 'DRAFT',
      },
    });

    await this.writeAuditLog({
      processId: id,
      userId,
      action: 'NEW_VERSION',
      meta: { from: existing.version, to: newVersion },
    });

    return updated;
  }

  // ─── WORKFLOW DE APROVAÇÃO ────────────────────────────────────────────────

  async submitForReview(id: number, userId: number) {
    const p = await this.findOne(id);
    if (p.status !== 'DRAFT') {
      throw new BadRequestException('Apenas processos em DRAFT podem ser submetidos para revisão');
    }
    if (p.steps.length === 0) {
      throw new BadRequestException('Processo sem etapas não pode ser submetido');
    }
    const check = validateWorkflow(p.steps);
    if (!check.valid) {
      throw new BadRequestException(`Fluxo inválido: ${check.errors.join(' ')}`);
    }

    const updated = await this.prisma.processStandard.update({
      where: { id },
      data: { status: 'IN_REVIEW' },
    });

    await this.writeAuditLog({ processId: id, userId, action: 'SUBMITTED_FOR_REVIEW' });

    // Notificar aprovadores
    await createNotificationSafe(this.prisma, this.logger, {
      userId: p.ownerId,
      type: 'PROCESS_REVIEW_REQUESTED',
      message: `Processo ${p.code} submetido para revisão`,
    });

    return updated;
  }

  async approvalAction(id: number, userId: number, dto: ApprovalActionDto) {
    const p = await this.findOne(id);
    if (p.status !== 'IN_REVIEW') {
      throw new BadRequestException('Processo não está em revisão');
    }

    const newStatus = dto.action === 'approve' ? 'ACTIVE' : 'DRAFT';

    const updated = await this.prisma.processStandard.update({
      where: { id },
      data: {
        status: newStatus,
        publishedAt: dto.action === 'approve' ? new Date() : undefined,
      },
    });

    await this.prisma.processApprovalLog.create({
      data: {
        processId: id,
        userId,
        action: dto.action === 'approve' ? ApprovalDecision.APPROVE : ApprovalDecision.REJECT,
        comment: dto.comment,
        status: newStatus,
      },
    });

    await this.writeAuditLog({
      processId: id,
      userId,
      action: dto.action === 'approve' ? 'APPROVED' : 'REJECTED',
      meta: { comment: dto.comment },
    });

    return updated;
  }

  async archive(id: number, userId: number) {
    const p = await this.findOne(id);
    if (p.status === 'ARCHIVED') return p;

    const updated = await this.prisma.processStandard.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await this.writeAuditLog({ processId: id, userId, action: 'ARCHIVED' });
    return updated;
  }

  // ─── TESTAR FLUXO / DUPLICAR / VERSÕES (§5) ────────────────────────────────

  /** "Testar o fluxo": valida o grafo de etapas e simula as ondas de execução. */
  async validateTemplate(id: number) {
    const p = await this.findOne(id);
    return { processId: id, code: p.code, version: p.version, ...validateWorkflow(p.steps) };
  }

  /** "Testar o fluxo" com um cenário: mostra o caminho tomado (ramos, etapas ignoradas, fim). */
  async simulateTemplate(id: number, dto: SimulateFlowDto) {
    const p = await this.findOne(id);
    const results: Record<number, string> = {};
    for (const [order, result] of Object.entries(dto.results ?? {})) {
      if (Number.isInteger(Number(order))) results[Number(order)] = String(result);
    }
    const validation = validateWorkflow(p.steps);
    return {
      processId: id,
      code: p.code,
      version: p.version,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      ...simulateScenario(p.steps, {
        priority: dto.priority,
        sourceModule: dto.sourceModule,
        results,
        form: dto.form,
      }),
    };
  }

  async duplicate(id: number, userId: number, dto: DuplicateProcessDto) {
    const src = await this.findOne(id);

    let code = dto.code?.trim();
    if (!code) {
      let n = 1;
      code = `${src.code}-COPIA`;
      while (await this.prisma.processStandard.findFirst({ where: { code } })) {
        n++;
        code = `${src.code}-COPIA-${n}`;
      }
    } else if (await this.prisma.processStandard.findFirst({ where: { code } })) {
      throw new ConflictException(`Código ${code} já existe`);
    }

    const copy = await this.prisma.processStandard.create({
      data: {
        code,
        title: dto.title?.trim() || `${src.title} (cópia)`,
        description: src.description,
        objective: src.objective,
        scope: src.scope,
        riskLevel: src.riskLevel,
        category: src.category,
        tags: src.tags,
        defaultSlaHours: src.defaultSlaHours,
        estimatedMinutes: src.estimatedMinutes,
        involvedModules: src.involvedModules,
        reviewPolicy: src.reviewPolicy,
        confidentiality: src.confidentiality,
        accessRoles: src.accessRoles,
        requiredDocuments: src.requiredDocuments,
        approvalRules: src.approvalRules,
        startConditions: src.startConditions,
        completionConditions: src.completionConditions,
        departmentId: src.departmentId,
        ownerId: userId,
        status: 'DRAFT',
        version: '1.0',
        steps: {
          create: src.steps.map(s => ({
            type: s.type,
            title: s.title,
            description: s.description,
            order: s.order,
            responsibleId: s.responsibleId,
            responsibleRole: s.responsibleRole,
            slaHours: s.slaHours,
            estimatedMinutes: s.estimatedMinutes,
            formSchema: s.formSchema,
            exitConditions: s.exitConditions,
            requiresUpload: s.requiresUpload,
            checklist: s.checklist,
            dependsOnOrders: s.dependsOnOrders,
            parallel: s.parallel,
            reviewerId: s.reviewerId,
            config: s.config,
            entryConditions: s.entryConditions,
            requiredData: s.requiredData,
            approverIds: s.approverIds,
            approvalMode: s.approvalMode,
            allowDelegation: s.allowDelegation,
            onReject: s.onReject,
            maxReturns: s.maxReturns,
            successActions: s.successActions,
            failureActions: s.failureActions,
            escalationAfterHours: s.escalationAfterHours,
            escalationToId: s.escalationToId,
            escalationToRole: s.escalationToRole,
            calendarMode: s.calendarMode,
            posX: s.posX,
            posY: s.posY,
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    await this.writeAuditLog({
      processId: copy.id,
      userId,
      action: 'DUPLICATED',
      meta: { from: src.id, fromCode: src.code },
    });
    return copy;
  }

  /** Versão actual + versões anteriores (snapshots), mais recente primeiro. */
  async listVersions(id: number) {
    const p = await this.findOne(id);
    const past = await this.prisma.read.processVersion.findMany({
      where: { processId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, version: true, createdAt: true, createdById: true },
    });
    return [
      {
        version: p.version,
        current: true,
        status: p.status,
        createdAt: p.publishedAt ?? p.updatedAt,
        createdById: null,
      },
      ...past.map(v => ({ ...v, current: false, status: null as string | null })),
    ];
  }

  // ─── COMPARAR VERSÕES ─────────────────────────────────────────────────────

  async compareVersions(id: number, versionA: string, versionB: string) {
    const versions = await this.prisma.read.processVersion.findMany({
      where: { processId: id, version: { in: [versionA, versionB] } },
    });

    // Achado real: `versions.length < 2` só verifica a CONTAGEM total, não
    // que versionA e versionB específicos foram de facto encontrados — com
    // 2+ versões na BD mas nenhuma a corresponder a versionA/versionB, os
    // .find() abaixo devolvem `undefined` e `.snapshot` rebentava com
    // "Cannot read properties of undefined" (500 em bruto), mascarado pelo
    // `as any`. Verificados explicitamente antes de aceder.
    const versionRecordA = versions.find(v => v.version === versionA);
    const versionRecordB = versions.find(v => v.version === versionB);
    if (!versionRecordA || !versionRecordB) {
      throw new NotFoundException('Uma ou ambas as versões não encontradas');
    }

    const a = JSON.parse(versionRecordA.snapshot);
    const b = JSON.parse(versionRecordB.snapshot);

    const diffFields = (obj1: Record<string, unknown>, obj2: Record<string, unknown>) => {
      const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
      const diff: Record<string, { a: unknown; b: unknown }> = {};
      for (const k of keys) {
        if (JSON.stringify(obj1[k]) !== JSON.stringify(obj2[k])) {
          diff[k] = { a: obj1[k], b: obj2[k] };
        }
      }
      return diff;
    };

    return {
      versionA,
      versionB,
      fieldDiffs: diffFields(a, b),
      stepsA: a.steps ?? [],
      stepsB: b.steps ?? [],
    };
  }

  // ─── INSTÂNCIAS ────────────────────────────────────────────────────────────

  private async pickAssigneeByRole(roleName: string): Promise<number | null> {
    const users = await this.prisma.read.user.findMany({
      where: { active: true, role: { name: roleName } },
      select: {
        id: true,
        _count: {
          select: {
            assignedStepProgress: { where: { status: { in: [...ACTIVE_TASK_STATUSES] } } },
          },
        },
      },
      take: 100,
    });
    users.sort(
      (a, b) => a._count.assignedStepProgress - b._count.assignedStepProgress || a.id - b.id,
    );
    return users[0]?.id ?? null;
  }

  // Atribuição automática (§6): responsável nomeado → esse; senão, quem tiver
  // a função com menos tarefas activas; senão fica por atribuir (manual).
  private async resolveAssignments(
    steps: Array<{ id: number; responsibleId: number | null; responsibleRole: string | null }>,
  ) {
    const byRole = new Map<string, number | null>();
    const result = new Map<number, number | null>();
    for (const s of steps) {
      if (s.responsibleId) {
        result.set(s.id, s.responsibleId);
      } else if (s.responsibleRole) {
        if (!byRole.has(s.responsibleRole)) {
          byRole.set(s.responsibleRole, await this.pickAssigneeByRole(s.responsibleRole));
        }
        result.set(s.id, byRole.get(s.responsibleRole) ?? null);
      } else {
        result.set(s.id, null);
      }
    }
    return result;
  }

  // Código legível PROC-AAAA-NNNN; repete em caso de colisão concorrente.
  // O prefixo, o ano e o preenchimento vêm da configuração (§14 Numeração).
  private async nextInstanceCode(year: number, cfg: NumberingConfig): Promise<string> {
    const last = await this.prisma.processInstance.findFirst({
      where: { code: { startsWith: codePrefix(cfg, year) } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    return formatCode(cfg, year, sequenceOf(cfg, year, last?.code) + 1);
  }

  /**
   * §19/§20: quem pode iniciar um processo e para quem. Perfis de gestão iniciam
   * para qualquer colaborador do seu âmbito (o GESTOR, do seu departamento); os
   * restantes só criam pedidos para si, em modelos que lhes estão explicitamente
   * abertos (função listada em `accessRoles`).
   */
  private assertCanStartFor(
    user: CurrentUserData,
    process: { accessRoles: string[] },
    targetUserId: number,
    targetDepartment: { id: number; parentId: number | null } | null,
  ) {
    if (isPrivileged(user, PROCESS_PRIVILEGED_ROLES)) {
      if (targetUserId !== user.id && !inDepartmentScope(user, targetDepartment)) {
        throw new ForbiddenException('O colaborador está fora do seu âmbito departamental');
      }
      return;
    }
    if (targetUserId !== user.id) {
      throw new ForbiddenException('Só pode iniciar pedidos em seu próprio nome');
    }
    if (!process.accessRoles.includes(user.role?.name ?? '')) {
      throw new ForbiddenException('Este modelo não está aberto a pedidos da sua função');
    }
  }

  /** §19: dados específicos que o modelo exige no arranque, conforme o módulo de origem. */
  async getStartRequirements(processId: number, sourceModule?: string) {
    const process = await this.findOne(processId);
    return {
      ...startRequirements(sourceModule ?? process.involvedModules[0]),
      templateId: process.id,
      involvedModules: process.involvedModules,
    };
  }

  async startInstance(
    processId: number,
    initiatedById: number,
    dto: StartInstanceDto,
    user?: CurrentUserData,
    opts: { validateRequirements?: boolean } = {},
  ) {
    const process = await this.findOne(processId);

    if (process.status !== 'ACTIVE') {
      throw new BadRequestException('Apenas processos activos podem ser instanciados');
    }
    const now = new Date();
    if (process.effectiveFrom && process.effectiveFrom > now) {
      throw new BadRequestException(
        `O modelo só entra em vigor em ${process.effectiveFrom.toISOString().slice(0, 10)}`,
      );
    }
    if (
      user &&
      process.accessRoles.length > 0 &&
      !isPrivileged(user, TEMPLATE_ADMIN_ROLES) &&
      !process.accessRoles.includes(user.role?.name ?? '')
    ) {
      throw new ForbiddenException('A sua função não tem acesso a este modelo de processo');
    }

    const targetUserId = dto.targetUserId ?? initiatedById;
    // §17: âmbito organizacional do processo — departamento/unidade do modelo ou,
    // na falta, do colaborador alvo.
    const targetOrg = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        departmentId: true,
        unitId: true,
        department: { select: { id: true, parentId: true } },
      },
    });
    if (user) this.assertCanStartFor(user, process, targetUserId, targetOrg?.department ?? null);
    if (user && opts.validateRequirements) {
      const missing = missingStartData(startRequirements(dto.sourceModule), {
        targetUserId: dto.targetUserId,
        sourceEntityId: dto.sourceEntityId,
        actorIsManager: isPrivileged(user, PROCESS_PRIVILEGED_ROLES),
      });
      if (missing.length) {
        throw new BadRequestException(`Dados obrigatórios em falta: ${missing.join(', ')}`);
      }
    }
    const sourceEntityType = dto.sourceEntityType?.trim() || null;
    const sourceEntityId = dto.sourceEntityId?.trim() || null;

    // Não duplicar: um pedido de origem só pode ter um processo activo por modelo.
    if (sourceEntityType && sourceEntityId) {
      const dup = await this.prisma.processInstance.findFirst({
        where: {
          processId,
          sourceEntityType,
          sourceEntityId,
          status: { in: ['IN_PROGRESS', 'ON_HOLD'] },
        },
        select: { id: true, code: true },
      });
      if (dup) {
        throw new ConflictException(
          `Já existe um processo activo (${dup.code ?? `#${dup.id}`}) para este pedido`,
        );
      }
    }

    const deps = effectiveDependencies(process.steps);
    const assignments = await this.resolveAssignments(process.steps);
    // Configurações do módulo (§14): numeração, prazos padrão, prioridades, calendário.
    const [numbering, deadlines, priorities, calendar] = await Promise.all([
      loadSetting<NumberingConfig>(this.prisma, 'numbering'),
      loadSetting<Array<{ category: string; hours: number }>>(this.prisma, 'defaultDeadlines'),
      loadSetting<Array<{ code: string; slaFactor: number }>>(this.prisma, 'priorities'),
      loadSetting<WorkCalendarConfig>(this.prisma, 'workCalendar'),
    ]);
    const slaHours = resolveSlaHours({
      templateHours: process.defaultSlaHours,
      category: process.category,
      priority: dto.priority ?? 'NORMAL',
      deadlines,
      priorities,
    });
    const dueAt = dto.dueAt
      ? new Date(dto.dueAt)
      : slaHours
        ? new Date(now.getTime() + slaHours * 3600 * 1000)
        : null;
    const ready = (order: number) => (deps.get(order) ?? []).length === 0;
    const firstActive = [...process.steps]
      .sort((a, b) => a.order - b.order)
      .find(s => ready(s.order) && assignments.get(s.id));

    const firstReady = [...process.steps]
      .sort((a, b) => a.order - b.order)
      .find(s => ready(s.order));

    let instance: Awaited<ReturnType<typeof this.createInstanceRow>> | null = null;
    for (let attempt = 0; attempt < 5 && !instance; attempt++) {
      const code = await this.nextInstanceCode(now.getFullYear(), numbering);
      try {
        instance = await this.createInstanceRow({
          code,
          process,
          processId,
          initiatedById,
          targetUserId,
          dto,
          now,
          dueAt,
          sourceEntityType,
          sourceEntityId,
          assignments,
          ready,
          calendar,
          currentResponsibleId: firstActive ? (assignments.get(firstActive.id) ?? null) : null,
          currentStepId: firstReady?.id ?? null,
          departmentId: process.departmentId ?? targetOrg?.departmentId ?? null,
          unitId: targetOrg?.unitId ?? null,
        });
      } catch (e: unknown) {
        const isCodeClash =
          typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
        if (!isCodeClash || attempt === 4) throw e;
      }
    }
    if (!instance) throw new ConflictException('Não foi possível gerar o código do processo');

    await this.writeAuditLog({
      processId,
      instanceId: instance.id,
      userId: initiatedById,
      action: 'INSTANCE_STARTED',
      meta: { targetUserId, version: process.version, code: instance.code },
    });

    // Eventos para as automações (processo criado / tarefas iniciais atribuídas) e
    // execução do que é automático (início, notificações, ramificações, aprovações…).
    await this.emitEvent(
      TriggerType.PROCESS_CREATED,
      instance.id,
      undefined,
      `process.created:${instance.id}`,
    );
    for (const sp of instance.stepProgress) {
      if (sp.status === 'PENDING' && sp.assigneeId) {
        await this.emitEvent(
          TriggerType.TASK_ASSIGNED,
          instance.id,
          sp.stepId,
          `task.assigned:${instance.id}:${sp.stepId}:${sp.assignedAt?.getTime() ?? 0}`,
        );
      }
    }
    if (instance.currentResponsibleId) {
      await recordAssignment(this.prisma, {
        instanceId: instance.id,
        kind: 'RESPONSIBLE',
        assigneeId: instance.currentResponsibleId,
        assignedById: initiatedById,
        reason: 'Atribuição inicial',
      });
    }
    await this.advance(instance.id);
    instance = await this.refreshInstance(instance.id);

    // Notificar o colaborador alvo e os responsáveis das etapas já activas
    if (targetUserId !== initiatedById) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: targetUserId,
        type: 'PROCESS_STARTED',
        message: `O processo "${instance.title ?? process.title}" foi iniciado para si`,
      });
    }
    const notified = new Set<number>([initiatedById, targetUserId]);
    for (const sp of instance.stepProgress) {
      if (sp.status === 'PENDING' && sp.assigneeId && !notified.has(sp.assigneeId)) {
        notified.add(sp.assigneeId);
        await createNotificationSafe(this.prisma, this.logger, {
          userId: sp.assigneeId,
          type: 'PROCESS_TASK_ASSIGNED',
          message: `Nova tarefa atribuída em ${instance.code}: ${instance.title ?? process.title}`,
        });
      }
    }

    return instance;
  }

  private refreshInstance(id: number) {
    return this.prisma.processInstance.findUniqueOrThrow({
      where: { id },
      include: {
        stepProgress: { orderBy: { stepOrder: 'asc' } },
        initiatedBy: { select: { id: true, fullName: true } },
        targetUser: { select: { id: true, fullName: true } },
        process: { select: { id: true, title: true, code: true } },
      },
    });
  }

  private createInstanceRow(a: {
    code: string;
    process: Awaited<ReturnType<ProcessStandardService['findOne']>>;
    processId: number;
    initiatedById: number;
    targetUserId: number;
    dto: StartInstanceDto;
    now: Date;
    dueAt: Date | null;
    sourceEntityType: string | null;
    sourceEntityId: string | null;
    assignments: Map<number, number | null>;
    ready: (order: number) => boolean;
    calendar: WorkCalendarConfig;
    currentResponsibleId: number | null;
    currentStepId: number | null;
    departmentId: number | null;
    unitId: number | null;
  }) {
    const { process, now } = a;
    return this.prisma.processInstance.create({
      data: {
        code: a.code,
        processId: a.processId,
        processVersion: process.version,
        initiatedById: a.initiatedById,
        targetUserId: a.targetUserId,
        status: 'IN_PROGRESS',
        title: a.dto.title?.trim() || process.title,
        description: a.dto.description?.trim() || null,
        priority: a.dto.priority ?? 'NORMAL',
        notes: a.dto.notes,
        sourceModule: a.dto.sourceModule?.trim() || null,
        sourceEntityType: a.sourceEntityType,
        sourceEntityId: a.sourceEntityId,
        currentResponsibleId: a.currentResponsibleId,
        currentStepId: a.currentStepId,
        departmentId: a.departmentId,
        unitId: a.unitId,
        correlationId: a.dto.correlationId?.trim() || null,
        startedAt: now,
        slaDeadline: a.dueAt,
        stepProgress: {
          create: process.steps.map(s => {
            const assigneeId = a.assignments.get(s.id) ?? null;
            const isReady = a.ready(s.order);
            return {
              stepId: s.id,
              stepOrder: s.order,
              status: isReady ? ('PENDING' as const) : ('WAITING' as const),
              startedAt: isReady ? now : null,
              slaDeadline: s.slaHours
                ? addHours(now, s.slaHours, s.calendarMode, a.calendar)
                : null,
              assigneeId,
              assignedAt: assigneeId ? now : null,
              reviewerId: s.reviewerId,
            };
          }),
        },
      },
      include: {
        stepProgress: { orderBy: { stepOrder: 'asc' } },
        initiatedBy: { select: { id: true, fullName: true } },
        targetUser: { select: { id: true, fullName: true } },
        process: { select: { id: true, title: true, code: true } },
      },
    });
  }

  async getInstances(filters: {
    processId?: number;
    status?: string;
    userId?: number;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, processId, status, userId } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.ProcessInstanceWhereInput = {};
    if (processId) where.processId = processId;
    // Achado real: `status` chega como query string livre do controller
    // (nunca validado contra o enum InstanceStatus) e ia directo para
    // where.status — um valor inválido rebentava com "Invalid value
    // provided" (GET 500). Mascarado antes pelo `where: any`.
    if (status) {
      if (!(Object.values(InstanceStatus) as string[]).includes(status)) {
        throw new BadRequestException(
          `status inválido. Valores aceites: ${Object.values(InstanceStatus).join(', ')}`,
        );
      }
      where.status = status as InstanceStatus;
    }
    if (userId) where.OR = [{ initiatedById: userId }, { targetUserId: userId }];

    const [data, total] = await Promise.all([
      this.prisma.read.processInstance.findMany({
        where,
        skip,
        take: limit,
        include: {
          process: { select: { id: true, title: true, code: true, riskLevel: true } },
          initiatedBy: { select: { id: true, fullName: true } },
          targetUser: { select: { id: true, fullName: true } },
          _count: { select: { stepProgress: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.read.processInstance.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getInstanceDetail(instanceId: number, user: CurrentUserData) {
    const inst = await this.prisma.read.processInstance.findUnique({
      where: { id: instanceId },
      include: {
        process: { include: { steps: { orderBy: { order: 'asc' } } } },
        initiatedBy: { select: { id: true, fullName: true } },
        targetUser: { select: { id: true, fullName: true } },
        currentResponsible: { select: { id: true, fullName: true } },
        stepProgress: {
          orderBy: { stepOrder: 'asc' },
          include: {
            completedBy: { select: { id: true, fullName: true } },
            assignee: { select: { id: true, fullName: true } },
            reviewer: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!inst) throw new NotFoundException('Instância não encontrada');
    // A10-7: sem isto, qualquer autenticado lia o detalhe de qualquer
    // instância de processo (RH/disciplinar/onboarding) de qualquer colega.
    const isParticipant =
      String(user.id) === String(inst.targetUserId) ||
      String(user.id) === String(inst.initiatedById);
    // §20: ADMIN/RH/AUDITOR vêem tudo; o GESTOR o seu departamento.
    if (!isParticipant) {
      const department = inst.departmentId
        ? await this.prisma.read.department.findUnique({
            where: { id: inst.departmentId },
            select: { id: true, parentId: true },
          })
        : null;
      if (!inDepartmentScope(user, department)) {
        throw new NotFoundException('Instância não encontrada');
      }
    }
    const now = new Date();
    return {
      ...inst,
      standardStatus: processState(inst),
      stepProgress: inst.stepProgress.map(sp => ({
        ...sp,
        standardStatus: taskState(sp, now),
        overdue: isOverdue(sp, now),
      })),
    };
  }

  async completeStep(
    instanceId: number,
    stepId: number,
    user: CurrentUserData,
    dto: CompleteStepDto,
  ) {
    const userId = user.id;
    const sp = await this.prisma.read.stepProgress.findUnique({
      where: { instanceId_stepId: { instanceId, stepId } },
    });
    if (!sp) throw new NotFoundException('Passo não encontrado nesta instância');
    if (sp.status === 'COMPLETED') throw new ConflictException('Passo já concluído');

    const instance = await this.prisma.read.processInstance.findUnique({
      where: { id: instanceId },
      select: {
        targetUserId: true,
        status: true,
        code: true,
        initiatedById: true,
        priority: true,
        sourceModule: true,
        targetUser: { select: { departmentId: true } },
      },
    });
    if (!instance) throw new NotFoundException('Instância não encontrada');

    const step = await this.prisma.read.processStep.findUnique({ where: { id: stepId } });

    // A10-7: sem isto, qualquer autenticado podia completar (forjar
    // aprovação de) o passo de qualquer instância de processo.
    const isResponsible =
      String(userId) === String(instance.targetUserId) ||
      (sp.assigneeId != null && String(userId) === String(sp.assigneeId)) ||
      (step?.responsibleId != null && String(userId) === String(step.responsibleId));
    if (!isResponsible && !isPrivileged(user, PROCESS_PRIVILEGED_ROLES)) {
      throw new NotFoundException('Passo não encontrado nesta instância');
    }

    // §6: só se conclui uma tarefa activa, de uma instância em execução.
    if (['ON_HOLD', 'CANCELLED', 'COMPLETED'].includes(instance.status)) {
      throw new BadRequestException(`A instância está ${instance.status} — não aceita conclusões`);
    }
    if (!COMPLETABLE_STATUSES.includes(sp.status)) {
      throw new BadRequestException(
        sp.status === 'WAITING'
          ? 'Esta tarefa aguarda a conclusão das etapas de que depende'
          : sp.status === 'BLOCKED'
            ? `Tarefa bloqueada${sp.blockedReason ? `: ${sp.blockedReason}` : ''} — desbloqueie-a primeiro`
            : `Tarefa em estado ${sp.status} não pode ser concluída`,
      );
    }

    // §7: as etapas de aprovação decidem-se na aba Aprovações (não se "concluem" à mão).
    if (step?.type === 'REVIEW') {
      const open = await this.prisma.read.processApproval.count({
        where: { instanceId, stepId, status: { in: [...OPEN_APPROVAL_STATUSES] } },
      });
      if (open > 0) {
        throw new BadRequestException(
          'Esta etapa de aprovação é decidida na aba Aprovações pelo aprovador designado',
        );
      }
    }

    // Requisitos obrigatórios (§6): evidência e checklist completa.
    const evidenceIds = dto.evidenceIds?.length ? dto.evidenceIds : (sp.evidenceIds ?? []);
    if (step?.requiresUpload && evidenceIds.length === 0) {
      throw new BadRequestException('Esta etapa requer upload de evidência');
    }
    const checklistDone = [...new Set([...(sp.checklistDone ?? []), ...(dto.checklistDone ?? [])])];
    const missing = (step?.checklist ?? []).filter(item => !checklistDone.includes(item));
    if (missing.length > 0) {
      throw new BadRequestException(`Checklist incompleta: falta ${missing.join('; ')}`);
    }

    // §11: documentos obrigatórios desta etapa têm de estar validados.
    const pendingDocs = await this.prisma.read.processDocument.findMany({
      where: {
        instanceId,
        stepId,
        required: true,
        archivedAt: null,
        validationStatus: { not: 'APPROVED' },
      },
      select: { name: true, validationStatus: true },
    });
    if (pendingDocs.length > 0) {
      throw new BadRequestException(
        `Documentos obrigatórios por validar: ${pendingDocs.map(d => d.name).join('; ')}`,
      );
    }

    // §8: dados obrigatórios e condições para avançar.
    let previousForm: Record<string, unknown> = {};
    try {
      previousForm = sp.formData ? (JSON.parse(sp.formData) as Record<string, unknown>) : {};
    } catch {
      previousForm = {};
    }
    const mergedForm = { ...previousForm, ...(dto.formData ?? {}) };
    const missingData = (step?.requiredData ?? []).filter(k => {
      const v = mergedForm[k];
      return v === undefined || v === null || v === '';
    });
    if (missingData.length > 0) {
      throw new BadRequestException(`Dados obrigatórios em falta: ${missingData.join(', ')}`);
    }
    const exit = parseConditionSet(step?.exitConditions);
    if (exit && exit !== 'invalid') {
      const all = await this.prisma.read.stepProgress.findMany({
        where: { instanceId },
        select: { stepOrder: true, status: true, result: true, action: true, formData: true },
      });
      const ctx = buildConditionContext({
        priority: instance.priority,
        sourceModule: instance.sourceModule,
        status: instance.status,
        targetDepartmentId: instance.targetUser.departmentId,
        progress: all.map(p =>
          p.stepOrder === sp.stepOrder
            ? { ...p, result: dto.result ?? p.result, action: dto.action ?? p.action }
            : p,
        ),
        extraForm: mergedForm,
      });
      if (!evaluateConditionSet(exit, ctx)) {
        throw new BadRequestException(
          'As condições para avançar desta etapa não estão satisfeitas',
        );
      }
    }

    const updated = await this.prisma.stepProgress.update({
      where: { instanceId_stepId: { instanceId, stepId } },
      data: {
        status: 'COMPLETED',
        completedById: userId,
        completedAt: new Date(),
        notes: dto.notes,
        result: dto.result,
        checklistDone,
        formData: dto.formData ? JSON.stringify(dto.formData) : null,
        action: dto.action,
        evidenceIds,
        returnReason: null,
        duration: sp.startedAt
          ? Math.round((Date.now() - new Date(sp.startedAt).getTime()) / 60000)
          : null,
      },
    });

    // Activa as etapas cujas dependências ficaram satisfeitas e fecha a instância.
    await this.runStepActions(instanceId, stepId, step?.successActions);
    const activation = await this.advance(instanceId);

    await this.writeAuditLog({
      instanceId,
      userId,
      action: 'STEP_COMPLETED',
      meta: { stepId, action: dto.action, hasEvidence: evidenceIds.length > 0 },
    });
    await this.emitEvent(
      TriggerType.TASK_COMPLETED,
      instanceId,
      stepId,
      `task.completed:${instanceId}:${stepId}:${updated.returnCount}`,
      { completedById: userId },
    );

    // Revisor (§6) e responsáveis das etapas desbloqueadas.
    const label = instance.code ?? `#${instanceId}`;
    if (sp.reviewerId && sp.reviewerId !== userId) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: sp.reviewerId,
        type: 'PROCESS_TASK_REVIEW',
        message: `A tarefa "${step?.title ?? stepId}" de ${label} aguarda a sua revisão`,
      });
    }
    if (activation.activatedStepIds.length > 0) {
      const next = await this.prisma.stepProgress.findMany({
        where: {
          instanceId,
          stepId: { in: activation.activatedStepIds },
          assigneeId: { not: null },
        },
        select: { assigneeId: true, step: { select: { title: true } } },
      });
      for (const n of next) {
        if (n.assigneeId && n.assigneeId !== userId) {
          await createNotificationSafe(this.prisma, this.logger, {
            userId: n.assigneeId,
            type: 'PROCESS_TASK_ASSIGNED',
            message: `Tarefa "${n.step.title}" de ${label} está pronta para si`,
          });
        }
      }
    }
    if (activation.instanceCompleted) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: instance.initiatedById,
        type: 'PROCESS_COMPLETED',
        message: `O processo ${label} foi concluído`,
      });
    }

    return updated;
  }

  async rejectStep(instanceId: number, stepId: number, user: CurrentUserData, dto: RejectStepDto) {
    const userId = user.id;
    const sp = await this.prisma.read.stepProgress.findUnique({
      where: { instanceId_stepId: { instanceId, stepId } },
    });
    if (!sp) throw new NotFoundException('Passo não encontrado');

    const instance = await this.prisma.read.processInstance.findUnique({
      where: { id: instanceId },
      select: { targetUserId: true },
    });
    if (!instance) throw new NotFoundException('Instância não encontrada');
    const step = await this.prisma.read.processStep.findUnique({ where: { id: stepId } });

    // A10-7: mesma verificação de completeStep — sem isto, qualquer
    // autenticado podia rejeitar (forjar) o passo de qualquer instância.
    const isResponsible =
      String(userId) === String(instance.targetUserId) ||
      (step?.responsibleId != null && String(userId) === String(step.responsibleId));
    if (!isResponsible && !isPrivileged(user, PROCESS_PRIVILEGED_ROLES)) {
      throw new NotFoundException('Passo não encontrado');
    }

    await this.prisma.stepProgress.update({
      where: { instanceId_stepId: { instanceId, stepId } },
      data: {
        status: 'REJECTED',
        notes: dto.reason,
        completedById: userId,
        completedAt: new Date(),
      },
    });

    await this.prisma.processInstance.update({
      where: { id: instanceId },
      data: { status: 'ON_HOLD', suspendedAt: new Date() },
    });
    await this.prisma.processApproval.updateMany({
      where: { instanceId, stepId, status: { in: [...OPEN_APPROVAL_STATUSES] } },
      data: { status: 'CANCELLED' },
    });
    await this.runStepActions(instanceId, stepId, step?.failureActions);

    await this.writeAuditLog({
      instanceId,
      userId,
      action: 'STEP_REJECTED',
      meta: { stepId, reason: dto.reason },
    });

    return { message: 'Passo rejeitado. Instância colocada em espera.' };
  }

  async cancelInstance(instanceId: number, userId: number, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('O cancelamento exige uma justificação');
    }
    const inst = await this.prisma.read.processInstance.findUnique({ where: { id: instanceId } });
    if (!inst) throw new NotFoundException('Instância não encontrada');
    if (inst.status === 'COMPLETED') throw new ForbiddenException('Instância já concluída');
    if (inst.status === 'CANCELLED') throw new ConflictException('Instância já cancelada');

    await this.prisma.processInstance.update({
      where: { id: instanceId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason.trim(),
        currentResponsibleId: null,
      },
    });
    // O histórico das etapas concluídas mantém-se; as restantes ficam canceladas.
    await this.prisma.stepProgress.updateMany({
      where: { instanceId, status: { notIn: ['COMPLETED', 'SKIPPED', 'CANCELLED'] } },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.processApproval.updateMany({
      where: { instanceId, status: { in: [...OPEN_APPROVAL_STATUSES] } },
      data: { status: 'CANCELLED' },
    });

    await this.writeAuditLog({
      instanceId,
      userId,
      action: 'INSTANCE_CANCELLED',
      meta: { reason: reason.trim() },
    });
    await this.emitEvent(
      TriggerType.PROCESS_CANCELLED,
      instanceId,
      undefined,
      `process.cancelled:${instanceId}`,
    );
    return { message: 'Instância cancelada com sucesso' };
  }

  // ─── MINHAS TAREFAS ───────────────────────────────────────────────────────

  async getMyTasks(userId: number) {
    const tasks = await this.prisma.read.stepProgress.findMany({
      where: {
        OR: [
          { assigneeId: userId },
          { instance: { targetUserId: userId } },
          { step: { responsibleId: userId } },
        ],
        status: { in: [...ACTIVE_TASK_STATUSES] },
        instance: { status: 'IN_PROGRESS' },
      },
      include: {
        instance: {
          include: {
            process: { select: { id: true, title: true, code: true, riskLevel: true } },
            targetUser: { select: { id: true, fullName: true } },
          },
        },
        step: true,
      },
      orderBy: { slaDeadline: 'asc' },
    });

    return tasks.map(t => ({
      ...t,
      isOverdue: t.slaDeadline ? new Date() > new Date(t.slaDeadline) : false,
    }));
  }

  // ─── DASHBOARD / MÉTRICAS ─────────────────────────────────────────────────

  async getDashboard(filters: ProcessDashboardFilterDto = {}) {
    const [
      totalActive,
      totalDraft,
      totalReview,
      instancesInProgress,
      instancesCompleted,
      overdueSteps,
    ] = await Promise.all([
      this.prisma.read.processStandard.count({ where: { status: 'ACTIVE' } }),
      this.prisma.read.processStandard.count({ where: { status: 'DRAFT' } }),
      this.prisma.read.processStandard.count({ where: { status: 'IN_REVIEW' } }),
      this.prisma.read.processInstance.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.read.processInstance.count({ where: { status: 'COMPLETED' } }),
      this.prisma.read.stepProgress.count({
        where: { status: 'PENDING', slaDeadline: { lt: new Date() } },
      }),
    ]);

    const recentInstances = await this.prisma.read.processInstance.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' },
      include: {
        process: { select: { title: true, code: true } },
        targetUser: { select: { fullName: true } },
      },
    });

    const overview = await this.getOverview(filters, totalReview);

    return {
      processes: { active: totalActive, draft: totalDraft, inReview: totalReview },
      instances: { inProgress: instancesInProgress, completed: instancesCompleted },
      compliance: { overdueSteps, slaComplianceRate: overdueSteps === 0 ? 100 : null },
      recentInstances,
      // docs/Modulo_Processes.md §3 — filtrável; as chaves acima mantêm-se
      // porque o dashboard institucional as consome.
      ...overview,
    };
  }

  // Visão Geral (§3): KPIs + gráficos sobre as instâncias que cumprem os
  // filtros. Tecto de 5000 linhas (mais recentes) para limitar a agregação
  // em memória — `truncated` avisa a UI quando é atingido.
  private async getOverview(filters: ProcessDashboardFilterDto, pendingTemplateReviews: number) {
    const { from, to, departmentId, unitId, responsibleId, category, status } = filters;
    const LIMIT = 5000;

    const startedAt: Prisma.DateTimeFilter = {};
    if (from) startedAt.gte = new Date(from);
    if (to) {
      // `to` inclusivo: um YYYY-MM-DD sem hora vira o fim desse dia.
      const end = new Date(to);
      if (!to.includes('T')) end.setUTCHours(23, 59, 59, 999);
      startedAt.lte = end;
    }

    const processWhere: Prisma.ProcessStandardWhereInput = {};
    if (departmentId) processWhere.departmentId = departmentId;
    if (unitId) processWhere.department = { unitId };
    if (category) processWhere.category = category;

    const where: Prisma.ProcessInstanceWhereInput = {};
    if (from || to) where.startedAt = startedAt;
    if (status) where.status = status;
    if (Object.keys(processWhere).length) where.process = processWhere;
    if (responsibleId) {
      where.stepProgress = { some: { step: { responsibleId } } };
    }

    const [instances, steps, departments, units, categories, responsibles] = await Promise.all([
      this.prisma.read.processInstance.findMany({
        where,
        take: LIMIT,
        orderBy: { startedAt: 'desc' },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
          slaDeadline: true,
          sourceModule: true,
          process: {
            select: { category: true, department: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.read.stepProgress.findMany({
        where: {
          instance: where,
          ...(responsibleId ? { step: { responsibleId } } : {}),
        },
        take: LIMIT,
        orderBy: { id: 'desc' },
        select: {
          status: true,
          slaDeadline: true,
          completedAt: true,
          step: {
            select: {
              id: true,
              title: true,
              type: true,
              responsible: { select: { id: true, fullName: true } },
            },
          },
        },
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
      this.prisma.read.processStandard.findMany({
        where: { category: { not: null } },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
      this.prisma.read.user.findMany({
        where: { processStepsOwned: { some: {} } },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    return {
      ...buildOverview(instances, steps, pendingTemplateReviews),
      truncated: instances.length >= LIMIT,
      filterOptions: {
        departments,
        units,
        categories: categories.map(c => c.category).filter((c): c is string => !!c),
        responsibles,
      },
    };
  }

  // ─── AUDIT LOGS ───────────────────────────────────────────────────────────

  async getAuditLogs(processId?: number, instanceId?: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where: Prisma.ProcessAuditLogWhereInput = {};
    if (processId) where.processId = processId;
    if (instanceId) where.instanceId = instanceId;

    const [data, total] = await Promise.all([
      this.prisma.read.processAuditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.processAuditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ─── QR CODE URL ──────────────────────────────────────────────────────────

  async getQRCodeUrl(id: number) {
    const p = await this.findOne(id);
    const url = `${process.env.APP_URL}/processes/${p.id}`;
    return { url, code: p.code, title: p.title };
  }

  // ─── REMOVER ─────────────────────────────────────────────────────────────

  async remove(id: number, userId: number) {
    const p = await this.findOne(id);
    if (p.status === 'ACTIVE') {
      throw new ForbiddenException('Processo activo não pode ser eliminado. Archive-o primeiro.');
    }

    // ProcessInstance/ProcessVersion/ProcessApprovalLog apontam para
    // ProcessStandard com ON DELETE RESTRICT (só ProcessStep tem Cascade) —
    // um processo DRAFT/ARCHIVED pode perfeitamente já ter passado por
    // new-version (ProcessVersion), por um ciclo de revisão rejeitado
    // (ProcessApprovalLog) ou ter tido instâncias enquanto esteve ACTIVE
    // antes de ser arquivado — sem este guard, eliminar rebentava com uma
    // violação de FK em bruto (500) em vez de um 4xx limpo.
    const [instanceCount, versionCount, approvalCount] = await Promise.all([
      this.prisma.processInstance.count({ where: { processId: id } }),
      this.prisma.processVersion.count({ where: { processId: id } }),
      this.prisma.processApprovalLog.count({ where: { processId: id } }),
    ]);
    if (instanceCount > 0 || versionCount > 0 || approvalCount > 0) {
      throw new BadRequestException(
        'Processo não pode ser eliminado: possui instâncias, versões ou histórico de aprovação associados',
      );
    }

    await this.prisma.processStandard.delete({ where: { id } });
    await this.writeAuditLog({ processId: id, userId, action: 'DELETED' });
    return { message: 'Processo eliminado' };
  }
}
