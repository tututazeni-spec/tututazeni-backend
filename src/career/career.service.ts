// src/career/career.service.ts
import {
  Injectable, NotFoundException, BadRequestException,
  ConflictException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCareerPathDto, UpdateCareerPathDto, AddCareerPathStepDto,
  CreateCareerPlanDto, UpdateCareerPlanDto, AddCareerGoalDto,
  CreateInternalVacancyDto, UpdateInternalVacancyDto,
  ApplyToVacancyDto, UpdateApplicationStatusDto,
  CreateSuccessionPlanDto, CareerInterestDto,
  VacancyFilterDto, CareerAnalyticsFilterDto,
} from './career.dto';

@Injectable()
export class CareerService {
  private readonly logger = new Logger(CareerService.name);

  constructor(private prisma: PrismaService) {}

  // ─── PERFIL DE CARREIRA DO COLABORADOR ───────────────────────────────────

  async getCareerProfile(userId: number) {
    const user = await (this.prisma as any).user.findUnique({
       where: { id: userId },
      include: {
        position:   { select: { id: true, name: true, level: true } },
        department: { select: { id: true, name: true } },
        manager:    { select: { id: true, fullName: true, avatarUrl: true } },
        profile:    true,
        points:     { select: { points: true } },
        userCompetencies: {
          include: { competency: { select: { id: true, name: true, category: true } } },
          orderBy: { currentLevel: 'desc' },
        },
        userCareerPlans: {
          where:   { status: { in: ['ACTIVE', 'DRAFT'] } },
          include: { goals: { orderBy: { createdAt: 'desc' }, take: 5 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        careers: {
          include: { position: { select: { id: true, name: true, level: true } } },
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        certificates: {
          include: { course: { select: { id: true, title: true } } },
          orderBy: { issuedAt: 'desc' },
          take: 10,
        },
        enrollments: {
          where:   { status: 'COMPLETED' },
          include: { course: { select: { id: true, title: true, category: true } } },
          orderBy: { completedAt: 'desc' },
          take: 10,
        },
        performanceReviews: {
          where:   { status: 'SUBMITTED' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, type: true, score: true, feedback: true, createdAt: true },
        },
        successionPlans: {
          include: { position: { select: { id: true, name: true } } },
        },
        badgeAwards: {
          include: { badge: true },
          orderBy: { awardedAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            certificates: true, enrollments: true, userCompetencies: true,
            userCareerPlans: true, badgeAwards: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    // Calcular gap de competências para o cargo atual
    const competencyGaps = await this.getCompetencyGapsForUser(userId);

    // Calcular elegibilidade para promoção
    const promotionEligibility = await this.checkPromotionEligibility(userId);

    // Vaga internas compatíveis (top 3)
    const matchingVacancies = await this.getMatchingVacanciesForUser(userId, 3);

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        hireDate: user.hireDate,
        position: user.position,
        department: user.department,
        manager: user.manager,
        profile: user.profile,
        points: user.points,
      },
      careerPlan: user.userCareerPlans[0] ?? null,
      competencies: user.userCompetencies,
      careerHistory: user.careers,
      certificates: user.certificates,
      completedCourses: user.enrollments,
      performanceHistory: user.performanceReviews,
      successionPlan: user.successionPlans[0] ?? null,
      badges: user.badgeAwards,
      stats: user._count,
      insights: {
        competencyGaps,
        promotionEligibility,
        matchingVacancies,
      },
    };
  }

  // ─── GAP DE COMPETÊNCIAS ──────────────────────────────────────────────────

  async getCompetencyGapsForUser(userId: number) {
    const user = await (this.prisma as any).user.findUnique({
      where:  { id: userId },
      select: { positionId: true },
    });
    if (!user?.positionId) return [];

    const [positionCompetencies, userCompetencies] = await Promise.all([
      this.prisma.positionCompetency.findMany({
        where:   { positionId: user.positionId },
        include: { competency: true },
      }),
      this.prisma.userCompetency.findMany({ where: { userId } }),
    ]);

    const userCompetencyMap = new Map(userCompetencies.map(uc => [uc.competencyId, uc.currentLevel]));

    return positionCompetencies.map(pc => {
      const currentLevel = userCompetencyMap.get(pc.competencyId) ?? 0;
      const gap = pc.requiredLevel - currentLevel;
      return {
        competency:    pc.competency,
        requiredLevel: pc.requiredLevel,
        currentLevel,
        gap,
        status: gap <= 0 ? 'MET' : gap <= 1 ? 'PARTIAL' : 'MISSING',
      };
    }).sort((a, b) => b.gap - a.gap);
  }

  // ─── SIMULADOR DE CARREIRA (Próximo cargo) ────────────────────────────────

  async simulateNextRole(userId: number, targetPositionId: number) {
    const user = await (this.prisma as any).user.findUnique({
      where:  { id: userId },
      select: { positionId: true, hireDate: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const targetPosition = await this.prisma.position.findUnique({
      where:   { id: targetPositionId },
      include: { competencies: { include: { competency: true } } },
    });
    if (!targetPosition) throw new NotFoundException('Cargo alvo não encontrado');

    const [userCompetencies, completedCourseIds, performanceAvg] = await Promise.all([
      this.prisma.userCompetency.findMany({ where: { userId }, include: { competency: true } }),
      this.prisma.enrollment.findMany({
        where:  { userId, status: 'COMPLETED' },
        select: { courseId: true },
      }),
      this.prisma.performanceReview.aggregate({
        where: { userId, score: { not: null } },
        _avg:  { score: true },
      }),
    ]);

    const userCompMap   = new Map(userCompetencies.map(uc => [uc.competencyId, uc.currentLevel]));
    const completedSet  = new Set(completedCourseIds.map(e => e.courseId));

    // Verificar requisitos de competências
    const competencyGaps = targetPosition.competencies.map(pc => {
      const current = userCompMap.get(pc.competencyId) ?? 0;
      return {
        competency:    pc.competency,
        requiredLevel: pc.requiredLevel,
        currentLevel:  current,
        gap:           Math.max(0, pc.requiredLevel - current),
        met:           current >= pc.requiredLevel,
      };
    });

    // Calcular % completitude
    const metCount  = competencyGaps.filter(g => g.met).length;
    const totalReqs = competencyGaps.length;
    const readinessScore = totalReqs > 0 ? Math.round((metCount / totalReqs) * 100) : 100;

    // Cursos recomendados para fechar gaps
    const gapCompetencyIds = competencyGaps.filter(g => !g.met).map(g => g.competency.id);
    const recommendedCourses = gapCompetencyIds.length > 0
      ? await this.prisma.courseCompetency.findMany({
          where:   { competencyId: { in: gapCompetencyIds } },
          include: { course: { select: { id: true, title: true, thumbnailUrl: true, status: true } } },
          distinct: ['courseId'],
          take:    10,
        })
      : [];

    // Tempo mínimo no cargo atual
    const monthsInCurrentRole = user.hireDate
      ? Math.floor((Date.now() - new Date(user.hireDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 0;

    return {
      targetPosition: { id: targetPosition.id, name: targetPosition.name, level: targetPosition.level },
      readinessScore,
      competencyGaps,
      monthsInCurrentRole,
      performanceAvg: Math.round((performanceAvg._avg.score ?? 0) * 10) / 10,
      recommendedCourses: recommendedCourses.map(rc => rc.course),
      summary: {
        totalRequirements: totalReqs,
        requirementsMet:   metCount,
        requirementsGap:   totalReqs - metCount,
        ready:             readinessScore >= 80,
        estimatedTimeMonths: readinessScore >= 80 ? 0 : Math.ceil((100 - readinessScore) / 10) * 3,
      },
    };
  }

  // ─── TRILHAS DE CARREIRA ──────────────────────────────────────────────────

  async findAllCareerPaths(departmentId?: number) {
    return this.prisma.careerPath.findMany({
      where: {
        active: true,
        ...(departmentId ? { departmentId } : {}),
      },
      include: {
        department: { select: { id: true, name: true } },
        steps: {
          include: {
            position: {
              include: {
                competencies: { include: { competency: { select: { id: true, name: true } } } },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        _count: { select: { steps: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneCareerPath(id: number) {
    const path = await this.prisma.careerPath.findUnique({
      where:   { id },
      include: {
        department: { select: { id: true, name: true } },
        steps: {
          include: {
            position: {
              include: {
                competencies: {
                  include: { competency: { select: { id: true, name: true, category: true } } },
                },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!path) throw new NotFoundException('Trilha de carreira não encontrada');
    return path;
  }

  async createCareerPath(dto: CreateCareerPathDto) {
    return this.prisma.careerPath.create({
      data: {
        name:         dto.name,
        description:  dto.description,
        type:         dto.type,
        departmentId: dto.departmentId,
        active:       dto.active ?? true,
      },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async updateCareerPath(id: number, dto: UpdateCareerPathDto) {
    await this.findOneCareerPath(id);
    return this.prisma.careerPath.update({ where: { id }, data: dto });
  }

  async addCareerPathStep(pathId: number, dto: AddCareerPathStepDto) {
    await this.findOneCareerPath(pathId);

    const existing = await this.prisma.careerPathStep.findFirst({
      where: { careerPathId: pathId, order: dto.order },
    });
    if (existing) throw new ConflictException(`Já existe um passo na ordem ${dto.order}`);

    return (this.prisma as any).careerPathStep.create({
      data: {
        careerPathId:           pathId,
        positionId:             dto.positionId,
        order:                  dto.order,
        minMonthsRequired:      dto.minMonthsRequired,
        minPerformanceScore:    dto.minPerformanceScore,
        requiredCourseIds:      dto.requiredCourseIds ?? [],
        requiredCompetencyIds:  dto.requiredCompetencyIds ?? [],
      },
      include: { position: { select: { id: true, name: true, level: true } } },
    });
  }

  async removeCareerPathStep(stepId: number) {
    const step = await this.prisma.careerPathStep.findUnique({ where: { id: stepId } });
    if (!step) throw new NotFoundException('Passo não encontrado');
    await this.prisma.careerPathStep.delete({ where: { id: stepId } });
    return { message: 'Passo removido' };
  }

  // ─── PLANO DE CARREIRA PESSOAL ────────────────────────────────────────────

  async getMyCareerPlan(userId: number) {
    return this.prisma.userCareerPlan.findFirst({
      where:   { userId, status: { in: ['ACTIVE', 'DRAFT'] } },
      include: {
        goals: { orderBy: [{ createdAt: 'asc' }] },
        mentor: { select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCareerPlan(userId: number, dto: CreateCareerPlanDto) {
    // Só um plano activo por vez
    const existing = await this.prisma.userCareerPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (existing) {
      throw new ConflictException('Já existe um plano de carreira activo. Arquive o actual antes de criar um novo.');
    }

    return (this.prisma as any).userCareerPlan.create({
        data: {
        userId,
        title:            dto.title,
        description:      dto.description,
        mentorId:         dto.mentorId,
        targetDate:       dto.targetDate ? new Date(dto.targetDate) : null,
        status:           'ACTIVE',
      },
      include: {
        goals: true,
        mentor: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }

  async updateCareerPlan(planId: number, userId: number, dto: UpdateCareerPlanDto) {
    const plan = await this.prisma.userCareerPlan.findFirst({ where: { id: planId, userId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    return (this.prisma as any).userCareerPlan.update({
      where: { id: planId },
      data: {
        ...dto,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      },
      include: {
        goals: true,
        mentor: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }

  async addGoalToPlan(planId: number, userId: number, dto: AddCareerGoalDto) {
    const plan = await this.prisma.userCareerPlan.findFirst({ where: { id: planId, userId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    return (this.prisma as any).careerGoal.create({
      data: {
        careerPlanId: planId,
        title:        dto.title,
        description:  dto.description,
        category:     dto.timeframe,
        dueDate:      dto.dueDate ? new Date(dto.dueDate) : null,
        status:       'PENDING',
        progress:     0,
      },
    });
  }

  async updateGoalProgress(goalId: number, userId: number, progress: number) {
    const goal = await this.prisma.careerGoal.findUnique({
      where:   { id: goalId },
      include: { careerPlan: { select: { userId: true } } },
    });
    if (!goal || goal.careerPlan.userId !== userId) throw new NotFoundException('Objetivo não encontrado');

    const status = progress >= 100 ? 'COMPLETED' : progress > 0 ? 'IN_PROGRESS' : 'PENDING';

    return this.prisma.careerGoal.update({
      where: { id: goalId },
      data:  {
        progress,
        status,
        completedAt: progress >= 100 ? new Date() : null,
      },
    });
  }

  // ─── VAGAS INTERNAS ───────────────────────────────────────────────────────

  async findAllVacancies(filters: VacancyFilterDto, userId?: number) {
    const { page = 1, limit = 20, search, type, status, departmentId } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search)      where.title        = { contains: search, mode: 'insensitive' };
    if (type)        where.type         = type;
    if (departmentId) where.departmentId = departmentId;
    if (status)      where.status       = status;
    else             where.status       = 'OPEN'; // por defeito só abertas

    const [data, total] = await Promise.all([
      this.prisma.internalVacancy.findMany({
        where, skip, take: limit,
        include: {
          position:   { select: { id: true, name: true, level: true } },
          department: { select: { id: true, name: true } },
          createdBy:  { select: { id: true, fullName: true, avatarUrl: true } },
          _count:     { select: { applications: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.internalVacancy.count({ where }),
    ]);

    // Se userId fornecido, enriquecer com match score e status de candidatura
    let enriched = data as any[];
    if (userId) {
      const userComps = await this.prisma.userCompetency.findMany({
        where: { userId }, select: { competencyId: true, currentLevel: true },
      });
      const userCompMap = new Map(userComps.map(uc => [uc.competencyId, uc.currentLevel]));

      const myApplications = await this.prisma.internalApplication.findMany({
        where: { userId, vacancyId: { in: data.map(v => v.id) } },
        select: { vacancyId: true, status: true },
      });
      const appliedMap = new Map(myApplications.map(a => [a.vacancyId, a.status]));

      enriched = data.map(v => {
        const reqIds = (v as any).requiredCompetencyIds as number[];
        const matchScore = reqIds.length === 0 ? 100
          : Math.round(reqIds.filter(id => {
              const lvl = userCompMap.get(id) ?? 0;
              return lvl >= 1;
            }).length / reqIds.length * 100);

        return {
          ...v,
          matchScore,
          applied:           appliedMap.has(v.id),
          applicationStatus: appliedMap.get(v.id) ?? null,
        };
      });
    }

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createVacancy(createdById: number, dto: CreateInternalVacancyDto) {
    return this.prisma.internalVacancy.create({
      data: {
        title:                  dto.title,
        description:            dto.description,
        type:                   dto.type,
        positionId:             dto.positionId,
        departmentId:           dto.departmentId,
        closingDate:            dto.closingDate ? new Date(dto.closingDate) : null,
        durationDays:           dto.durationDays,
        requiredCompetencyIds:  dto.requiredCompetencyIds ?? [],
        requiredCourseIds:      dto.requiredCourseIds ?? [],
        slots:                  dto.slots ?? 1,
        status:                 'DRAFT',
        createdById,
      },
      include: {
        position:   { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  async publishVacancy(id: number) {
    const v = await this.prisma.internalVacancy.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Vaga não encontrada');
    if (v.status !== 'DRAFT') throw new BadRequestException('Apenas vagas em rascunho podem ser publicadas');

    const updated = await this.prisma.internalVacancy.update({
      where: { id },
      data:  { status: 'OPEN', publishedAt: new Date() },
    });

    // Notificar colaboradores com match >= 70%
    await this.notifyMatchingUsers(id).catch(() => {});

    return updated;
  }

  async applyToVacancy(vacancyId: number, userId: number, dto: ApplyToVacancyDto) {
    const vacancy = await this.prisma.internalVacancy.findUnique({ where: { id: vacancyId } });
    if (!vacancy) throw new NotFoundException('Vaga não encontrada');
    if (vacancy.status !== 'OPEN') throw new BadRequestException('Esta vaga não está aberta');

    const existing = await this.prisma.internalApplication.findUnique({
      where: { vacancyId_userId: { vacancyId, userId } },
    });
    if (existing) throw new ConflictException('Já te candidataste a esta vaga');

    const app = await this.prisma.internalApplication.create({
      data: {
        vacancyId,
        userId,
        motivation: dto.motivation,
        status:     'PENDING',
      },
      include: {
        vacancy: { select: { id: true, title: true } },
        user:    { select: { id: true, fullName: true } },
      },
    });

    // XP por candidatura
    await this.prisma.userPoints.upsert({
      where:  { userId },
      create: { userId, points: 5 },
      update: { points: { increment: 5 } },
    }).catch(() => {});

    return app;
  }

  async updateApplicationStatus(appId: number, dto: UpdateApplicationStatusDto) {
    const app = await this.prisma.internalApplication.findUnique({
      where:   { id: appId },
      include: { user: { select: { id: true } }, vacancy: { select: { title: true } } },
    });
    if (!app) throw new NotFoundException('Candidatura não encontrada');

    const updated = await this.prisma.internalApplication.update({
      where: { id: appId },
      data:  { status: dto.status, feedback: dto.feedback },
    });

    // Notificar candidato
    await this.prisma.notificationLog.create({
      data: {
      userId:  app.user.id,
      type:    'APPLICATION_STATUS_UPDATED',
      message: `A tua candidatura para "${app.vacancy.title}" foi actualizada para: ${dto.status}`,
      metadata: JSON.stringify({ priority: 'MEDIUM', category: 'CAREER' }),
      },
    }).catch(() => {});

    return updated;
  }

  async getMyApplications(userId: number) {
    return this.prisma.internalApplication.findMany({
      where:   { userId },
      include: {
        vacancy: {
          include: {
            position:   { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });
  }

  // ─── MATCHING AUTOMÁTICO ──────────────────────────────────────────────────

  private async getMatchingVacanciesForUser(userId: number, limit = 5) {
    const userComps = await this.prisma.userCompetency.findMany({
      where: { userId }, select: { competencyId: true, currentLevel: true },
    });
    const userCompMap = new Map(userComps.map(uc => [uc.competencyId, uc.currentLevel]));

    const openVacancies = await this.prisma.internalVacancy.findMany({
      where:   { status: 'OPEN' },
      include: { position: { select: { id: true, name: true } }, department: { select: { name: true } } },
      take:    50,
    });

    return openVacancies
      .map(v => {
        const reqIds = (v as any).requiredCompetencyIds as number[];
        const matchScore = reqIds.length === 0 ? 100
          : Math.round(reqIds.filter(id => (userCompMap.get(id) ?? 0) >= 1).length / reqIds.length * 100);
        return { ...v, matchScore };
      })
      .filter(v => v.matchScore >= 50)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }

  private async notifyMatchingUsers(vacancyId: number) {
    const vacancy = await this.prisma.internalVacancy.findUnique({
      where:   { id: vacancyId },
      select:  { title: true, requiredCompetencyIds: true },
    });
    if (!vacancy) return;

    const reqIds = (vacancy as any).requiredCompetencyIds as number[];
    if (!reqIds.length) return;

    // Encontrar utilizadores que têm ≥50% das competências exigidas
    const usersWithComps = await this.prisma.userCompetency.findMany({
      where: { competencyId: { in: reqIds } },
      select: { userId: true, competencyId: true },
    });

    const userMatch = new Map<number, Set<number>>();
    usersWithComps.forEach(uc => {
      if (!userMatch.has(uc.userId)) userMatch.set(uc.userId, new Set());
      userMatch.get(uc.userId)!.add(uc.competencyId);
    });

    const threshold = Math.ceil(reqIds.length * 0.5);
    const matchingUserIds = [...userMatch.entries()]
      .filter(([, comps]) => comps.size >= threshold)
      .map(([userId]) => userId)
      .slice(0, 100);

    if (matchingUserIds.length > 0) {
      await this.prisma.notificationLog.createMany({
           data: matchingUserIds.map(uid => ({
           userId:  uid,
           type:    'MATCHING_VACANCY',
           message: `Nova vaga interna compatível com o teu perfil: "${vacancy.title}"`,
            metadata: JSON.stringify({ priority: 'MEDIUM', category: 'CAREER', actionUrl: `/career/vacancies/${vacancyId}` }),
           })),
      });
    }
  }

  // ─── ELEGIBILIDADE PARA PROMOÇÃO ─────────────────────────────────────────

  async checkPromotionEligibility(userId: number) {
    const user = await (this.prisma as any).user.findUnique({
      where:  { id: userId },
      select: { positionId: true, hireDate: true },
    });
    if (!user?.positionId) return null;

    const [gaps, avgPerformance, monthsInRole] = await Promise.all([
      this.getCompetencyGapsForUser(userId),
      this.prisma.performanceReview.aggregate({
        where: { userId, score: { not: null } },
        _avg:  { score: true },
      }),
      Promise.resolve(
        user.hireDate
          ? Math.floor((Date.now() - new Date(user.hireDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
          : 0
      ),
    ]);

    const metGaps        = gaps.filter(g => g.status === 'MET').length;
    const totalGaps      = gaps.length;
    const gapsPct        = totalGaps > 0 ? Math.round((metGaps / totalGaps) * 100) : 100;
    const perfScore      = avgPerformance._avg.score ?? 0;
    const timeReqMet     = monthsInRole >= 12;
    const performanceMet = perfScore >= 3.5;
    const competenciesMet= gapsPct >= 80;

    return {
      eligible:        timeReqMet && performanceMet && competenciesMet,
      criteria: {
        time:        { met: timeReqMet,    value: monthsInRole, required: 12, label: 'Meses no cargo' },
        performance: { met: performanceMet, value: Math.round(perfScore * 10) / 10, required: 3.5, label: 'Score de performance' },
        competencies:{ met: competenciesMet, value: gapsPct, required: 80, label: '% de competências cumpridas' },
      },
      recommendation: timeReqMet && performanceMet && competenciesMet
        ? 'READY_NOW' : performanceMet && gapsPct >= 60 ? 'READY_12M' : 'NOT_READY',
    };
  }

  async requestPromotion(userId: number, targetPositionId: number, justification: string) {
    // Verificar eligibilidade
    const eligibility = await this.checkPromotionEligibility(userId);
    if (!eligibility?.eligible) {
      throw new BadRequestException('Não cumpres os critérios mínimos para promoção. Consulta o teu dashboard de carreira.');
    }

    // Criar notificação para RH e gestor
    const user = await (this.prisma as any).user.findUnique({
      where:  { id: userId },
      select: { fullName: true, managerId: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    // Notificar gestor
    if (user.managerId) {
      await this.prisma.notificationLog.create({
       data: {
       userId:  user.managerId,
       type:    'PROMOTION_REQUEST',
       message: `${user.fullName} submeteu um pedido de promoção. Revê a elegibilidade.`,
       metadata: JSON.stringify({ priority: 'HIGH', category: 'CAREER', userId, targetPositionId, justification }),
       },
      }).catch(() => {});
    }

    return {
      message:    'Pedido de promoção submetido com sucesso.',
      eligibility,
    };
  }

  // ─── PLANEAMENTO DE SUCESSÃO ──────────────────────────────────────────────

  async getSuccessionPlans(positionId?: number) {
    return this.prisma.successionPlan.findMany({
      where:   positionId ? { positionId } : undefined,
      include: {
        position:  { select: { id: true, name: true, level: true } },
        candidate: {
          select: {
            id: true, fullName: true, avatarUrl: true,
            position:   { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSuccessionPlan(dto: CreateSuccessionPlanDto) {
    const existing = await this.prisma.successionPlan.findFirst({
      where: { positionId: dto.positionId, candidateId: dto.candidateId },
    });
    if (existing) throw new ConflictException('Este candidato já está mapeado para este cargo');

    const plan = await (this.prisma as any).successionPlan.create({
      data: {
        positionId:    dto.positionId,
        candidateId:   dto.candidateId,
        readiness:     dto.readiness,
        justification: dto.justification,
      },
      include: {
        position:  { select: { id: true, name: true } },
        candidate: { select: { id: true, fullName: true } },
      },
    });

    // Notificar candidato
    await this.prisma.notificationLog.create({
      data: {
      userId:  dto.candidateId,
      type:    'SUCCESSION_MAPPED',
      message: `Foste identificado como candidato a sucessor para um cargo estratégico.`,
      metadata: JSON.stringify({ priority: 'HIGH', category: 'CAREER' }),
     },
    }).catch(() => {});

    return plan;
  }

  async updateSuccessionReadiness(planId: number, readiness: string, justification?: string) {
    const plan = await this.prisma.successionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano de sucessão não encontrado');

    return (this.prisma as any).successionPlan.update({
      where: { id: planId },
      data:  { readiness, justification: justification ?? (plan as any).justification },
    });
  }

  // ─── INTERESSES DE CARREIRA ───────────────────────────────────────────────

  async updateCareerInterests(userId: number, dto: CareerInterestDto) {
    return this.prisma.profile.upsert({
      where:  { userId },
      create: {
        userId,
        interests:   dto.areas ?? [],
        careerGoals: JSON.stringify({
          workStyles:       dto.workStyles ?? [],
          desiredRole:      dto.desiredRole,
          openToRelocation: dto.openToRelocation ?? false,
          openToRemote:     dto.openToRemote ?? false,
        }),
      },
      update: {
        interests:   dto.areas ?? [],
        careerGoals: JSON.stringify({
          workStyles:       dto.workStyles ?? [],
          desiredRole:      dto.desiredRole,
          openToRelocation: dto.openToRelocation ?? false,
          openToRemote:     dto.openToRemote ?? false,
        }),
      },
    });
  }

  // ─── ANALYTICS DE CARREIRA ────────────────────────────────────────────────

  async getCareerAnalytics(filters: CareerAnalyticsFilterDto) {
    const { departmentId, period, includeRisk } = filters;
    const year = period ? parseInt(period) : new Date().getFullYear();
    const startDate = new Date(`${year}-01-01`);
    const endDate   = new Date(`${year}-12-31`);

    const where: any = {};
    if (departmentId) where.departmentId = departmentId;

    const [
      totalUsers, usersWithPlan, activeVacancies,
      totalApplications, promotionRequests,
      avgCompetencyGap, topSkillGaps,
    ] = await Promise.all([
      this.prisma.user.count({ where: { ...where, active: true } }),
      this.prisma.userCareerPlan.count({
        where: { status: 'ACTIVE', user: { ...where } },
      }),
      this.prisma.internalVacancy.count({ where: { status: 'OPEN' } }),
      this.prisma.internalApplication.count({
        where: { appliedAt: { gte: startDate, lte: endDate } },
      }),
      0, // Placeholder — promoções via OrgChangeLog
      0, // Placeholder
      this.prisma.positionCompetency.groupBy({
        by: ['competencyId'],
        _count: true,
        orderBy: { _count: { competencyId: 'desc' } },
        take: 10,
      }),
    ]);

    const pdiEngagementRate = totalUsers > 0
      ? Math.round((usersWithPlan / totalUsers) * 100) : 0;

    // Risco de saída (utilizadores sem PDI + sem avaliação recente)
    let riskUsers: any[] = [];
    if (includeRisk) {
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 3600 * 1000);
      const usersAtRisk = await this.prisma.user.findMany({
        where: {
          ...where,
          active: true,
          userCareerPlans: { none: { status: 'ACTIVE' } },
          performanceReviews: { none: { createdAt: { gte: sixMonthsAgo } } },
        },
        select: {
          id: true, fullName: true, avatarUrl: true,
          hireDate: true,
          position:   { select: { name: true } },
          department: { select: { name: true } },
        },
        take: 20,
      });
      riskUsers = usersAtRisk;
    }

    // Carreira mais populares (vagas)
    const topVacancyTypes = await this.prisma.internalVacancy.groupBy({
      by:      ['type'],
      _count:  true,
      orderBy: { _count: { type: 'desc' } },
    });

    return {
      overview: {
        totalUsers,
        usersWithActivePlan: usersWithPlan,
        pdiEngagementRate:   `${pdiEngagementRate}%`,
        activeVacancies,
        totalApplications,
      },
      topVacancyTypes,
      topSkillGaps: topSkillGaps.map(g => ({ competencyId: g.competencyId, positionCount: (g._count as any).competencyId ?? 0 })),
      riskUsers: includeRisk ? riskUsers : undefined,
    };
  }

  async getTalentHeatmap(departmentId?: number) {
    const where: any = { active: true };
    if (departmentId) where.departmentId = departmentId;

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true, fullName: true, avatarUrl: true,
        department: { select: { id: true, name: true } },
        position:   { select: { id: true, name: true, level: true } },
        nineBoxPlacements: {
          orderBy: { updatedAt: 'desc' },
          take:    1,
          select:  { performanceAxis: true, potentialAxis: true },
        },
        _count: { select: { userCompetencies: true, certificates: true } },
      },
      take: 200,
    });

    // Classificar em categorias 9-box
    return users.map(u => {
      const placement = u.nineBoxPlacements[0];
      const perf = placement?.performanceAxis ?? 0;
      const pot  = placement?.potentialAxis  ?? 0;

      let category = 'UNKNOWN';
      if (perf >= 4 && pot >= 4) category = 'HIGH_POTENTIAL';
      else if (perf >= 3 && pot >= 3) category = 'SOLID_PERFORMER';
      else if (perf >= 4 && pot < 3) category = 'EXPERT';
      else if (perf < 3 && pot >= 4) category = 'EMERGING_TALENT';
      else if (perf < 3 && pot < 3) category = 'RISK';

      return {
        ...u,
        performance:   perf,
        potential:     pot,
        talentCategory: category,
      };
    });
  }
}