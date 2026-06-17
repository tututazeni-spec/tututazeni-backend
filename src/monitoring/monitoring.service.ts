import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOkrCycleDto,
  CreateObjectiveDto,
  CreateKeyResultDto,
  UpdateKeyResultDto,
  CreateIndicatorDto,
  CreateRecordDto,
  CreateEvalCycleDto,
  SubmitEvaluationDto,
} from './dto';

@Injectable()
export class MonitoringService {
  constructor(private prisma: PrismaService) {}

  // ════════════════════════════════════════════════════
  // OKRs
  // ════════════════════════════════════════════════════

  async createOkrCycle(dto: CreateOkrCycleDto, userId: number) {
    const { startDate, endDate, ...rest } = dto;
    const cycle = await this.prisma.okrCycle.create({
      data: {
        ...rest,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        createdById: userId,
      },
    });
    await this.audit(userId, 'CREATE', 'OkrCycle', cycle.id, { name: dto.name });
    return cycle;
  }

  async findAllCycles() {
    return this.prisma.okrCycle.findMany({
      where: { deletedAt: null },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { objectives: true } } },
    });
  }

  async createObjective(dto: CreateObjectiveDto, userId: number) {
    const cycle = await this.prisma.okrCycle.findUnique({
      where: { id: dto.cycleId },
    });
    if (!cycle) throw new NotFoundException('Ciclo OKR não encontrado');
    const objective = await this.prisma.objective.create({ data: dto });
    await this.audit(userId, 'CREATE', 'Objective', objective.id, {
      title: dto.title,
    });
    return objective;
  }

  async findObjectives(cycleId: string, ownerId?: number) {
    return this.prisma.objective.findMany({
      where: { cycleId, deletedAt: null, ...(ownerId && { ownerId }) },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { fullName: true } },
        keyResults: { where: { deletedAt: null } },
      },
    });
  }

  async createKeyResult(dto: CreateKeyResultDto, userId: number) {
    const objective = await this.prisma.objective.findUnique({
      where: { id: dto.objectiveId },
    });
    if (!objective) throw new NotFoundException('Objectivo não encontrado');
    const { dueDate, ...rest } = dto;
    const kr = await this.prisma.keyResult.create({
      data: {
        ...rest,
        ...(dueDate && { dueDate: new Date(dueDate) }),
        currentValue: dto.startValue || 0,
      },
    });
    await this.audit(userId, 'CREATE', 'KeyResult', kr.id, { title: dto.title });
    return kr;
  }

  async updateKeyResult(id: string, dto: UpdateKeyResultDto, userId: number) {
    const kr = await this.prisma.keyResult.findUnique({ where: { id } });
    if (!kr) throw new NotFoundException('Key Result não encontrado');

    const range = kr.targetValue - kr.startValue;
    const achieved = dto.newValue - kr.startValue;
    const progress =
      range !== 0 ? Math.max(0, Math.min(100, Math.round((achieved / range) * 100))) : 0;

    const status =
      progress >= 100
        ? 'COMPLETED'
        : progress >= 70
          ? 'ON_TRACK'
          : progress >= 40
            ? 'AT_RISK'
            : 'OFF_TRACK';

    await this.prisma.keyResultUpdate.create({
      data: {
        keyResultId: id,
        previousValue: kr.currentValue,
        newValue: dto.newValue,
        progress,
        notes: dto.notes,
        updatedById: userId,
      },
    });

    const updated = await this.prisma.keyResult.update({
      where: { id },
      data: { currentValue: dto.newValue, progress, status },
    });

    // Recalcula progresso do objectivo (média dos KRs)
    await this.recalcObjectiveProgress(kr.objectiveId);
    await this.audit(userId, 'UPDATE', 'KeyResult', id, {
      newValue: dto.newValue,
      progress,
    });
    return updated;
  }

  private async recalcObjectiveProgress(objectiveId: string) {
    const krs = await this.prisma.keyResult.findMany({
      where: { objectiveId, deletedAt: null },
      select: { progress: true },
    });
    const avg =
      krs.length > 0 ? Math.round(krs.reduce((s, k) => s + k.progress, 0) / krs.length) : 0;
    await this.prisma.objective.update({
      where: { id: objectiveId },
      data: {
        progress: avg,
        status: avg >= 100 ? 'COMPLETED' : 'IN_PROGRESS',
      },
    });
  }

  // ════════════════════════════════════════════════════
  // INDICADORES DE MONITORIA
  // ════════════════════════════════════════════════════

  async createIndicator(dto: CreateIndicatorDto, userId: number) {
    const existing = await this.prisma.monitoringIndicator.findUnique({
      where: { code: dto.code },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Código ${dto.code} já existe`);
    }
    const indicator = await this.prisma.monitoringIndicator.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'MonitoringIndicator', indicator.id, { code: dto.code });
    return indicator;
  }

  async findAllIndicators(page = 1, limit = 20, category?: string) {
    const where = {
      deletedAt: null,
      isActive: true,
      ...(category && { category }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.monitoringIndicator.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { records: true } } },
      }),
      this.prisma.monitoringIndicator.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async addRecord(indicatorId: string, dto: CreateRecordDto, userId: number) {
    const indicator = await this.prisma.monitoringIndicator.findUnique({
      where: { id: indicatorId },
    });
    if (!indicator) throw new NotFoundException('Indicador não encontrado');

    const target = indicator.target;
    const variance = target != null ? dto.value - target : null;
    const variancePct =
      target != null && target !== 0
        ? Math.round(((dto.value - target) / target) * 1000) / 10
        : null;

    const record = await this.prisma.monitoringRecord.create({
      data: {
        indicatorId,
        value: dto.value,
        target,
        variance,
        variancePct,
        period: dto.period,
        date: dto.date ? new Date(dto.date) : new Date(),
        notes: dto.notes,
        recordedById: userId,
      },
    });
    await this.audit(userId, 'CREATE', 'MonitoringRecord', record.id, {
      indicatorId,
      value: dto.value,
      period: dto.period,
    });
    return record;
  }

  async getIndicatorHistory(indicatorId: string) {
    const [indicator, records] = await this.prisma.$transaction([
      this.prisma.monitoringIndicator.findUnique({
        where: { id: indicatorId },
      }),
      this.prisma.monitoringRecord.findMany({
        where: { indicatorId, deletedAt: null },
        orderBy: { date: 'asc' },
        include: { recordedBy: { select: { fullName: true } } },
      }),
    ]);
    if (!indicator) throw new NotFoundException('Indicador não encontrado');
    return { indicator, records };
  }

  // ════════════════════════════════════════════════════
  // AVALIAÇÃO DE DESEMPENHO
  // ════════════════════════════════════════════════════

  async createEvalCycle(dto: CreateEvalCycleDto, userId: number) {
    const { startDate, endDate, ...rest } = dto;
    const cycle = await this.prisma.evaluationCycle.create({
      data: {
        ...rest,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        createdById: userId,
      },
    });
    await this.audit(userId, 'CREATE', 'EvaluationCycle', cycle.id, {
      name: dto.name,
    });
    return cycle;
  }

  async assignEvaluation(
    cycleId: string,
    userId: number,
    evaluatorId: number,
    type: string,
    assignedBy: number,
  ) {
    const existing = await this.prisma.userEvaluation.findUnique({
      where: {
        cycleId_userId_evaluatorId_type: {
          cycleId,
          userId,
          evaluatorId,
          type,
        },
      },
    });
    if (existing) throw new ConflictException('Avaliação já atribuída');

    const evaluation = await this.prisma.userEvaluation.create({
      data: { cycleId, userId, evaluatorId, type },
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: evaluatorId,
        type: 'EVALUATION_ASSIGNED',
        title: 'Nova avaliação atribuída',
        message: 'Foi-te atribuída uma avaliação de desempenho.',
        metadata: JSON.stringify({ evaluationId: evaluation.id, cycleId }),
      },
    });
    await this.audit(assignedBy, 'CREATE', 'UserEvaluation', evaluation.id, {
      cycleId,
      userId,
    });
    return evaluation;
  }

  async submitEvaluation(id: string, dto: SubmitEvaluationDto, evaluatorId: number) {
    const evaluation = await this.prisma.userEvaluation.findUnique({
      where: { id },
    });
    if (!evaluation) throw new NotFoundException('Avaliação não encontrada');

    const isSelf = evaluation.type === 'SELF';
    const updated = await this.prisma.userEvaluation.update({
      where: { id },
      data: {
        ...(isSelf
          ? { selfScore: dto.score, selfFeedback: dto.feedback }
          : { managerScore: dto.score, managerFeedback: dto.feedback }),
        finalScore: dto.score,
        strengths: dto.strengths,
        improvements: dto.improvements,
        developmentPlan: dto.developmentPlan,
        status: 'CLOSED',
        submittedAt: new Date(),
      },
    });
    await this.audit(evaluatorId, 'UPDATE', 'UserEvaluation', id, {
      status: 'CLOSED',
      score: dto.score,
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: evaluation.userId,
        type: 'EVALUATION_COMPLETED',
        title: 'Avaliação concluída',
        message: 'A tua avaliação de desempenho foi concluída.',
        metadata: JSON.stringify({ evaluationId: id }),
      },
    });
    return updated;
  }

  async getMyEvaluations(userId: number) {
    return this.prisma.userEvaluation.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        cycle: { select: { name: true, type: true } },
        evaluator: { select: { fullName: true } },
      },
    });
  }

  async getEvaluationsToComplete(evaluatorId: number) {
    return this.prisma.userEvaluation.findMany({
      where: {
        evaluatorId,
        status: { in: ['PENDING', 'OPEN'] },
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { fullName: true } },
        cycle: { select: { name: true } },
      },
    });
  }

  // ════════════════════════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════════════════════════

  async getDashboard() {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [
      activeCycles,
      totalObjectives,
      completedObjectives,
      activeIndicators,
      recordsThisMonth,
      activeEvalCycles,
      pendingEvaluations,
      completedEvaluations,
    ] = await this.prisma.$transaction([
      this.prisma.okrCycle.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.objective.count({ where: { deletedAt: null } }),
      this.prisma.objective.count({
        where: { status: 'COMPLETED', deletedAt: null },
      }),
      this.prisma.monitoringIndicator.count({
        where: { isActive: true, deletedAt: null },
      }),
      this.prisma.monitoringRecord.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.evaluationCycle.count({
        where: {
          status: { in: ['OPEN', 'SELF_EVAL', 'MANAGER_EVAL'] },
          deletedAt: null,
        },
      }),
      this.prisma.userEvaluation.count({
        where: { status: { in: ['PENDING', 'OPEN'] }, deletedAt: null },
      }),
      this.prisma.userEvaluation.count({
        where: { status: 'CLOSED', deletedAt: null },
      }),
    ]);
    return {
      okrs: {
        activeCycles,
        totalObjectives,
        completedObjectives,
        objectiveCompletionRate:
          totalObjectives > 0 ? Math.round((completedObjectives / totalObjectives) * 100) : 0,
      },
      monitoring: { activeIndicators, recordsThisMonth },
      evaluation: {
        activeEvalCycles,
        pendingEvaluations,
        completedEvaluations,
        evaluationCompletionRate:
          pendingEvaluations + completedEvaluations > 0
            ? Math.round((completedEvaluations / (pendingEvaluations + completedEvaluations)) * 100)
            : 0,
      },
    };
  }

  // ─── HELPER ──────────────────────────────────────────

  private async audit(userId: number, action: string, entity: string, entityId: string, meta: any) {
    // AuditLog.entityId é Int? no schema; os IDs deste módulo são cuid (String),
    // por isso guardamos o id real dentro de metadata (sempre JSON.stringify).
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        metadata: JSON.stringify({ ...meta, entityId }),
      },
    });
  }
}
