import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { MonitoringEvalType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateIndicatorDto,
  CreateRecordDto,
  CreateEvalCycleDto,
  MonitoringSubmitEvaluationDto,
  FilterIndicatorDto,
} from './dto';
import { AuditService } from '../common/services/audit.service';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    await this.audit.logEntity(userId, 'CREATE', 'MonitoringIndicator', indicator.id, {
      code: dto.code,
    });
    return indicator;
  }

  async findAllIndicators(filters: FilterIndicatorDto) {
    const { page = 1, limit = 20, category } = filters;
    const where = {
      deletedAt: null,
      isActive: true,
      ...(category && { category }),
    };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.monitoringIndicator.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { records: true } } },
      }),
      this.prisma.read.monitoringIndicator.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }

  async addRecord(indicatorId: string, dto: CreateRecordDto, userId: number) {
    const indicator = await this.prisma.read.monitoringIndicator.findUnique({
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
    await this.audit.logEntity(userId, 'CREATE', 'MonitoringRecord', record.id, {
      indicatorId,
      value: dto.value,
      period: dto.period,
    });
    return record;
  }

  async getIndicatorHistory(indicatorId: string) {
    const [indicator, records] = await Promise.all([
      this.prisma.read.monitoringIndicator.findUnique({
        where: { id: indicatorId },
      }),
      this.prisma.read.monitoringRecord.findMany({
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
    await this.audit.logEntity(userId, 'CREATE', 'EvaluationCycle', cycle.id, {
      name: dto.name,
    });
    return cycle;
  }

  async assignEvaluation(
    cycleId: string,
    userId: number,
    evaluatorId: number,
    type: MonitoringEvalType,
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
    await createNotificationSafe(this.prisma, this.logger, {
      userId: evaluatorId,
      type: 'EVALUATION_ASSIGNED',
      title: 'Nova avaliação atribuída',
      message: 'Foi-te atribuída uma avaliação de desempenho.',
      metadata: { evaluationId: evaluation.id, cycleId },
    });
    await this.audit.logEntity(assignedBy, 'CREATE', 'UserEvaluation', evaluation.id, {
      cycleId,
      userId,
    });
    return evaluation;
  }

  async submitEvaluation(id: string, dto: MonitoringSubmitEvaluationDto, user: CurrentUserData) {
    const evaluation = await this.prisma.read.userEvaluation.findUnique({
      where: { id },
    });
    if (!evaluation) throw new NotFoundException('Avaliação não encontrada');

    // Ownership (A3): dois donos possíveis consoante o tipo — em SELF só o
    // próprio (userId) submete; nos restantes tipos só o avaliador
    // (evaluatorId) submete. ADMIN/RH têm sempre acesso. Verificação manual
    // porque assertCanAccess só suporta um único ownerId.
    const isSelf = evaluation.type === 'SELF';
    const expectedOwnerId = isSelf ? evaluation.userId : evaluation.evaluatorId;
    if (String(user.id) !== String(expectedOwnerId) && !isPrivileged(user, [Role.ADMIN, Role.RH])) {
      throw new NotFoundException('Avaliação não encontrada');
    }
    const evaluatorId = user.id;
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
    await this.audit.logEntity(evaluatorId, 'UPDATE', 'UserEvaluation', id, {
      status: 'CLOSED',
      score: dto.score,
    });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: evaluation.userId,
      type: 'EVALUATION_COMPLETED',
      title: 'Avaliação concluída',
      message: 'A tua avaliação de desempenho foi concluída.',
      metadata: { evaluationId: id },
    });
    return updated;
  }

  async getMyEvaluations(userId: number) {
    return this.prisma.read.userEvaluation.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        cycle: { select: { name: true, type: true } },
        evaluator: { select: { fullName: true } },
      },
    });
  }

  async getEvaluationsToComplete(evaluatorId: number) {
    return this.prisma.read.userEvaluation.findMany({
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
      activeIndicators,
      recordsThisMonth,
      activeEvalCycles,
      pendingEvaluations,
      completedEvaluations,
    ] = await Promise.all([
      this.prisma.read.monitoringIndicator.count({
        where: { isActive: true, deletedAt: null },
      }),
      this.prisma.read.monitoringRecord.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.read.evaluationCycle.count({
        where: {
          status: { in: ['OPEN', 'SELF_EVAL', 'MANAGER_EVAL'] },
          deletedAt: null,
        },
      }),
      this.prisma.read.userEvaluation.count({
        where: { status: { in: ['PENDING', 'OPEN'] }, deletedAt: null },
      }),
      this.prisma.read.userEvaluation.count({
        where: { status: 'CLOSED', deletedAt: null },
      }),
    ]);
    return {
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
}
