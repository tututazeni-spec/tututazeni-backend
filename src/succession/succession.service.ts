// src/succession/succession.service.ts
import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCriticalPositionDto,
  UpdateCriticalPositionDto,
  SuccessionCreateSuccessionPlanDto,
  UpdateSuccessionPlanDto,
  AddToTalentPoolDto,
  GeneratePDIDto,
  SuccessionFilterDto,
  CriticalPositionFilterDto,
} from './succession.dto';

@Injectable()
export class SuccessionService {
  private readonly logger = new Logger(SuccessionService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CARGOS CRÍTICOS ──────────────────────────────────────────────────────

  async createCriticalPosition(dto: CreateCriticalPositionDto) {
    const position = await this.prisma.read.position.findUnique({ where: { id: dto.positionId } });
    if (!position) throw new NotFoundException('Posição não encontrada');

    const exists = await this.prisma.criticalPosition.findUnique({
      where: { positionId: dto.positionId },
    });
    if (exists) throw new ConflictException('Esta posição já está classificada como crítica');

    return this.prisma.criticalPosition.create({
      data: {
        positionId: dto.positionId,
        businessImpact: dto.businessImpact,
        replacementTime: dto.replacementTime,
        exitRisk: dto.exitRisk,
        expectedExitDate: dto.expectedExitDate ? new Date(dto.expectedExitDate) : null,
        criticalReason: dto.criticalReason,
        keyPersonRisk: dto.keyPersonRisk ?? false,
        minSuccessorsRequired: dto.minSuccessorsRequired ?? 2,
        requiresDocumentation: dto.requiresDocumentation ?? false,
      },
      include: { position: true },
    });
  }

  async getCriticalPositions(filters: CriticalPositionFilterDto) {
    const {
      page = 1,
      limit = 20,
      businessImpact,
      exitRisk,
      departmentId,
      withoutSuccessor,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (businessImpact) where.businessImpact = businessImpact;
    if (exitRisk) where.exitRisk = exitRisk;
    if (departmentId) where.position = { departmentId };

    const [data, total] = await Promise.all([
      this.prisma.read.criticalPosition.findMany({
        where,
        skip,
        take: limit,
        include: {
          position: {
            select: {
              id: true,
              name: true,
              level: true,
              users: {
                select: { id: true, fullName: true, avatarUrl: true, hireDate: true },
                take: 1,
              },
            },
          },
          successionPlans: {
            include: {
              candidate: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
          _count: { select: { successionPlans: true } },
        },
        orderBy: [{ exitRisk: 'desc' }, { businessImpact: 'desc' }],
      }),
      this.prisma.read.criticalPosition.count({ where }),
    ]);

    // Filtrar cargos sem sucessores (pós-query para simplificar)
    const filtered = withoutSuccessor
      ? data.filter(cp => cp._count.successionPlans < (cp.minSuccessorsRequired ?? 2))
      : data;

    return {
      data: filtered.map(cp => ({
        ...cp,
        coverageStatus: this.calcCoverageStatus(
          cp._count.successionPlans,
          cp.minSuccessorsRequired ?? 2,
        ),
        daysUntilExit: cp.expectedExitDate ? this.daysUntil(cp.expectedExitDate) : null,
        alert: this.buildAlert(cp),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOneCriticalPosition(id: number) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { id },
      include: {
        position: {
          include: {
            users: {
              select: { id: true, fullName: true, avatarUrl: true, hireDate: true, email: true },
            },
            competencies: { include: { competency: true } },
          },
        },
        successionPlans: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                email: true,
                position: { select: { name: true } },
                department: { select: { name: true } },
                userCompetencies: { include: { competency: true }, take: 10 },
              },
            },
          },
          orderBy: { priority: 'asc' },
        },
        _count: { select: { successionPlans: true } },
      },
    });
    if (!cp) throw new NotFoundException('Cargo crítico não encontrado');
    return cp;
  }

  async updateCriticalPosition(id: number, dto: UpdateCriticalPositionDto) {
    const cp = await this.prisma.read.criticalPosition.findUnique({ where: { id } });
    if (!cp) throw new NotFoundException('Cargo crítico não encontrado');
    return this.prisma.criticalPosition.update({ where: { id }, data: dto });
  }

  // ─── PLANOS DE SUCESSÃO ───────────────────────────────────────────────────

  async findAll(filters: SuccessionFilterDto) {
    const {
      page = 1,
      limit = 20,
      criticalPositionId,
      candidateId,
      readinessLevel,
      priority,
      departmentId,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (criticalPositionId) where.criticalPositionId = criticalPositionId;
    if (candidateId) where.candidateId = candidateId;
    if (readinessLevel) where.readinessLevel = readinessLevel;
    if (priority) where.priority = priority;
    if (departmentId) where.candidate = { departmentId };

    const [data, total] = await Promise.all([
      this.prisma.read.successionPlan.findMany({
        where,
        skip,
        take: limit,
        include: {
          criticalPosition: {
            include: { position: { select: { id: true, name: true, level: true } } },
          },
          candidate: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              email: true,
              position: { select: { name: true } },
              department: { select: { name: true } },
              hireDate: true,
            },
          },
        },
        orderBy: [{ priority: 'asc' }, { readinessLevel: 'asc' }],
      }),
      this.prisma.read.successionPlan.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const s = await this.prisma.read.successionPlan.findUnique({
      where: { id },
      include: {
        criticalPosition: {
          include: {
            position: {
              include: { competencies: { include: { competency: true } } },
            },
          },
        },
        candidate: {
          include: {
            userCompetencies: { include: { competency: true } },
            performanceReviews: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { score: true, category: true, cycle: { select: { name: true } } },
            },
            learningPathEnrollments: {
              where: { status: 'COMPLETED' },
              include: { learningPath: { select: { title: true } } },
              take: 5,
            },
          },
        },
        pdi: true,
      },
    });
    if (!s) throw new NotFoundException('Plano de sucessão não encontrado');

    // Calcular match
    const match = await this.calculateMatchScore(s as any);

    return { ...s, matchScore: match.score, matchDetails: match.details };
  }

  async create(dto: SuccessionCreateSuccessionPlanDto) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { id: dto.criticalPositionId },
    });
    if (!cp) throw new NotFoundException('Cargo crítico não encontrado');

