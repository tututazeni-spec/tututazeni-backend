import {
  Injectable, NotFoundException, ConflictException,
  ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';
import {
  CreateProcessDto, UpdateProcessDto, ProcessFilterDto,
  StartInstanceDto, CompleteStepDto, RejectStepDto,
  ApprovalActionDto, ProcessStatus, InstanceStatus, TaskStatus,
} from './process-standard.dto';

@Injectable()
export class ProcessStandardService {
  private readonly logger = new Logger(ProcessStandardService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private nextVersion(current: string): string {
    const parts = current.split('.').map(Number);
    parts[1] = (parts[1] ?? 0) + 1;
    return parts.join('.');
  }

  private hashPayload(payload: object): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async writeAuditLog(opts: {
    processId?: number;
    instanceId?: number;
    userId: number;
    action: string;
    meta?: object;
  }) {
    const payload = { ...opts, ts: new Date().toISOString() };
    try {
      await this.prisma.processAuditLog.create({
        data: {
          processId:  opts.processId,
          instanceId: opts.instanceId,
          userId:     opts.userId,
          action:     opts.action,
          meta:       opts.meta ? JSON.stringify(opts.meta) : null,
          hash:       this.hashPayload(payload),
          createdAt:  new Date(),
        },
      });
    } catch (e: any) {
      this.logger.warn(`Erro: ${e?.message}`);
    }
  }

  // ─── LISTAGEM ─────────────────────────────────────────────────────────────

  async findAll(filters: ProcessFilterDto) {
    const { page = 1, limit = 20, search, status, riskLevel, departmentId, category } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status)       where.status = status;
    if (riskLevel)    where.riskLevel = riskLevel;
    if (departmentId) where.departmentId = departmentId;
    if (category)     where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { code:  { contains: search, mode: 'insensitive' } },
        { tags:  { has: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.processStandard.findMany({
        where, skip, take: limit,
        include: {
          owner:      { select: { id: true, fullName: true } },
          department: { select: { id: true, name: true } },
          _count:     { select: { steps: true, instances: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.processStandard.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── DETALHE ─────────────────────────────────────────────────────────────

  async findOne(id: number) {
    const p = await this.prisma.processStandard.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy:  { order: 'asc' },
          include: {
            responsible: { select: { id: true, fullName: true } },
          },
        },
        owner:      { select: { id: true, fullName: true } },
        department: { select: { id: true, name: true } },
        versions:   { orderBy: { createdAt: 'desc' }, take: 10 },
        _count:     { select: { instances: true } },
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

    const { steps, ...data } = dto;

    const process = await this.prisma.processStandard.create({
      data: {
        ...data,
        ownerId,
        status:  'DRAFT',
        version: '1.0',
        tags:    data.tags ?? [],
        steps: {
          create: steps.map(s => ({
            type:             s.type,
            title:            s.title,
            description:      s.description,
            order:            s.order,
            responsibleId:    s.responsibleId,
            responsibleRole:  s.responsibleRole,
            slaHours:         s.slaHours,
            estimatedMinutes: s.estimatedMinutes,
            formSchema:       s.formSchema ? JSON.stringify(s.formSchema) : null,
            exitConditions:   s.exitConditions ? JSON.stringify(s.exitConditions) : null,
            requiresUpload:   s.requiresUpload ?? false,
            checklist:        s.checklist ?? [],
          })),
        },
      },
      include: {
        steps:  { orderBy: { order: 'asc' } },
        owner:  { select: { id: true, fullName: true } },
      },
    });

    await this.writeAuditLog({ processId: process.id, userId: ownerId, action: 'CREATED', meta: { code: dto.code, version: '1.0' } });

    return process;
  }

  // ─── ACTUALIZAR ────────────────────────────────────────────────────────────

  async update(id: number, dto: UpdateProcessDto, updatedById: number) {
    const existing = await this.findOne(id);

    if (existing.status === 'ACTIVE') {
      throw new ForbiddenException('Processo activo não pode ser editado directamente. Crie uma nova versão.');
    }

    if (dto.code && dto.code !== existing.code) {
      const codeExists = await this.prisma.processStandard.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (codeExists) throw new ConflictException(`Código ${dto.code} já em uso`);
    }

    const { steps, ...data } = dto;

    await this.prisma.processStandard.update({
      where: { id },
      data: {
        ...data,
        tags: data.tags ?? undefined,
      },
    });

    if (steps?.length) {
      await this.prisma.processStep.deleteMany({ where: { processId: id } });
      await this.prisma.processStep.createMany({
        data: steps.map(s => ({
          processId:        id,
          type:             s.type,
          title:            s.title,
          description:      s.description,
          order:            s.order,
          responsibleId:    s.responsibleId,
          responsibleRole:  s.responsibleRole,
          slaHours:         s.slaHours,
          estimatedMinutes: s.estimatedMinutes,
          formSchema:       s.formSchema ? JSON.stringify(s.formSchema) : null,
          exitConditions:   s.exitConditions ? JSON.stringify(s.exitConditions) : null,
          requiresUpload:   s.requiresUpload ?? false,
          checklist:        s.checklist ?? [],
        })),
      });
    }

    await this.writeAuditLog({ processId: id, userId: updatedById, action: 'UPDATED', meta: { fields: Object.keys(dto) } });

    return this.findOne(id);
  }

  // ─── NOVA VERSÃO ──────────────────────────────────────────────────────────

  async createNewVersion(id: number, userId: number) {
    const existing = await this.findOne(id);

    // Guardar snapshot da versão actual
    await this.prisma.processVersion.create({
      data: {
        processId: id,
        version:   existing.version,
        snapshot:  JSON.stringify(existing),
        createdById: userId,
      },
    });

    const newVersion = this.nextVersion(existing.version);

    const updated = await this.prisma.processStandard.update({
      where: { id },
      data: {
        version: newVersion,
        status:  'DRAFT',
      },
    });

    await this.writeAuditLog({ processId: id, userId, action: 'NEW_VERSION', meta: { from: existing.version, to: newVersion } });

    return updated;
  }

  // ─── WORKFLOW DE APROVAÇÃO ────────────────────────────────────────────────

  async submitForReview(id: number, userId: number) {
    const p = await this.findOne(id);
    if (p.status !== 'DRAFT') {
      throw new BadRequestException('Apenas processos em DRAFT podem ser submetidos para revisão');
    }
    if ((p.steps as any[]).length === 0) {
      throw new BadRequestException('Processo sem etapas não pode ser submetido');
    }

    const updated = await this.prisma.processStandard.update({
      where: { id },
      data: { status: 'IN_REVIEW' },
    });

    await this.writeAuditLog({ processId: id, userId, action: 'SUBMITTED_FOR_REVIEW' });

    // Notificar aprovadores
    await this.prisma.notificationLog.create({
      data: {
        userId: (p as any).ownerId,
        type: 'PROCESS_REVIEW_REQUESTED',
        message: `Processo ${p.code} submetido para revisão`,
        metadata: { processId: id },
      },
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
        status:     newStatus,
        publishedAt: dto.action === 'approve' ? new Date() : undefined,
      },
    });

    await this.prisma.processApprovalLog.create({
      data: {
        processId: id,
        userId,
        action:    dto.action.toUpperCase(),
        comment:   dto.comment,
        status:    newStatus,
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

  // ─── COMPARAR VERSÕES ─────────────────────────────────────────────────────

  async compareVersions(id: number, versionA: string, versionB: string) {
    const versions = await this.prisma.processVersion.findMany({
      where: { processId: id, version: { in: [versionA, versionB] } },
    });

    if (versions.length < 2) {
      throw new NotFoundException('Uma ou ambas as versões não encontradas');
    }

    const a = JSON.parse((versions.find(v => v.version === versionA) as any).snapshot);
    const b = JSON.parse((versions.find(v => v.version === versionB) as any).snapshot);

    const diffFields = (obj1: any, obj2: any) => {
      const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
      const diff: any = {};
      for (const k of keys) {
        if (JSON.stringify(obj1[k]) !== JSON.stringify(obj2[k])) {
          diff[k] = { a: obj1[k], b: obj2[k] };
        }
      }
      return diff;
    };

    return {
      versionA, versionB,
      fieldDiffs: diffFields(a, b),
      stepsA: a.steps ?? [],
      stepsB: b.steps ?? [],
    };
  }

  // ─── INSTÂNCIAS ────────────────────────────────────────────────────────────

  async startInstance(processId: number, initiatedById: number, dto: StartInstanceDto) {
    const process = await this.findOne(processId);

    if (process.status !== 'ACTIVE') {
      throw new BadRequestException('Apenas processos activos podem ser instanciados');
    }

    const instance = await this.prisma.processInstance.create({
      data: {
        processId,
        processVersion: process.version,
        initiatedById,
        targetUserId:   dto.targetUserId,
        status:         'IN_PROGRESS',
        notes:          dto.notes,
        startedAt:      new Date(),
        slaDeadline:    process.defaultSlaHours
          ? new Date(Date.now() + process.defaultSlaHours * 3600 * 1000)
          : null,
        stepProgress: {
          create: (process.steps as any[]).map((s, idx) => ({
            stepId:   s.id,
            stepOrder: s.order,
            status:   idx === 0 ? 'PENDING' : 'WAITING',
            slaDeadline: s.slaHours
              ? new Date(Date.now() + s.slaHours * 3600 * 1000)
              : null,
          })),
        },
      },
      include: {
        stepProgress: { orderBy: { stepOrder: 'asc' } },
        initiatedBy:  { select: { id: true, fullName: true } },
        targetUser:   { select: { id: true, fullName: true } },
        process:      { select: { id: true, title: true, code: true } },
      },
    });

    await this.writeAuditLog({
      processId,
      instanceId: instance.id,
      userId: initiatedById,
      action: 'INSTANCE_STARTED',
      meta: { targetUserId: dto.targetUserId, version: process.version },
    });

    // Notificar o colaborador alvo
    await this.prisma.notificationLog.create({
      data: {
        userId: dto.targetUserId,
        type: 'PROCESS_STARTED',
        message: `O processo "${process.title}" foi iniciado para si`,
        metadata: { instanceId: instance.id, processId },
      },
    });

    return instance;
  }

  async getInstances(filters: { processId?: number; status?: string; userId?: number; page?: number; limit?: number }) {
    const { page = 1, limit = 20, processId, status, userId } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (processId) where.processId = processId;
    if (status)    where.status = status;
    if (userId)    where.OR = [{ initiatedById: userId }, { targetUserId: userId }];

    const [data, total] = await Promise.all([
      this.prisma.processInstance.findMany({
        where, skip, take: limit,
        include: {
          process:     { select: { id: true, title: true, code: true, riskLevel: true } },
          initiatedBy: { select: { id: true, fullName: true } },
          targetUser:  { select: { id: true, fullName: true } },
          _count:      { select: { stepProgress: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.processInstance.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getInstanceDetail(instanceId: number) {
    const inst = await this.prisma.processInstance.findUnique({
      where: { id: instanceId },
      include: {
        process:     { include: { steps: { orderBy: { order: 'asc' } } } },
        initiatedBy: { select: { id: true, fullName: true } },
        targetUser:  { select: { id: true, fullName: true } },
        stepProgress: {
          orderBy: { stepOrder: 'asc' },
          include: {
            completedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!inst) throw new NotFoundException('Instância não encontrada');
    return inst;
  }

  async completeStep(instanceId: number, stepId: number, userId: number, dto: CompleteStepDto) {
    const sp = await this.prisma.stepProgress.findUnique({
      where: { instanceId_stepId: { instanceId, stepId } },
    });
    if (!sp) throw new NotFoundException('Passo não encontrado nesta instância');
    if (sp.status === 'COMPLETED') throw new ConflictException('Passo já concluído');

    const step = await this.prisma.processStep.findUnique({ where: { id: stepId } });

    // Validar upload obrigatório
    if ((step as any)?.requiresUpload && (!dto.evidenceIds || dto.evidenceIds.length === 0)) {
      throw new BadRequestException('Esta etapa requer upload de evidência');
    }

    const updated = await this.prisma.stepProgress.update({
      where: { instanceId_stepId: { instanceId, stepId } },
      data: {
        status:      'COMPLETED',
        completedById: userId,
        completedAt: new Date(),
        notes:       dto.notes,
        formData:    dto.formData ? JSON.stringify(dto.formData) : null,
        action:      dto.action,
        evidenceIds: dto.evidenceIds ?? [],
        duration:    sp.startedAt
          ? Math.round((Date.now() - new Date(sp.startedAt).getTime()) / 60000)
          : null,
      },
    });

    // Activar próximo passo
    const nextStep = await this.prisma.stepProgress.findFirst({
      where: { instanceId, stepOrder: { gt: sp.stepOrder }, status: 'WAITING' },
      orderBy: { stepOrder: 'asc' },
    });
    if (nextStep) {
      await this.prisma.stepProgress.update({
        where: { id: nextStep.id },
        data: { status: 'PENDING', startedAt: new Date() },
      });
    }

    // Verificar conclusão total
    const pendingCount = await this.prisma.stepProgress.count({
      where: { instanceId, status: { notIn: ['COMPLETED', 'SKIPPED'] } },
    });
    if (pendingCount === 0) {
      await this.prisma.processInstance.update({
        where: { id: instanceId },
        data: {
          status:      'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    await this.writeAuditLog({
      instanceId,
      userId,
      action: 'STEP_COMPLETED',
      meta: { stepId, action: dto.action, hasEvidence: (dto.evidenceIds?.length ?? 0) > 0 },
    });

    return updated;
  }

  async rejectStep(instanceId: number, stepId: number, userId: number, dto: RejectStepDto) {
    const sp = await this.prisma.stepProgress.findUnique({
      where: { instanceId_stepId: { instanceId, stepId } },
    });
    if (!sp) throw new NotFoundException('Passo não encontrado');

    await this.prisma.stepProgress.update({
      where: { instanceId_stepId: { instanceId, stepId } },
      data: { status: 'REJECTED', notes: dto.reason, completedById: userId, completedAt: new Date() },
    });

    await this.prisma.processInstance.update({
      where: { id: instanceId },
      data: { status: 'ON_HOLD' },
    });

    await this.writeAuditLog({ instanceId, userId, action: 'STEP_REJECTED', meta: { stepId, reason: dto.reason } });

    return { message: 'Passo rejeitado. Instância colocada em espera.' };
  }

  async cancelInstance(instanceId: number, userId: number, reason: string) {
    const inst = await this.prisma.processInstance.findUnique({ where: { id: instanceId } });
    if (!inst) throw new NotFoundException('Instância não encontrada');
    if (inst.status === 'COMPLETED') throw new ForbiddenException('Instância já concluída');

    await this.prisma.processInstance.update({
      where: { id: instanceId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });

    await this.writeAuditLog({ instanceId, userId, action: 'INSTANCE_CANCELLED', meta: { reason } });
    return { message: 'Instância cancelada com sucesso' };
  }

  // ─── MINHAS TAREFAS ───────────────────────────────────────────────────────

  async getMyTasks(userId: number) {
    const tasks = await this.prisma.stepProgress.findMany({
      where: {
        OR: [
          { instance: { targetUserId: userId } },
          { step: { responsibleId: userId } },
        ],
        status: 'PENDING',
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

  async getDashboard() {
    const [totalActive, totalDraft, totalReview, instancesInProgress, instancesCompleted, overdueSteps] =
      await Promise.all([
        this.prisma.processStandard.count({ where: { status: 'ACTIVE' } }),
        this.prisma.processStandard.count({ where: { status: 'DRAFT' } }),
        this.prisma.processStandard.count({ where: { status: 'IN_REVIEW' } }),
        this.prisma.processInstance.count({ where: { status: 'IN_PROGRESS' } }),
        this.prisma.processInstance.count({ where: { status: 'COMPLETED' } }),
        this.prisma.stepProgress.count({
          where: { status: 'PENDING', slaDeadline: { lt: new Date() } },
        }),
      ]);

    const avgCycleTime = await this.prisma.processInstance.aggregate({
      where: { status: 'COMPLETED', completedAt: { not: null } },
      _avg: { /* duration field needed */ },
    });

    const recentInstances = await this.prisma.processInstance.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' },
      include: {
        process:    { select: { title: true, code: true } },
        targetUser: { select: { fullName: true } },
      },
    });

    return {
      processes: { active: totalActive, draft: totalDraft, inReview: totalReview },
      instances: { inProgress: instancesInProgress, completed: instancesCompleted },
      compliance: { overdueSteps, slaComplianceRate: overdueSteps === 0 ? 100 : null },
      recentInstances,
    };
  }

  // ─── AUDIT LOGS ───────────────────────────────────────────────────────────

  async getAuditLogs(processId?: number, instanceId?: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (processId)  where.processId = processId;
    if (instanceId) where.instanceId = instanceId;

    const [data, total] = await Promise.all([
      this.prisma.processAuditLog.findMany({
        where, skip, take: limit,
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.processAuditLog.count({ where }),
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
    await this.prisma.processStandard.delete({ where: { id } });
    await this.writeAuditLog({ processId: id, userId, action: 'DELETED' });
    return { message: 'Processo eliminado' };
  }
}
