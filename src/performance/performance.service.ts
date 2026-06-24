import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PerformanceCreateCycleDto,
  CreatePerformanceReviewDto,
  UpdatePerformanceReviewDto,
  SubmitReviewDto,
  CreateGoalDto,
  UpdatePerformanceGoalProgressDto,
  PerformanceCreateFeedbackDto,
  CalibrateReviewDto,
  PerformanceCreateDisputeDto,
  Update9BoxDto,
  PerformanceFilterDto,
  ReviewStatus,
} from './performance.dto';

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CICLOS ───────────────────────────────────────────────────────────────

  async createCycle(dto: PerformanceCreateCycleDto) {
    const goalsW = dto.goalsWeight ?? 40;
    const compW = dto.competenciesWeight ?? 40;
    const behavW = dto.behaviorsWeight ?? 20;
    if (goalsW + compW + behavW !== 100) {
      throw new BadRequestException('A soma dos pesos deve ser 100%');
    }

    return this.prisma.performanceCycle.create({
      data: {
        name: dto.name,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        selfEvalDeadline: dto.selfEvalDeadline ? new Date(dto.selfEvalDeadline) : null,
        managerEvalDeadline: dto.managerEvalDeadline ? new Date(dto.managerEvalDeadline) : null,
        goalsWeight: goalsW,
        competenciesWeight: compW,
        behaviorsWeight: behavW,
        selfBeforeManager: dto.selfBeforeManager ?? true,
        anonymous360: dto.anonymous360 ?? true,
        scoreScale: dto.scoreScale ?? 5,
        status: 'PLANNED',
      },
    });
  }

  async getCycles() {
    return this.prisma.read.performanceCycle.findMany({
      include: { _count: { select: { reviews: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async getCurrentCycle() {
    const now = new Date();
    return this.prisma.read.performanceCycle.findFirst({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: { _count: { select: { reviews: true } } },
    });
  }

  async activateCycle(cycleId: number) {
    const cycle = await this.prisma.performanceCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new NotFoundException('Ciclo não encontrado');
    if (cycle.status !== 'PLANNED')
      throw new BadRequestException('Apenas ciclos em PLANNED podem ser activados');

    await this.prisma.performanceCycle.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'CLOSED' },
    });

    const updated = await this.prisma.performanceCycle.update({
      where: { id: cycleId },
      data: { status: 'ACTIVE' },
    });

    const users = await this.prisma.user.findMany({
      where: { active: true },
      select: { id: true },
    });
    for (const u of users) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: u.id,
            type: 'PERFORMANCE_CYCLE_STARTED',
            message: `O ciclo de avaliação "${cycle.name}" foi iniciado`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return updated;
  }

  // ─── REVIEWS ──────────────────────────────────────────────────────────────

  async findAll(filters: PerformanceFilterDto) {
    const { page = 1, limit = 20, userId, cycleId, status, type } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId) where.userId = userId;
    if (cycleId) where.cycleId = cycleId;
    if (status) where.status = status;
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.read.performanceReview.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, fullName: true, email: true, position: { select: { name: true } } },
          },
          reviewer: { select: { id: true, fullName: true } },
          cycle: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.performanceReview.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const r = await this.prisma.read.performanceReview.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, position: { select: { name: true } } },
        },
        reviewer: { select: { id: true, fullName: true } },
        cycle: true,
        goals: { include: { goal: true } },
        competencyEvals: true,
        calibrationLogs: { orderBy: { createdAt: 'desc' } },
        disputes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!r) throw new NotFoundException('Avaliação não encontrada');
    return r;
  }

  async create(dto: CreatePerformanceReviewDto) {
    const existing = await this.prisma.performanceReview.findFirst({
      where: { userId: dto.userId, cycleId: dto.cycleId, type: dto.type },
    });
    if (existing) throw new ConflictException('Avaliação deste tipo já existe para este ciclo');

    const cycle = await this.prisma.performanceCycle.findUnique({ where: { id: dto.cycleId } });
    if (!cycle) throw new NotFoundException('Ciclo não encontrado');

    const initialStatus = cycle.selfBeforeManager
      ? ReviewStatus.PENDING_SELF
      : ReviewStatus.PENDING_MANAGER;

    const review = await this.prisma.performanceReview.create({
      data: {
        userId: dto.userId,
        cycleId: dto.cycleId,
        type: dto.type,
        reviewerId: dto.reviewerId,
        status: initialStatus,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        cycle: { select: { id: true, name: true } },
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.userId,
          type: 'PERFORMANCE_REVIEW_CREATED',
          message: `Uma avaliação de desempenho foi iniciada para si no ciclo "${cycle.name}"`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return review;
  }

  async update(id: number, dto: UpdatePerformanceReviewDto) {
    const r = await this.findOne(id);
    if ((r as any).status === 'FINALIZED') {
      throw new ForbiddenException('Avaliação finalizada não pode ser editada');
    }
    return this.prisma.performanceReview.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.performanceReview.delete({ where: { id } });
    return { message: 'Avaliação removida' };
  }

  // ─── SUBMETER AVALIAÇÃO ───────────────────────────────────────────────────

  async submitReview(submitterId: number, dto: SubmitReviewDto) {
    const review = (await this.findOne(dto.reviewId)) as any;

    if (review.status === 'FINALIZED') {
      throw new ForbiddenException('Avaliação já finalizada');
    }

    let finalScore = dto.score;

    if (dto.goalEvaluations?.length || dto.competencyEvaluations?.length) {
      const cycle = review.cycle;
      let goalScore = 0;
      let compScore = 0;

      if (dto.goalEvaluations?.length) {
        const totalGoalScore = dto.goalEvaluations.reduce((s, g) => s + g.score, 0);
        goalScore = totalGoalScore / dto.goalEvaluations.length;

        for (const ge of dto.goalEvaluations) {
          await this.prisma.goalEvaluation.upsert({
            where: { reviewId_goalId: { reviewId: dto.reviewId, goalId: ge.goalId } },
            create: {
              reviewId: dto.reviewId,
              goalId: ge.goalId,
              score: ge.score,
              comment: ge.comment,
            },
            update: { score: ge.score, comment: ge.comment },
          });
        }
      }

      if (dto.competencyEvaluations?.length) {
        const totalCompLevel = dto.competencyEvaluations.reduce((s, c) => s + c.evaluatedLevel, 0);
        compScore = (totalCompLevel / dto.competencyEvaluations.length / 5) * 100;

        for (const ce of dto.competencyEvaluations) {
          await this.prisma.competencyEvaluation.upsert({
            where: {
              reviewId_competencyId: { reviewId: dto.reviewId, competencyId: ce.competencyId },
            },
            create: {
              reviewId: dto.reviewId,
              competencyId: ce.competencyId,
              evaluatedLevel: ce.evaluatedLevel,
              feedback: ce.feedback,
            },
            update: { evaluatedLevel: ce.evaluatedLevel, feedback: ce.feedback },
          });
        }
      }

      const gW = (cycle.goalsWeight ?? 40) / 100;
      const cW = (cycle.competenciesWeight ?? 40) / 100;
      const bW = (cycle.behaviorsWeight ?? 20) / 100;
      finalScore = goalScore * gW + compScore * cW + (dto.score ?? 0) * bW;
      finalScore = Math.round(finalScore * 10) / 10;
    }

    const scale = (review.cycle?.scoreScale ?? 5) * 20;
    const scoreNorm = ((finalScore ?? 0) / scale) * 100;
    let category: string;
    if (scoreNorm >= 75) category = 'HIGH';
    else if (scoreNorm >= 45) category = 'MEDIUM';
    else category = 'LOW';

    const threshold = review.cycle?.scoreScale ?? 5;
    const isExtreme = (finalScore ?? 0) <= 1 || (finalScore ?? 0) >= threshold;
    if (isExtreme && !dto.justification) {
      throw new BadRequestException('Justificativa obrigatória para scores extremos');
    }

    const nextStatus =
      review.type === 'SELF' ? ReviewStatus.PENDING_MANAGER : ReviewStatus.CALIBRATION;

    const updated = await this.prisma.performanceReview.update({
      where: { id: dto.reviewId },
      data: {
        score: finalScore,
        potentialScore: dto.potentialScore,
        feedback: dto.feedback,
        justification: dto.justification,
        category,
        status: nextStatus,
        submittedAt: new Date(),
      },
    });

    if (review.type === 'SELF') {
      const user = await this.prisma.user.findUnique({
        where: { id: review.userId },
        select: { managerId: true, fullName: true },
      });
      if (user?.managerId) {
        await this.prisma.notificationLog
          .create({
            data: {
              userId: user.managerId,
              type: 'SELF_REVIEW_COMPLETED',
              message: `${user.fullName} concluiu a autoavaliação. A sua avaliação está pendente.`,
              metadata: JSON.stringify({}),
            },
          })
          .catch(() => {});
      }
    }

    return updated;
  }

  // ─── GOALS ────────────────────────────────────────────────────────────────

  async createGoal(dto: CreateGoalDto) {
    const cycle = await this.prisma.performanceCycle.findUnique({ where: { id: dto.cycleId } });
    if (!cycle) throw new NotFoundException('Ciclo não encontrado');

    return this.prisma.performanceGoal.create({
      data: {
        userId: dto.userId,
        cycleId: dto.cycleId,
        title: dto.title,
        description: dto.description,
        targetValue: dto.targetValue,
        currentValue: dto.currentValue ?? 0,
        weight: dto.weight ?? 100,
        unit: dto.unit,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: 'ON_TRACK',
        progress: 0,
      },
    });
  }

  async updateGoalProgress(goalId: number, userId: number, dto: UpdatePerformanceGoalProgressDto) {
    const goal = await this.prisma.performanceGoal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException('Goal não encontrado');
    if ((goal as any).userId !== userId) throw new ForbiddenException('Sem permissão');

    const progress = Math.min(
      100,
      Math.round((dto.currentValue / ((goal as any).targetValue || 1)) * 100),
    );

    let status = 'ON_TRACK';
    if (progress >= 100) status = 'COMPLETED';
    else if (progress < 25) status = 'OFF_TRACK';
    else if (progress < 60) status = 'AT_RISK';

    return this.prisma.performanceGoal.update({
      where: { id: goalId },
      data: { currentValue: dto.currentValue, progress, status, notes: dto.notes },
    });
  }

  async getUserGoals(userId: number, cycleId?: number) {
    const where: any = { userId };
    if (cycleId) where.cycleId = cycleId;
    return this.prisma.read.performanceGoal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── FEEDBACK CONTÍNUO ────────────────────────────────────────────────────

  async createFeedback(giverId: number, dto: PerformanceCreateFeedbackDto) {
    const feedback = await (this.prisma as any).continuousFeedback.create({
      data: {
        giverId: giverId,
        userId: dto.targetUserId,
        type: dto.type,
        message: dto.message,
        visibleToUser: dto.visibleToUser ?? true,
        cycleId: dto.cycleId,
      },
    });

    if (dto.visibleToUser) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: dto.targetUserId,
            type: 'FEEDBACK_RECEIVED',
            message: `Recebeu um feedback do tipo ${dto.type}`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return feedback;
  }

  async getUserFeedback(userId: number, cycleId?: number) {
    const where: any = { userId, visibleToUser: true };
    if (cycleId) where.cycleId = cycleId;
    return this.prisma.read.continuousFeedback.findMany({
      where,
      include: {
        giver: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── CALIBRAÇÃO ───────────────────────────────────────────────────────────

  async calibrateReview(calibratorId: number, dto: CalibrateReviewDto) {
    const review = (await this.findOne(dto.reviewId)) as any;
    if (review.status !== 'CALIBRATION') {
      throw new BadRequestException('Avaliação não está em fase de calibração');
    }

    const previousScore = review.score;

    await this.prisma.performanceReview.update({
      where: { id: dto.reviewId },
      data: {
        score: dto.calibratedScore,
        category: dto.category ?? review.category,
        status: ReviewStatus.PUBLISHED,
      },
    });

    await this.prisma.calibrationLog.create({
      data: {
        reviewId: dto.reviewId,
        calibratorId,
        previousScore,
        calibratedScore: dto.calibratedScore,
        reason: dto.reason,
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: review.userId,
          type: 'PERFORMANCE_PUBLISHED',
          message: `O resultado da sua avaliação de desempenho foi publicado`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return { message: 'Calibração aplicada e avaliação publicada' };
  }

  // ─── DISPUTA ──────────────────────────────────────────────────────────────

  async createDispute(userId: number, dto: PerformanceCreateDisputeDto) {
    const review = (await this.findOne(dto.reviewId)) as any;
    if (review.userId !== userId) throw new ForbiddenException('Sem permissão');
    if (review.status !== 'PUBLISHED') {
      throw new BadRequestException('Apenas avaliações publicadas podem ser contestadas');
    }

    const dispute = await this.prisma.performanceDispute.create({
      data: {
        reviewId: dto.reviewId,
        userId,
        reason: dto.reason,
        evidence: dto.evidence,
        status: 'OPEN',
      },
    });

    await this.prisma.performanceReview.update({
      where: { id: dto.reviewId },
      data: { status: ReviewStatus.DISPUTE },
    });

    const rhUsers = await (this.prisma as any).user.findMany({
      where: { role: { code: { in: ['ADMIN', 'RH'] } } },
      select: { id: true },
    });
    for (const rh of rhUsers) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: rh.id,
            type: 'PERFORMANCE_DISPUTE',
            message: `Disputa aberta para avaliação #${dto.reviewId}`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return dispute;
  }

  // ─── HISTÓRICO E VISTAS DO UTILIZADOR ────────────────────────────────────

  async getUserHistory(userId: number) {
    const [reviews, goals, feedback] = await Promise.all([
      this.prisma.read.performanceReview.findMany({
        where: { userId },
        include: { cycle: { select: { id: true, name: true, type: true, startDate: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.read.performanceGoal.findMany({
        where: { userId, status: { not: 'COMPLETED' } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      this.prisma.read.continuousFeedback.findMany({
        where: { userId, visibleToUser: true },
        include: { giver: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const avgScore = reviews.length
      ? reviews.reduce((s, r) => s + ((r as any).score ?? 0), 0) / reviews.length
      : 0;

    return { reviews, goals, feedback, avgScore: Math.round(avgScore * 10) / 10 };
  }

  async getTeamPerformance(managerId: number, cycleId?: number) {
    const team = await this.prisma.read.user.findMany({
      where: { managerId, active: true },
      select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } },
    });

    const teamData = await Promise.all(
      team.map(async member => {
        const where: any = { userId: member.id };
        if (cycleId) where.cycleId = cycleId;

        const [latestReview, goals, feedbackCount] = await Promise.all([
          this.prisma.read.performanceReview.findFirst({
            where: { ...where, type: 'MANAGER' },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.read.performanceGoal.findMany({
            where: { userId: member.id, ...(cycleId ? { cycleId } : {}) },
          }),
          this.prisma.read.continuousFeedback.count({ where: { userId: member.id } }),
        ]);

        const avgGoalProgress = goals.length
          ? goals.reduce((s, g) => s + ((g as any).progress ?? 0), 0) / goals.length
          : 0;

        const pendingSelfReview = await this.prisma.read.performanceReview.findFirst({
          where: { ...where, type: 'SELF', status: { in: ['PENDING_SELF'] } },
        });

        return {
          user: member,
          latestReview,
          avgGoalProgress: Math.round(avgGoalProgress),
          goalCount: goals.length,
          feedbackCount,
          pendingSelfReview: !!pendingSelfReview,
          status: latestReview ? (latestReview as any).status : 'NOT_STARTED',
        };
      }),
    );

    return { team: teamData, managerId, total: team.length };
  }

  async getDepartmentStats(departmentId: number, cycleId?: number) {
    const users = await this.prisma.read.user.findMany({
      where: { departmentId, active: true },
      select: { id: true },
    });
    const userIds = users.map((u: any) => u.id);

    const where: any = { userId: { in: userIds } };
    if (cycleId) where.cycleId = cycleId;

    const [stats, categoryDist, avgScore] = await Promise.all([
      this.prisma.read.performanceReview.aggregate({
        where,
        _avg: { score: true },
        _min: { score: true },
        _max: { score: true },
        _count: true,
      }),
      this.prisma.read.performanceReview.groupBy({
        by: ['category'],
        where: { ...where, category: { not: null } },
        _count: true,
      }),
      this.prisma.read.performanceGoal.aggregate({
        where: { userId: { in: userIds }, ...(cycleId ? { cycleId } : {}) },
        _avg: { progress: true },
      }),
    ]);

    return {
      departmentId,
      userCount: users.length,
      reviewCount: stats._count,
      avgScore: Math.round((stats._avg.score ?? 0) * 10) / 10,
      minScore: stats._min.score ?? 0,
      maxScore: stats._max.score ?? 0,
      categoryDistribution: categoryDist,
      avgGoalProgress: Math.round(avgScore._avg.progress ?? 0),
    };
  }

  // ─── 9-BOX ────────────────────────────────────────────────────────────────

  async update9Box(updatedById: number, dto: Update9BoxDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    return this.prisma.nineBoxPlacement.upsert({
      where: { userId_cycleId: { userId: dto.userId, cycleId: dto.cycleId ?? 0 } },
      create: {
        userId: dto.userId,
        cycleId: dto.cycleId,
        performanceAxis: dto.performanceAxis,
        potentialAxis: dto.potentialAxis,
        justification: dto.justification,
        updatedById,
      },
      update: {
        performanceAxis: dto.performanceAxis,
        potentialAxis: dto.potentialAxis,
        justification: dto.justification,
        updatedById,
        updatedAt: new Date(),
      },
    });
  }

  async get9Box(cycleId?: number, departmentId?: number) {
    const placements = await this.prisma.read.nineBoxPlacement.findMany({
      where: { ...(cycleId ? { cycleId } : {}) },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    });

    // Montar grid 3x3
    const grid: Record<string, any[]> = {};
    for (let p = 1; p <= 3; p++) {
      for (let pot = 1; pot <= 3; pot++) {
        grid[`${p}-${pot}`] = [];
      }
    }

    for (const pl of placements) {
      if (!(pl as any).user) continue;
      const key = `${(pl as any).performanceAxis}-${(pl as any).potentialAxis}`;
      if (!grid[key]) continue;
      grid[key].push({ user: (pl as any).user, placement: pl });
    }

    return { grid, cycleId, departmentId };
  } // ← corrigido: fecho de get9Box que estava em falta, causando todos os erros seguintes

  // ─── ANALYTICS ────────────────────────────────────────────────────────────

  async getPerformanceAnalytics(cycleId?: number) {
    const where: any = {};
    if (cycleId) where.cycleId = cycleId;

    const [totalReviews, byStatus, byCategory, avgScores] = await Promise.all([
      this.prisma.read.performanceReview.count({ where }),
      this.prisma.read.performanceReview.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.read.performanceReview.groupBy({
        by: ['category'],
        where: { ...where, category: { not: null } },
        _count: true,
      }),
      this.prisma.read.performanceReview.aggregate({
        where,
        _avg: { score: true },
        _min: { score: true },
        _max: { score: true },
      }),
    ]);

    const topPerformers = await this.prisma.read.performanceReview.findMany({
      where: { ...where, score: { not: null } },
      include: {
        user: { select: { id: true, fullName: true, position: { select: { name: true } } } },
      },
      orderBy: { score: 'desc' },
      take: 5,
    });

    const selfReviews = await this.prisma.read.performanceReview.findMany({
      where: { ...where, type: 'SELF', score: { not: null } },
      select: { userId: true, score: true },
    });
    const mgRviews = await this.prisma.read.performanceReview.findMany({
      where: { ...where, type: 'MANAGER', score: { not: null } },
      select: { userId: true, score: true },
    });

    const selfMap = new Map<number, number>(
      selfReviews.map((r: any) => [r.userId, r.score ?? 0] as [number, number]),
    );
    const divergences = mgRviews
      .map((r: any) => ({
        userId: r.userId,
        divergence: Math.abs((r.score ?? 0) - (selfMap.get(r.userId) ?? 0)),
      }))
      .filter(d => d.divergence >= 1)
      .sort((a, b) => b.divergence - a.divergence)
      .slice(0, 10);

    return {
      totalReviews,
      byStatus,
      byCategory,
      avgScore: Math.round((avgScores._avg.score ?? 0) * 10) / 10,
      minScore: avgScores._min.score,
      maxScore: avgScores._max.score,
      topPerformers,
      highDivergences: divergences,
    };
  }

  async getPeriods() {
    return this.prisma.read.performanceCycle.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, type: true, status: true, startDate: true, endDate: true },
    });
  }
}