    const candidate = await this.prisma.read.user.findUnique({ where: { id: dto.candidateId } });
    if (!candidate) throw new NotFoundException('Candidato não encontrado');

    // Verificar duplicação
    const exists = await this.prisma.successionPlan.findFirst({
      where: { criticalPositionId: dto.criticalPositionId, candidateId: dto.candidateId },
    });
    if (exists) throw new ConflictException('Candidato já está no plano de sucessão deste cargo');

    // Calcular match score automaticamente se não fornecido
    let matchScore = dto.matchScore;
    if (!matchScore) {
      const autoMatch = await this.calculateMatchScoreForCandidate(
        dto.criticalPositionId,
        dto.candidateId,
      );
      matchScore = autoMatch.score;
    }

    const plan = await (this.prisma as any).successionPlan.create({
      data: {
        criticalPositionId: dto.criticalPositionId,
        candidateId: dto.candidateId,
        readinessLevel: dto.readinessLevel,
        priority: dto.priority,
        matchScore,
        geographicMobility: dto.geographicMobility ?? true,
        available: dto.available ?? true,
        notes: dto.notes,
        readinessByDate: dto.readinessByDate ? new Date(dto.readinessByDate) : null,
      },
      include: {
        criticalPosition: { include: { position: true } },
        candidate: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Notificar RH
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.candidateId,
          type: 'SUCCESSION_PLAN_ADDED',
          message: `Você foi adicionado ao plano de sucessão`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return plan;
  }

  async update(id: number, dto: UpdateSuccessionPlanDto) {
    await this.findOne(id);
    return this.prisma.successionPlan.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.successionPlan.delete({ where: { id } });
    return { message: 'Plano de sucessão removido' };
  }

  // ─── CÁLCULO DE MATCH ─────────────────────────────────────────────────────

  private async calculateMatchScoreForCandidate(criticalPositionId: number, candidateId: number) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { id: criticalPositionId },
      include: { position: { include: { competencies: true } } },
    });
    const candidate = await this.prisma.read.user.findUnique({
      where: { id: candidateId },
      include: {
        userCompetencies: true,
        performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return this.calculateMatchScore({ criticalPosition: cp, candidate } as any);
  }

  private async calculateMatchScore(plan: any) {
    const requiredComps = plan.criticalPosition?.position?.competencies ?? [];
    const userComps = plan.candidate?.userCompetencies ?? [];
    const userCompMap = new Map(
      userComps.map((uc: any) => [uc.competencyId, uc.currentLevel ?? 0]),
    );

    // Score de competências (40%)
    let compScore = 0;
    if (requiredComps.length > 0) {
      const met = requiredComps.filter(
        (rc: any) => (userCompMap.get(rc.competencyId) ?? 0) >= rc.requiredLevel,
      ).length;
      compScore = (met / requiredComps.length) * 100;
    } else {
      compScore = 50; // sem competências definidas → neutro
    }

    // Score de performance (40%)
    const latestReview = plan.candidate?.performanceReviews?.[0];
    let perfScore = 50; // neutro se sem avaliação
    if (latestReview?.score) {
      perfScore = Math.min(100, (latestReview.score / 5) * 100);
    }

    // Score de experiência / tempo de empresa (20%)
    const hireDate = plan.candidate?.hireDate ? new Date(plan.candidate.hireDate) : null;
    const yearsExp = hireDate ? (Date.now() - hireDate.getTime()) / (365.25 * 24 * 3600 * 1000) : 0;
    const expScore = Math.min(100, yearsExp * 10); // 10 anos = 100%

    const finalScore = Math.round(compScore * 0.4 + perfScore * 0.4 + expScore * 0.2);

    const gaps = requiredComps
      .filter((rc: any) => (userCompMap.get(rc.competencyId) ?? 0) < rc.requiredLevel)
      .map((rc: any) => ({
        competencyId: rc.competencyId,
        requiredLevel: rc.requiredLevel,
        currentLevel: userCompMap.get(rc.competencyId) ?? 0,
        gap: Number(rc.requiredLevel) - Number(userCompMap.get(rc.competencyId) ?? 0),
      }));

    return {
      score: finalScore,
      details: { compScore, perfScore, expScore, gaps },
    };
  }

  // ─── TALENT POOL ──────────────────────────────────────────────────────────

  async getTalentPool() {
    return this.prisma.read.talentPool.findMany({
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            email: true,
            hireDate: true,
            position: { select: { name: true } },
            department: { select: { name: true } },
            userCompetencies: { include: { competency: true }, take: 5 },
            performanceReviews: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { score: true, category: true },
            },
          },
        },
        mentor: { select: { id: true, fullName: true, position: { select: { name: true } } } },
      },
      orderBy: { readinessLevel: 'asc' },
    });
  }

  async addToTalentPool(dto: AddToTalentPoolDto) {
    const exists = await this.prisma.talentPool.findUnique({ where: { userId: dto.userId } });
    if (exists) throw new ConflictException('Colaborador já está no Talent Pool');

    return this.prisma.talentPool.create({
      data: {
        userId: dto.userId,
        readinessLevel: dto.readinessLevel,
        mentorId: dto.mentorId,
        notes: dto.notes,
        geographicMobility: dto.geographicMobility ?? true,
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }

  async removeFromTalentPool(userId: number) {
    const entry = await this.prisma.read.talentPool.findUnique({ where: { userId } });
    if (!entry) throw new NotFoundException('Colaborador não está no Talent Pool');
    await this.prisma.talentPool.delete({ where: { userId } });
    return { message: 'Removido do Talent Pool' };
  }

  // ─── PDI ──────────────────────────────────────────────────────────────────

  async generatePDI(dto: GeneratePDIDto) {
    const plan = (await this.findOne(dto.successionPlanId)) as any;

    // Buscar gaps automáticos
    const gaps = plan.matchDetails?.gaps ?? [];
    const gapCompIds = gaps.map((g: any) => g.competencyId);

    // Sugerir cursos mapeados aos gaps
    const suggestedCourses = await this.prisma.read.courseCompetency.findMany({
      where: { competencyId: { in: gapCompIds } },
      include: { course: { select: { id: true, title: true, thumbnailUrl: true } } },
      take: 10,
    });

    const suggestedLPs = await this.prisma.read.learningPath.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, title: true, pathType: true },
      take: 5,
    });

    const pdi = await this.prisma.successionPDI.upsert({
      where: { successionPlanId: dto.successionPlanId },
      create: {
        successionPlanId: dto.successionPlanId,
        gaps: JSON.stringify(gaps),
        developmentGoals:
          dto.developmentGoals ??
          `Desenvolver competências para ${plan.criticalPosition?.position?.name}`,
        learningPathIds: dto.learningPathIds ?? suggestedLPs.slice(0, 3).map((lp: any) => lp.id),
        courseIds: dto.courseIds ?? suggestedCourses.slice(0, 5).map((cc: any) => cc.courseId),
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      update: {
        gaps: JSON.stringify(gaps),
        developmentGoals: dto.developmentGoals ?? undefined,
        learningPathIds: dto.learningPathIds ?? undefined,
        courseIds: dto.courseIds ?? undefined,
      },
    });

    return { pdi, suggestedCourses: suggestedCourses.map((cc: any) => cc.course), suggestedLPs };
  }

  // ─── SUMÁRIO POR CARGO ────────────────────────────────────────────────────

  async getPositionSummary(positionId: number) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { positionId },
      include: {
        position: {
          include: {
            users: { select: { id: true, fullName: true, avatarUrl: true }, take: 1 },
            competencies: { include: { competency: { select: { id: true, name: true } } } },
          },
        },
        successionPlans: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                position: { select: { name: true } },
                performanceReviews: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { score: true, category: true },
                },
              },
            },
          },
          orderBy: [{ priority: 'asc' }, { readinessLevel: 'asc' }],
        },
      },
    });
    if (!cp) throw new NotFoundException('Posição não encontrada como cargo crítico');

    const byReadiness = {
      READY_NOW: cp.successionPlans.filter(sp => sp.readinessLevel === 'READY_NOW'),
      READY_SOON: cp.successionPlans.filter(sp => sp.readinessLevel === 'READY_SOON'),
      NEEDS_DEVELOPMENT: cp.successionPlans.filter(sp => sp.readinessLevel === 'NEEDS_DEVELOPMENT'),
    };

    const coverageStatus = this.calcCoverageStatus(
      cp.successionPlans.length,
      cp.minSuccessorsRequired ?? 2,
    );

    return {
      criticalPosition: cp,
      byReadiness,
      total: cp.successionPlans.length,
      coverageStatus,
      alert: this.buildAlert(cp),
      daysUntilExit: cp.expectedExitDate ? this.daysUntil(cp.expectedExitDate) : null,
    };
  }

  // ─── ORGANOGRAMA DE SUCESSÃO ──────────────────────────────────────────────

  async getOrganizationChart(departmentId?: number) {
    const where: any = {};
    if (departmentId) where.position = { departmentId };

    const criticalPositions = await (this.prisma as any).criticalPosition.findMany({
      where,
      include: {
        position: {
          select: {
            id: true,
            name: true,
            level: true,
            users: { select: { id: true, fullName: true, avatarUrl: true }, take: 1 },
            department: { select: { id: true, name: true } },
          },
        },
        successionPlans: {
          include: {
            candidate: { select: { id: true, fullName: true, avatarUrl: true } },
          },
          orderBy: { priority: 'asc' },
          take: 3,
        },
        _count: { select: { successionPlans: true } },
      },
      orderBy: [{ businessImpact: 'desc' }, { exitRisk: 'desc' }],
      take: 50,
    });

    return criticalPositions.map(cp => ({
      id: cp.id,
      position: cp.position,
      exitRisk: cp.exitRisk,
      businessImpact: cp.businessImpact,
      keyPersonRisk: cp.keyPersonRisk,
      daysUntilExit: cp.expectedExitDate ? this.daysUntil(cp.expectedExitDate) : null,
      coverageStatus: this.calcCoverageStatus(
        cp._count.successionPlans,
        cp.minSuccessorsRequired ?? 2,
      ),
      successors: cp.successionPlans.map(sp => ({
        ...sp.candidate,
        readinessLevel: sp.readinessLevel,
        priority: sp.priority,
        matchScore: sp.matchScore,
      })),
    }));
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────

  async getDashboard() {
    const [totalCritical, withoutSuccessor, readyNowCount, highRisk, allPlans] = await Promise.all([
      this.prisma.read.criticalPosition.count(),
      this.prisma.read.criticalPosition.count({
        where: { successionPlans: { none: {} } },
      }),
      this.prisma.read.successionPlan.count({ where: { readinessLevel: 'READY_NOW' } }),
      this.prisma.read.criticalPosition.count({
        where: { exitRisk: { in: ['HIGH', 'CRITICAL'] } },
      }),
      this.prisma.read.successionPlan.findMany({
        select: { matchScore: true, readinessLevel: true, criticalPositionId: true },
      }),
    ]);

    const avgMatchScore = allPlans.length
      ? Math.round(allPlans.reduce((s, p) => s + (p.matchScore ?? 0), 0) / allPlans.length)
      : 0;

    const readinessIndex =
      totalCritical > 0 ? Math.round((readyNowCount / totalCritical) * 100) : 0;

    const coverageRate =
      totalCritical > 0
        ? Math.round(((totalCritical - withoutSuccessor) / totalCritical) * 100)
        : 0;

    // Alertas críticos
    const criticalAlerts = await this.prisma.read.criticalPosition.findMany({
      where: {
        OR: [
          { exitRisk: 'CRITICAL' },
          { expectedExitDate: { lte: new Date(Date.now() + 90 * 24 * 3600 * 1000) } },
          { successionPlans: { none: {} } },
        ],
      },
      include: { position: { select: { name: true } } },
      take: 10,
    });

    return {
      kpis: {
        totalCriticalPositions: totalCritical,
        withoutSuccessor,
        coverageRate,
        readinessIndex,
        highRiskPositions: highRisk,
        avgMatchScore,
      },
      criticalAlerts: criticalAlerts.map(ca => ({
        id: ca.id,
        position: ca.position.name,
        exitRisk: ca.exitRisk,
        alert: this.buildAlert(ca),
        daysUntilExit: ca.expectedExitDate ? this.daysUntil(ca.expectedExitDate) : null,
      })),
    };
  }

  // ─── COMPARADOR DE PERFIS ─────────────────────────────────────────────────

  async compareProfiles(candidateAId: number, candidateBId: number, criticalPositionId: number) {
    const [a, b, cp] = await Promise.all([
      this.prisma.read.user.findUnique({
        where: { id: candidateAId },
        include: {
          userCompetencies: { include: { competency: true } },
          performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.read.user.findUnique({
        where: { id: candidateBId },
        include: {
          userCompetencies: { include: { competency: true } },
          performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.read.criticalPosition.findUnique({
        where: { id: criticalPositionId },
        include: { position: { include: { competencies: { include: { competency: true } } } } },
      }),
    ]);

    if (!a || !b) throw new NotFoundException('Candidato não encontrado');

    const [matchA, matchB] = await Promise.all([
      this.calculateMatchScore({ criticalPosition: cp, candidate: a } as any),
      this.calculateMatchScore({ criticalPosition: cp, candidate: b } as any),
    ]);

    return { candidateA: { user: a, match: matchA }, candidateB: { user: b, match: matchB } };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private calcCoverageStatus(count: number, required: number): string {
    if (count === 0) return 'CRITICAL';
    if (count < required) return 'AT_RISK';
    if (count >= required) return 'COVERED';
    return 'UNKNOWN';
  }

  private daysUntil(date: Date | null): number | null {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 3600 * 1000));
  }

  private buildAlert(cp: any): string | null {
    if (cp._count?.successionPlans === 0 || cp.successionPlans?.length === 0) {
      return '🚨 Cargo crítico sem sucessores';
    }
    if (cp.exitRisk === 'CRITICAL') return '🔴 Risco de saída crítico';
    if (cp.exitRisk === 'HIGH') return '🟠 Risco de saída alto';
    const days = this.daysUntil(cp.expectedExitDate);
    if (days !== null && days <= 90) return `⏳ Saída prevista em ${days} dias`;
    return null;
  }
}
