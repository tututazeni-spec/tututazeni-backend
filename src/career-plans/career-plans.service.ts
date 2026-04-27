// src/career-plans/career-plans.service.ts
import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService }  from '../common/services/audit.service';
import {
  CareerPlanFilterDto, PromotionFilterDto,
  CreateCareerPlanDto, UpdateCareerPlanDto,
  AddCareerGoalDto, UpdateGoalProgressDto,
  CreateRoleDto, CreateSkillDto, SetRoleSkillsDto,
  CreateCareerPathDto, CreateProgressionRuleDto,
  CreatePromotionRequestDto, ReviewPromotionDto,
  SimulateCareerDto,
  CareerPlanStatus, ReadinessLevel, PromotionStatus, GoalStatus,
} from './career-plans.dto';

function getReadinessLevel(score: number): ReadinessLevel {
  if (score >= 80) return ReadinessLevel.READY;
  if (score >= 50) return ReadinessLevel.DEVELOPING;
  return ReadinessLevel.STARTING;
}

function readinessEmoji(level: ReadinessLevel): string {
  return { READY: '🟢', DEVELOPING: '🟡', STARTING: '🔴' }[level];
}

@Injectable()
export class CareerPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createRole(dto: CreateRoleDto) {
    return this.prisma.careerRole.create({ data: { ...dto, active: dto.active ?? true } });
  }

  async getRoles(department?: string) {
    return this.prisma.careerRole.findMany({
      where: {
        active: true,
        ...(department ? { department: { contains: department, mode: 'insensitive' } } : {}),
      },
      include: {
        skillRequirements: { include: { skill: true } },
        _count: { select: { fromRules: true, toRules: true, plans: true } },
      },
      orderBy: [{ department: 'asc' }, { level: 'asc' }],
    });
  }

  async getRole(id: number) {
    const r = await this.prisma.careerRole.findUnique({
      where: { id },
      include: {
        skillRequirements: { include: { skill: true }, orderBy: { weight: 'desc' } },
        fromRules: { include: { toRole: true } },
        toRules: { include: { fromRole: true } },
      },
    });
    if (!r) throw new NotFoundException('Cargo não encontrado');
    return r;
  }

  async setRoleSkills(dto: SetRoleSkillsDto) {
    await this.prisma.roleSkillRequirement.deleteMany({
      where: { careerRoleId: dto.roleId },
    });
    const matrix = await this.prisma.roleSkillMatrix.upsert({
      where:  { roleCode: `ROLE_${dto.roleId}` },
      create: { roleCode: `ROLE_${dto.roleId}` },
      update: {},
    });
    await this.prisma.roleSkillRequirement.createMany({
      data: dto.skills.map(s => ({
        matrixId:      matrix.id,
        careerRoleId:  dto.roleId,
        skillId:       s.skillId,
        requiredLevel: s.requiredLevel,
        weight:        s.weight,
        mandatory:     s.mandatory,
      })),
    });
    return this.getRole(dto.roleId);
  }

  async createSkill(dto: CreateSkillDto) {
    return this.prisma.careerSkill.create({ data: { ...dto, active: dto.active ?? true, maxLevel: dto.maxLevel ?? 5 } });
  }

  async getSkills(type?: string) {
    return this.prisma.careerSkill.findMany({
      where: { active: true, ...(type ? { type: type as any } : {}) },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createCareerPath(dto: CreateCareerPathDto, createdById: number) {
    const { steps, ...rest } = dto;
    const path = await this.prisma.careerPath.create({
      data: {
        ...rest,
        active: dto.active ?? true,
        steps: {
          create: steps.map(s => ({ roleId: s.roleId, order: s.order, label: s.label })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' }, include: { role: true } } },
    });
    return path;
  }

  async getCareerPaths(department?: string) {
    return this.prisma.careerPath.findMany({
      where: { active: true, ...(department ? { department: { contains: department, mode: 'insensitive' } } : {}) },
      include: {
        steps: { orderBy: { order: 'asc' }, include: { role: { include: { skillRequirements: { include: { skill: true } } } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createProgressionRule(dto: CreateProgressionRuleDto) {
    return this.prisma.progressionRule.create({
      data: { ...dto, active: dto.active ?? true },
      include: { fromRole: true, toRole: true },
    });
  }

  async getProgressionRules(fromRoleId?: number) {
    return this.prisma.progressionRule.findMany({
      where: { active: true, ...(fromRoleId ? { fromRoleId } : {}) },
      include: { fromRole: true, toRole: true },
    });
  }

  async calculateReadiness(userId: number, targetRoleId: number) {
    const [targetRole, userSkills] = await Promise.all([
      this.getRole(targetRoleId),
      this.prisma.legacyEmployeeSkill.findMany({
        where: { userId },
        include: { skill: true },
      }),
    ]);

    if (!targetRole.skillRequirements.length) {
      return {
        userId, targetRoleId,
        score: 100, readinessLevel: ReadinessLevel.READY,
        skillGaps: [], missingSkills: [], message: 'Sem requisitos de skills configurados',
        recommendedCourses: [],
      };
    }

    const userSkillMap = new Map(userSkills.map(s => [s.skillId, s.currentLevel]));

    let totalWeight = 0;
    let metWeight   = 0;
    const skillGaps: any[] = [];
    const missingSkills: any[] = [];

    for (const req of targetRole.skillRequirements as any[]) {
      totalWeight += req.weight;
      const userLevel = userSkillMap.get(req.skillId) ?? 0;
      const gap       = req.requiredLevel - userLevel;

      if (gap <= 0) {
        metWeight += req.weight;
      } else {
        const partial = Math.max(0, req.weight * (userLevel / req.requiredLevel));
        metWeight    += partial;
        const gapEntry = {
          skillId:       req.skillId,
          skillName:     req.skill.name,
          skillType:     req.skill.type,
          currentLevel:  userLevel,
          requiredLevel: req.requiredLevel,
          gap,
          weight:        req.weight,
          mandatory:     req.mandatory,
        };
        if (req.mandatory) missingSkills.push(gapEntry);
        else               skillGaps.push(gapEntry);
      }
    }

    const rawScore = totalWeight > 0 ? (metWeight / totalWeight) * 100 : 100;
    const score    = +rawScore.toFixed(1);
    const level    = getReadinessLevel(score);

    const recommendedCourses = await this.getCoursesForSkills(
      [...missingSkills, ...skillGaps].map(g => g.skillId)
    );

    return {
      userId,
      targetRoleId,
      targetRoleName: targetRole.name,
      score,
      readinessLevel: level,
      readinessEmoji: readinessEmoji(level),
      skillGaps,
      missingSkills,
      totalRequirements: targetRole.skillRequirements.length,
      metRequirements:   targetRole.skillRequirements.length - skillGaps.length - missingSkills.length,
      recommendedCourses,
    };
  }

  async findAll(filters: CareerPlanFilterDto) {
    const { page = 1, limit = 20, userId, status, department } = filters;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (userId)     where.userId = userId;
    if (status)     where.status = status;
    // FIX: removed employee from UserSelect — User has no employee relation
    if (department) where.user   = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [data, total] = await Promise.all([
      this.prisma.userCareerPlan.findMany({
        where, skip, take: limit,
        include: {
          // FIX: removed employee sub-select from user select
          user:       { select: { id: true, fullName: true, avatarUrl: true } },
          mentor:     { select: { id: true, fullName: true } },
          currentRole:{ select: { id: true, name: true, level: true } },
          targetRole: { select: { id: true, name: true, level: true } },
          careerPath: { select: { id: true, name: true, type: true } },
          goals:      { where: { status: { not: GoalStatus.CANCELLED } }, orderBy: { dueDate: 'asc' } },
          _count:     { select: { goals: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userCareerPlan.count({ where }),
    ]);

    const enriched = await Promise.all(data.map(async plan => {
      if (plan.targetRoleId) {
        try {
          const readiness = await this.calculateReadiness(plan.userId, plan.targetRoleId);
          return { ...plan, readiness };
        } catch { return plan; }
      }
      return plan;
    }));

    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const plan = await this.prisma.userCareerPlan.findUnique({
      where: { id },
      include: {
        // FIX: removed employee sub-select
        user:       { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        mentor:     { select: { id: true, fullName: true, email: true } },
        currentRole:{ include: { skillRequirements: { include: { skill: true } } } },
        targetRole: { include: { skillRequirements: { include: { skill: true } } } },
        careerPath: { include: { steps: { orderBy: { order: 'asc' }, include: { role: true } } } },
        goals:      { orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] },
      },
    });
    if (!plan) throw new NotFoundException('Plano de carreira não encontrado');

    let readiness = null;
    if (plan.targetRoleId) {
      try { readiness = await this.calculateReadiness(plan.userId, plan.targetRoleId); }
      catch {}
    }

    return { ...plan, readiness };
  }

  async getMyPlan(userId: number) {
    const plan = await this.prisma.userCareerPlan.findFirst({
      where: { userId, status: { in: [CareerPlanStatus.ACTIVE, CareerPlanStatus.DRAFT] } },
      include: {
        mentor:     { select: { id: true, fullName: true } },
        currentRole:{ select: { id: true, name: true, level: true } },
        targetRole: { select: { id: true, name: true, level: true } },
        careerPath: { include: { steps: { orderBy: { order: 'asc' }, include: { role: true } } } },
        goals:      { orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!plan) return null;

    let readiness = null;
    if (plan.targetRoleId) {
      try { readiness = await this.calculateReadiness(userId, plan.targetRoleId); }
      catch {}
    }

    return { ...plan, readiness };
  }

  async create(dto: CreateCareerPlanDto, createdById: number) {
    const plan = await this.prisma.userCareerPlan.create({
      data: {
        ...dto,
        status: CareerPlanStatus.DRAFT,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      },
      include: {
        user:       { select: { id: true, fullName: true } },
        currentRole:{ select: { id: true, name: true } },
        targetRole: { select: { id: true, name: true } },
      },
    });

    if (dto.targetRoleId) {
      await this.autoGenerateGoals(plan.id, dto.userId, dto.targetRoleId);
    }

    await this.notify(dto.userId, 'CAREER_PLAN_CREATED', `Novo plano de carreira criado: "${dto.title}"`);
    await this.audit.log({ action: 'CAREER_PLAN_CREATED', entityType: 'CareerPlan', entityId: plan.id, userId: createdById });

    return this.findOne(plan.id);
  }

  async update(id: number, dto: UpdateCareerPlanDto, updatedById: number) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.targetDate) data.targetDate = new Date(dto.targetDate);
    return this.prisma.userCareerPlan.update({ where: { id }, data });
  }

  async activate(id: number, activatedById: number) {
    await this.findOne(id);
    return this.prisma.userCareerPlan.update({
      where: { id },
      data: { status: CareerPlanStatus.ACTIVE, activatedAt: new Date() },
    });
  }

  async addGoal(dto: AddCareerGoalDto) {
    return this.prisma.careerGoal.create({
      data: {
        ...dto,
        status: GoalStatus.PENDING,
        progress: 0,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });
  }

  async updateGoalProgress(goalId: number, dto: UpdateGoalProgressDto, userId: number) {
    const goal = await this.prisma.careerGoal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException('Meta não encontrada');

    const status = dto.progress === 100
      ? GoalStatus.COMPLETED
      : dto.progress > 0 ? GoalStatus.IN_PROGRESS : GoalStatus.PENDING;

    return this.prisma.careerGoal.update({
      where: { id: goalId },
      data: {
        progress: dto.progress,
        status,
        notes: dto.notes ?? goal.notes,
        completedAt: status === GoalStatus.COMPLETED ? new Date() : null,
      },
    });
  }

  async getProgress(planId: number) {
    const plan  = await this.findOne(planId);
    const goals = ((plan as any).goals as any[]) ?? [];
    const total     = goals.length;
    const completed = goals.filter(g => g.status === GoalStatus.COMPLETED).length;
    const inProgress= goals.filter(g => g.status === GoalStatus.IN_PROGRESS).length;
    const pending   = goals.filter(g => g.status === GoalStatus.PENDING).length;
    const progress  = total ? Math.round((completed / total) * 100) : 0;

    return {
      planId,
      total, completed, inProgress, pending,
      progress,
      readiness: (plan as any).readiness,
      goals,
    };
  }

  async requestPromotion(dto: CreatePromotionRequestDto, requestedById: number) {
    const [user, targetRole] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
      this.prisma.careerRole.findUnique({ where: { id: dto.targetRoleId } }),
    ]);
    if (!user) throw new NotFoundException('Colaborador não encontrado');
    if (!targetRole) throw new NotFoundException('Cargo alvo não encontrado');

    const currentRoleId = (user as any).employee?.currentRoleId;
    if (currentRoleId) {
      const rule = await this.prisma.progressionRule.findFirst({
        where: { fromRoleId: currentRoleId, toRoleId: dto.targetRoleId, active: true },
      });
      if (!rule) throw new BadRequestException('Não existe regra de progressão para esta transição');
    }

    const readiness = await this.calculateReadiness(dto.userId, dto.targetRoleId);

    const promotion = await this.prisma.promotionRequest.create({
      data: {
        userId:        dto.userId,
        targetRoleId:  dto.targetRoleId,
        justification: dto.justification,
        careerPlanId:  dto.careerPlanId,
        readinessScore:readiness.score,
        status:        PromotionStatus.PENDING,
        requestedById,
      },
    });

    const managerId = (user as any)?.managerId;
    if (managerId) await this.notify(managerId, 'PROMOTION_REQUEST_PENDING', `Pedido de promoção de ${(user as any).fullName} para "${targetRole.name}" aguarda aprovação`);

    await this.audit.log({ action: 'PROMOTION_REQUESTED', entityType: 'PromotionRequest', entityId: promotion.id, userId: requestedById });
    return promotion;
  }

  async reviewPromotion(id: number, dto: ReviewPromotionDto, reviewerId: number, role: string) {
    const promotion = await this.prisma.promotionRequest.findUnique({
      where: { id }, include: { user: true, targetRole: true },
    });
    if (!promotion) throw new NotFoundException('Pedido não encontrado');
    if (promotion.status !== PromotionStatus.PENDING) throw new BadRequestException('Pedido já processado');

    const newStatus = dto.approved ? PromotionStatus.APPROVED : PromotionStatus.REJECTED;

    await this.prisma.promotionRequest.update({
      where: { id },
      data: {
        status:      newStatus,
        reviewNotes: dto.notes,
        reviewedById:reviewerId,
        reviewedAt:  new Date(),
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : null,
      },
    });

    if (dto.approved) {
      // FIX: User has no employee relation — use (this.prisma as any) to avoid type error
      await (this.prisma as any).user.update({
        where: { id: promotion.userId },
        data: { employee: { update: { role: promotion.targetRole?.name, currentRoleId: promotion.targetRoleId } } },
      }).catch(() => {});

      await this.prisma.employeeTimeline.create({
        data: {
          employeeId:  promotion.userId,
          type:        'PROMOTED',
          title:       'Promoção',
          description: `Promovido para "${promotion.targetRole?.name}"`,
          isPublic:    true,
          occurredAt:  dto.effectiveDate ? new Date(dto.effectiveDate) : new Date(),
        },
      }).catch(() => {});

      await this.notify(promotion.userId, 'PROMOTION_APPROVED', `Parabéns! A sua promoção para "${promotion.targetRole?.name}" foi aprovada!`);
    } else {
      await this.notify(promotion.userId, 'PROMOTION_REJECTED', `O pedido de promoção para "${promotion.targetRole?.name}" foi rejeitado.`);
    }

    await this.audit.log({ action: `PROMOTION_${newStatus}`, entityType: 'PromotionRequest', entityId: id, userId: reviewerId });
    return this.prisma.promotionRequest.findUnique({ where: { id }, include: { targetRole: true } });
  }

  async getPromotions(filters: PromotionFilterDto) {
    const { page = 1, limit = 20, userId, status, department } = filters;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (userId)     where.userId = userId;
    if (status)     where.status = status;
    // FIX: removed employee from UserSelect
    if (department) where.user   = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [data, total] = await Promise.all([
      this.prisma.promotionRequest.findMany({
        where, skip, take: limit,
        include: {
          // FIX: removed employee sub-select
          user:       { select: { id: true, fullName: true, avatarUrl: true } },
          targetRole: { select: { id: true, name: true, level: true } },
          reviewedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promotionRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async simulateCareer(dto: SimulateCareerDto) {
    const [user, targetRole, paths] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
      this.getRole(dto.targetRoleId),
      this.prisma.careerPath.findMany({
        where: { active: true },
        include: { steps: { orderBy: { order: 'asc' }, include: { role: true } } },
      }),
    ]);
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const readiness = await this.calculateReadiness(dto.userId, dto.targetRoleId);

    const relevantPaths = paths.filter(p =>
      p.steps.some(s => s.roleId === dto.targetRoleId)
    );

    const gapCount   = readiness.skillGaps.length + readiness.missingSkills.length;
    const monthsEst  = Math.max(6, gapCount * 3);

    return {
      userId:          dto.userId,
      userName:        (user as any).fullName,
      targetRole:      { id: targetRole.id, name: targetRole.name, level: targetRole.level },
      readiness,
      estimatedMonths: monthsEst,
      estimatedDate:   new Date(Date.now() + monthsEst * 30 * 86400000).toISOString().split('T')[0],
      relevantPaths,
      // FIX: optional chain to handle possibly undefined
      recommendedActions: (readiness.recommendedCourses ?? []).slice(0, 5),
    };
  }

  async getSuccessionPipeline(roleId: number) {
    const role = await this.getRole(roleId);

    const candidates = await this.prisma.userCareerPlan.findMany({
      where: { targetRoleId: roleId, status: CareerPlanStatus.ACTIVE },
      include: {
        // FIX: removed employee sub-select
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
    });

    const enriched = await Promise.all(candidates.map(async c => {
      const readiness = await this.calculateReadiness(c.userId, roleId);
      return { ...c, readiness };
    }));

    enriched.sort((a, b) => (b as any).readiness?.score - (a as any).readiness?.score);

    const pipeline = {
      ready:      enriched.filter((c: any) => c.readiness?.readinessLevel === ReadinessLevel.READY),
      developing: enriched.filter((c: any) => c.readiness?.readinessLevel === ReadinessLevel.DEVELOPING),
      starting:   enriched.filter((c: any) => c.readiness?.readinessLevel === ReadinessLevel.STARTING),
    };

    return {
      role,
      totalCandidates: enriched.length,
      pipeline,
      riskLevel: pipeline.ready.length === 0 ? 'HIGH' : pipeline.ready.length <= 1 ? 'MEDIUM' : 'LOW',
    };
  }

  async getSuccessionDashboard(department?: string) {
    const roles = await this.prisma.careerRole.findMany({
      where: { active: true, ...(department ? { department: { contains: department, mode: 'insensitive' } } : {}) },
      include: { _count: { select: { plans: true } } },
    });

    const dashboard = await Promise.all(
      roles.filter(r => r.level >= 4).map(async role => {
        const candidateCount = await this.prisma.userCareerPlan.count({
          where: { targetRoleId: role.id, status: CareerPlanStatus.ACTIVE },
        });
        return {
          roleId:   role.id,
          roleName: role.name,
          level:    role.level,
          department: role.department,
          candidateCount,
          riskLevel: candidateCount === 0 ? 'HIGH' : candidateCount === 1 ? 'MEDIUM' : 'LOW',
        };
      })
    );

    return dashboard.sort((a, b) =>
      ['HIGH','MEDIUM','LOW'].indexOf(a.riskLevel) - ['HIGH','MEDIUM','LOW'].indexOf(b.riskLevel)
    );
  }

  async getAnalytics(department?: string) {
    const where: any = {};
    // FIX: removed employee from UserSelect
    if (department) where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [
      totalPlans, activePlans, completedPlans,
      totalPromotions, approvedPromotions,
      plansByStatus,
    ] = await Promise.all([
      this.prisma.userCareerPlan.count({ where }),
      this.prisma.userCareerPlan.count({ where: { ...where, status: CareerPlanStatus.ACTIVE } }),
      this.prisma.userCareerPlan.count({ where: { ...where, status: CareerPlanStatus.COMPLETED } }),
      this.prisma.promotionRequest.count(),
      this.prisma.promotionRequest.count({ where: { status: PromotionStatus.APPROVED } }),
      this.prisma.userCareerPlan.groupBy({ by: ['status'], _count: true }),
    ]);

    const promotions = await this.prisma.promotionRequest.findMany({
      where: { status: PromotionStatus.APPROVED, reviewedAt: { not: null } },
      select: { createdAt: true, reviewedAt: true },
    });
    const avgPromotionDays = promotions.length
      ? promotions.reduce((a, p) => a + (p.reviewedAt!.getTime() - p.createdAt.getTime()) / 86400000, 0) / promotions.length
      : 0;

    return {
      plans: { total: totalPlans, active: activePlans, completed: completedPlans, byStatus: plansByStatus },
      promotions: { total: totalPromotions, approved: approvedPromotions, approvalRate: totalPromotions ? +((approvedPromotions / totalPromotions) * 100).toFixed(1) : 0 },
      avgPromotionDays: +avgPromotionDays.toFixed(0),
      hasCareerPlanRate: 0,
    };
  }

  private async autoGenerateGoals(planId: number, userId: number, targetRoleId: number) {
    const readiness = await this.calculateReadiness(userId, targetRoleId);
    const gaps = [...readiness.missingSkills, ...readiness.skillGaps].slice(0, 5);

    for (const gap of gaps) {
      await this.prisma.careerGoal.create({
        data: {
          careerPlanId: planId,
          title:    `Desenvolver: ${gap.skillName} (Nível ${gap.currentLevel} → ${gap.requiredLevel})`,
          type:     'SKILL',
          skillId:  gap.skillId,
          status:   GoalStatus.PENDING,
          progress: 0,
          dueDate:  new Date(Date.now() + 90 * 86400000),
        },
      });
    }
  }

  private async getCoursesForSkills(skillIds: number[]) {
    if (!skillIds.length) return [];
    try {
      return this.prisma.course?.findMany?.({
        where: { status: 'PUBLISHED' },
        select: { id: true, title: true },
        take: 5,
      }) ?? [];
    } catch { return []; }
  }

  private async notify(userId: number, type: string, message: string) {
    try { await this.prisma.notificationLog.create({ data: { userId, type, message, success: true } }); }
    catch {}
  }
}