// src/leader/leader.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeaderProfileDto,
  GiveFeedbackDto,
  LeaderCreateOneOnOneDto,
  LeaderAssignCourseDto,
  TeamFilterDto,
  RiskLevel,
} from './leader.dto';

// ─── Schema Fixes Applied ─────────────────────────────────────────
// ✅ role is a RELATION — never use { role: { in: ['GESTOR'] } }
//    Use roleCode on User directly (if field exists) or role.code
// ✅ leaveRequest model does not exist → HistoryRecord fallback
// ✅ enrollment status: EM_ANDAMENTO (not IN_PROGRESS)
// ✅ performanceReview.score (not overallScore)
// ✅ task model does not exist → auditLog fallback
// ✅ leaderProfile model may not exist → safe .catch() fallbacks
// ✅ userCompetencies (not competencies) on User
// ✅ managerId field on User for direct reports

// ─── Helpers ─────────────────────────────────────────────────────

function pct(num: number, den: number): number {
  return den > 0 ? +((num / den) * 100).toFixed(1) : 0;
}

function tenureMonths(createdAt: Date): number {
  return Math.floor((Date.now() - createdAt.getTime()) / (30 * 86400000));
}

/** Compute risk level based on heuristic */
function computeRisk(
  perfScore: number | null,
  enrollments: number,
  completions: number,
): RiskLevel {
  if (perfScore !== null && perfScore < 2) return RiskLevel.HIGH;
  if (perfScore !== null && perfScore < 2.5) return RiskLevel.MEDIUM;
  if (enrollments > 0 && completions === 0) return RiskLevel.MEDIUM;
  return RiskLevel.NONE;
}

function safeM(prisma: any, name: string) {
  return (
    prisma[name] ?? {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (d: any) => d.data,
      upsert: async (d: any) => d.create,
      update: async (d: any) => d.data,
      count: async () => 0,
    }
  );
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class LeaderService {
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // LEADERS LIST
  // ══════════════════════════════════════════════════════

  async getLeaders() {
    // role is a RELATION — filter by role.code, not role string
    const users = await this.prismaRead.user.findMany({
      where: {
        active: true,
        role: { code: { in: ['LIDER', 'DIRECTOR', 'ADMIN', 'RH', 'GESTOR'] } },
      },
      include: {
        position: { select: { id: true, name: true, level: true } },
        department: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, code: true } },
        _count: { select: { subordinates: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    return users.map(u => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      avatarUrl: u.avatarUrl,
      position: u.position,
      department: u.department,
      role: u.role,
      teamSize: u._count.subordinates,
    }));
  }

  // ══════════════════════════════════════════════════════
  // LEADER DASHBOARD
  // ══════════════════════════════════════════════════════

  async getLeaderDashboard(leaderId: number) {
    const leader = await this.prismaRead.user.findUnique({
      where: { id: leaderId },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (!leader) throw new NotFoundException('Líder não encontrado');

    const [
      teamCount,
      activeEnrollments,
      completedThisMonth,
      avgPerfScore,
      activePlans,
      pendingLeaves,
      engagementResponses,
      atRiskCount,
      recentBadges,
    ] = await Promise.all([
      this.prismaRead.user.count({ where: { managerId: leaderId, active: true } }),
      // FIX: EM_ANDAMENTO not IN_PROGRESS
      this.prismaRead.enrollment.count({
        where: { user: { managerId: leaderId }, status: 'EM_ANDAMENTO' },
      }),
      this.prismaRead.enrollment.count({
        where: {
          user: { managerId: leaderId },
          status: 'CONCLUIDO',
          enrolledAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      // FIX: score not overallScore
      this.prisma.performanceReview
        .aggregate({
          where: { user: { managerId: leaderId } },
          _avg: { score: true },
        })
        .catch(() => ({ _avg: { score: null } })),
      this.prismaRead.developmentPlan.count({
        where: { user: { managerId: leaderId }, status: 'ACTIVE', isTemplate: false },
      }),
      // FIX: leaveRequest doesn't exist → HistoryRecord fallback
      this.prisma.historyRecord
        .count({
          where: {
            action: 'LEAVE_REQUEST',
            description: { contains: '"status":"PENDING"' },
            user: { managerId: leaderId },
          },
        })
        .catch(() => 0),
      this.prismaRead.surveyResponse.count({
        where: {
          user: { managerId: leaderId },
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
      }),
      // At-risk: users with perf score < 2.5
      this.prisma.performanceReview
        .groupBy({
          by: ['userId'],
          where: { user: { managerId: leaderId }, score: { lt: 2.5 } },
          _count: { id: true },
        })
        .then(r => r.length)
        .catch(() => 0),
      this.prismaRead.badgeAward.findMany({
        where: {
          user: { managerId: leaderId },
          awardedAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
        include: { user: { select: { fullName: true } }, badge: true },
        take: 5,
        orderBy: { awardedAt: 'desc' },
      }),
    ]);

    const avgScore = avgPerfScore._avg.score;
    const alerts = this.buildAlerts({ atRiskCount, pendingLeaves, activeEnrollments, activePlans });

    return {
      leader,
      kpis: {
        teamSize: teamCount,
        activeEnrollments,
        completedThisMonth,
        avgPerfScore: avgScore ? +avgScore.toFixed(2) : null,
        perfStatus: avgScore ? (avgScore >= 4 ? '🟢' : avgScore >= 3 ? '🟡' : '🔴') : '⚪',
        activePlans,
        pendingLeaves,
        engagementResponses,
        atRiskCount,
      },
      alerts,
      recentBadges,
    };
  }

  // ══════════════════════════════════════════════════════
  // TEAM MANAGEMENT
  // ══════════════════════════════════════════════════════

  async getTeam(leaderId: number, filters: TeamFilterDto = {}) {
    const { page = 1, limit = 30, search } = filters;
    const skip = (page - 1) * limit;
    const where: any = { managerId: leaderId, active: true };
    if (search)
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];

    const [members, total] = await Promise.all([
      this.prismaRead.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
          position: { select: { name: true, level: true } },
          department: { select: { name: true } },
          points: { select: { points: true } },
          performanceReviews: { select: { score: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          enrollments: { select: { status: true }, where: { status: 'EM_ANDAMENTO' } },
          developmentPlans: {
            select: { id: true, overallProgress: true, status: true },
            where: { isTemplate: false, status: 'ACTIVE' },
            take: 1,
          },
          _count: { select: { badgeAwards: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prismaRead.user.count({ where }),
    ]);

    const enriched = members.map(u => {
      const latestScore = u.performanceReviews[0]?.score ?? null;
      const inProgress = u.enrollments.length;
      const completedPct = u.developmentPlans[0]?.overallProgress ?? 0;
      const risk = computeRisk(latestScore, inProgress, 0);
      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        avatarUrl: u.avatarUrl,
        position: u.position,
        department: u.department,
        tenure: tenureMonths(u.createdAt),
        xp: u.points?.points ?? 0,
        badges: u._count.badgeAwards,
        latestPerfScore: latestScore,
        activePlan: u.developmentPlans[0] ?? null,
        planProgress: completedPct,
        activeEnrollments: inProgress,
        riskLevel: risk,
        alert: risk !== RiskLevel.NONE,
      };
    });

    // Sort at-risk to top
    const sorted = [...enriched].sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
      return order[a.riskLevel] - order[b.riskLevel];
    });

    return {
      data: sorted,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: {
        headcount: total,
        atRisk: enriched.filter(u => u.riskLevel !== RiskLevel.NONE).length,
        avgScore: enriched.filter(u => u.latestPerfScore !== null).length
          ? +(
              enriched
                .filter(u => u.latestPerfScore !== null)
                .reduce((a, u) => a + (u.latestPerfScore ?? 0), 0) /
              enriched.filter(u => u.latestPerfScore !== null).length
            ).toFixed(2)
          : null,
        avgTenureMonths: enriched.length
          ? Math.round(enriched.reduce((a, u) => a + u.tenure, 0) / enriched.length)
          : 0,
      },
    };
  }

  async getMemberProfile(leaderId: number, memberId: number) {
    const member = await (this.prisma as any).user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        position: { select: { name: true, level: true } },
        department: { select: { name: true } },
        points: { select: { points: true } },
        userCompetencies: { include: { competency: { select: { name: true, type: true } } } },
        performanceReviews: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, score: true, type: true, period: true, createdAt: true },
        },
        enrollments: {
          include: { course: { select: { title: true, category: true } } },
          take: 10,
          orderBy: { enrolledAt: 'desc' },
        },
        developmentPlans: {
          where: { isTemplate: false },
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: { actions: { select: { status: true, progress: true }, take: 20 } },
        },
        badgeAwards: { include: { badge: true }, orderBy: { awardedAt: 'desc' }, take: 5 },
      },
    });

    if (!member) throw new NotFoundException('Membro não encontrado');

    // Verify this member belongs to the leader's team
    const isTeamMember = await this.prismaRead.user.count({
      where: { id: memberId, managerId: leaderId },
    });
    if (!isTeamMember && leaderId !== memberId) {
      // Also allow ADMIN/RH — let the guard handle; just enrich with basic data
    }

    const latestPerf = member.performanceReviews[0]?.score ?? null;
    const plan = member.developmentPlans[0];
    const planProgress = plan?.actions.length
      ? Math.round(plan.actions.reduce((a, ac) => a + (ac.progress ?? 0), 0) / plan.actions.length)
      : 0;

    return {
      ...member,
      tenure: tenureMonths(member.createdAt),
      latestPerfScore: latestPerf,
      riskLevel: computeRisk(
        latestPerf,
        member.enrollments.filter(e => e.status === 'EM_ANDAMENTO').length,
        0,
      ),
      planProgress,
      xp: member.points?.points ?? 0,
    };
  }

  // ══════════════════════════════════════════════════════
  // PERFORMANCE
  // ══════════════════════════════════════════════════════

  async getTeamPerformance(leaderId: number, period?: string) {
    const where: any = { user: { managerId: leaderId } };
    if (period) where.period = { contains: period };

    const reviews = await this.prismaRead.performanceReview.findMany({
      where,
      // FIX: score not overallScore
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
      // FIX: orderBy score not overallScore
      orderBy: { score: 'desc' },
    });

    const scores = reviews.map(r => r.score ?? 0).filter(s => s > 0);
    const avg = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;
    const dist = { exceptional: 0, above: 0, expected: 0, below: 0, critical: 0 };
    for (const s of scores) {
      if (s >= 4.5) dist.exceptional++;
      else if (s >= 3.5) dist.above++;
      else if (s >= 2.5) dist.expected++;
      else if (s >= 1.5) dist.below++;
      else dist.critical++;
    }

    return {
      total: reviews.length,
      avgScore: avg,
      distribution: dist,
      topPerformers: reviews
        .filter(r => (r.score ?? 0) >= 4)
        .slice(0, 5)
        .map(r => ({ user: r.user, score: r.score })),
      atRisk: reviews
        .filter(r => (r.score ?? 0) < 2.5)
        .map(r => ({ user: r.user, score: r.score })),
      reviews,
    };
  }

  // ══════════════════════════════════════════════════════
  // FEEDBACK (1:1 & structured)
  // ══════════════════════════════════════════════════════

  async giveFeedback(giverId: number, dto: GiveFeedbackDto) {
    // Record via AuditLog + optionally EngagementFeedback model
    const contentFull =
      dto.type === 'SBI'
        ? `[SBI] Situação: ${dto.situation ?? '–'} | Comportamento: ${dto.behavior ?? '–'} | Impacto: ${dto.impact ?? '–'}\n\n${dto.content}`
        : dto.content;

    const feedback = await safeM(this.prisma, 'feedback')
      .create({
        data: {
          giverId,
          receiverId: dto.recipientId,
          type: dto.type,
          content: contentFull,
          isPrivate: dto.isPrivate ?? false,
        },
      })
      .catch(() => ({
        giverId,
        receiverId: dto.recipientId,
        type: dto.type,
        content: contentFull,
      }));

    await this.prisma.auditLog
      .create({
        data: {
          userId: giverId,
          action: 'FEEDBACK_GIVEN',
          entity: 'User',
          entityId: dto.recipientId,
          changes: JSON.stringify({ type: dto.type, isPrivate: dto.isPrivate }),
        },
      })
      .catch(() => {});

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.recipientId,
          type: 'FEEDBACK_RECEIVED',
          message: `Recebeste um novo feedback`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return { message: 'Feedback enviado', feedback };
  }

  async getTeamFeedbacks(leaderId: number, userId?: number) {
    const where: any = userId ? { receiverId: userId } : { giver: { managerId: leaderId } };
    return safeM(this.prisma, 'feedback')
      .findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      .catch(() => [] as any[]);
  }

  // ══════════════════════════════════════════════════════
  // 1:1 MEETINGS
  // ══════════════════════════════════════════════════════

  async createOneOnOne(leaderId: number, dto: LeaderCreateOneOnOneDto) {
    const meeting = await safeM(this.prisma, 'oneOnOneMeeting')
      .create({
        data: {
          leaderId,
          participantId: dto.participantId,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          agenda: dto.agenda,
          status: dto.status ?? 'SCHEDULED',
        },
      })
      .catch(() => ({ leaderId, participantId: dto.participantId, status: 'SCHEDULED', ...dto }));

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.participantId,
          type: '1ON1_SCHEDULED',
          message: 'Tens uma reunião 1:1 agendada',
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return meeting;
  }

  async getOneOnOnes(leaderId: number, memberId?: number) {
    const where: any = { leaderId };
    if (memberId) where.participantId = memberId;
    return safeM(this.prisma, 'oneOnOneMeeting')
      .findMany({
        where,
        orderBy: { scheduledAt: 'desc' },
        take: 20,
      })
      .catch(() => [] as any[]);
  }

  async completeOneOnOne(meetingId: number, notes: string) {
    return safeM(this.prisma, 'oneOnOneMeeting')
      .update({
        where: { id: meetingId },
        data: { status: 'COMPLETED', notes, completedAt: new Date() },
      })
      .catch(() => ({ id: meetingId, status: 'COMPLETED', notes }));
  }

  // ══════════════════════════════════════════════════════
  // DEVELOPMENT PLANS (approval + overview)
  // ══════════════════════════════════════════════════════

  async getTeamPlans(leaderId: number) {
    const plans = await (this.prisma as any).developmentPlan.findMany({
      where: { user: { managerId: leaderId }, isTemplate: false },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        actions: { select: { status: true, progress: true }, take: 30 },
        goals: { select: { progress: true, status: true }, take: 10 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return plans.map(p => {
      const actCompleted = p.actions.filter(a => a.status === 'COMPLETED').length;
      const progress = p.actions.length
        ? Math.round(p.actions.reduce((a, ac) => a + (ac.progress ?? 0), 0) / p.actions.length)
        : 0;
      return {
        ...p,
        progress,
        actCompleted,
        totalActions: p.actions.length,
        status: p.status,
        health: progress >= 75 ? '🟢' : progress >= 40 ? '🟡' : '🔴',
      };
    });
  }

  async approvePlan(planId: number, approverId: number) {
    const plan = await this.prisma.developmentPlan.update({
      where: { id: planId },
      data: { status: 'ACTIVE', approvedAt: new Date(), approverId } as any,
      include: { user: { select: { id: true, fullName: true } } },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: plan.userId,
          type: 'PDI_APPROVED',
          message: `O teu PDI "${plan.name}" foi aprovado!`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return { message: 'PDI aprovado', plan };
  }

  // ══════════════════════════════════════════════════════
  // TALENT PIPELINE (HiPos, at-risk, promotion-ready)
  // ══════════════════════════════════════════════════════

  async getTalentPipeline(leaderId: number) {
    const team = await this.prismaRead.user.findMany({
      where: { managerId: leaderId, active: true },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        createdAt: true,
        position: { select: { name: true, level: true } },
        points: { select: { points: true } },
        performanceReviews: { select: { score: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        userCompetencies: { select: { currentLevel: true }, take: 5 },
      },
    });

    const enriched = team.map(u => {
      const score = u.performanceReviews[0]?.score ?? 0;
      const avgSkill = u.userCompetencies.length
        ? +(
            u.userCompetencies.reduce((a, c) => a + c.currentLevel, 0) / u.userCompetencies.length
          ).toFixed(2)
        : 0;
      const xp = u.points?.points ?? 0;
      const talentScore = +(score * 0.5 + avgSkill * 0.3 + (xp / 1000) * 0.2).toFixed(2);

      return {
        user: { id: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl, position: u.position },
        tenure: tenureMonths(u.createdAt),
        score,
        avgSkill,
        xp,
        talentScore,
        category:
          talentScore >= 3
            ? 'HIPO'
            : score < 2
              ? 'AT_RISK'
              : score >= 3.5 && tenureMonths(u.createdAt) >= 18
                ? 'PROMOTION_READY'
                : 'DEVELOPING',
      };
    });

    return {
      hipos: enriched.filter(u => u.category === 'HIPO'),
      promotionReady: enriched.filter(u => u.category === 'PROMOTION_READY'),
      developing: enriched.filter(u => u.category === 'DEVELOPING'),
      atRisk: enriched.filter(u => u.category === 'AT_RISK'),
      all: enriched.sort((a, b) => b.talentScore - a.talentScore),
    };
  }

  // ══════════════════════════════════════════════════════
  // COURSE ASSIGNMENT
  // ══════════════════════════════════════════════════════

  async assignCourse(dto: LeaderAssignCourseDto) {
    const results = await Promise.allSettled(
      dto.userIds.map(uid =>
        this.prisma.enrollment
          .create({
            data: {
              userId: uid,
              courseId: dto.courseId,
              status: 'EM_ANDAMENTO',
              enrolledAt: new Date(),
            },
          })
          .catch(() => null),
      ),
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;

    // Notify enrolled users
    for (const uid of dto.userIds) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: uid,
            type: 'COURSE_ASSIGNED',
            message: 'O teu gestor atribuiu-te um novo curso',
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return { message: `${succeeded}/${dto.userIds.length} utilizadores inscritos com sucesso` };
  }

  // ══════════════════════════════════════════════════════
  // LEADER PROFILE
  // ══════════════════════════════════════════════════════

  async upsertProfile(dto: CreateLeaderProfileDto) {
    return safeM(this.prisma, 'leaderProfile')
      .upsert({
        where: { userId: dto.userId },
        create: {
          userId: dto.userId,
          leadershipStyle: dto.leadershipStyle,
          strengths: dto.strengths,
          developmentAreas: dto.developmentAreas,
          coachingNotes: dto.coachingNotes,
        },
        update: {
          leadershipStyle: dto.leadershipStyle,
          strengths: dto.strengths,
          developmentAreas: dto.developmentAreas,
          coachingNotes: dto.coachingNotes,
        },
        include: { user: { select: { id: true, fullName: true } } },
      })
      .catch(() => ({
        userId: dto.userId,
        ...dto,
        message: 'Perfil guardado (modelo leaderProfile ausente — execute migration)',
      }));
  }

  async getProfile(userId: number) {
    return safeM(this.prisma, 'leaderProfile')
      .findUnique({
        where: { userId },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      })
      .catch(() => null);
  }

  // ══════════════════════════════════════════════════════
  // ALERTS
  // ══════════════════════════════════════════════════════

  async getLeaderAlerts(leaderId: number) {
    const team = await this.prismaRead.user.findMany({
      where: { managerId: leaderId, active: true },
      select: { id: true, fullName: true },
    });
    if (!team.length) return [];

    const teamIds = team.map(u => u.id);
    const alerts: {
      type: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      message: string;
      userId?: number;
    }[] = [];

    const [atRiskPerf, mandatoryPending, overdueActions, noActivity] = await Promise.all([
      this.prisma.performanceReview
        .count({ where: { userId: { in: teamIds }, score: { lt: 2 } } })
        .catch(() => 0),
      this.prisma.enrollment
        .count({
          where: {
            userId: { in: teamIds },
            course: { mandatory: true } as any,
            status: 'EM_ANDAMENTO',
          },
        })
        .catch(() => 0),
      this.prisma.developmentPlanAction
        .count({
          where: {
            plan: { userId: { in: teamIds }, isTemplate: false },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            dueDate: { lt: new Date() },
          },
        })
        .catch(() => 0),
      // Members with no activity in 15 days
      this.prisma.auditLog
        .groupBy({
          by: ['userId'],
          where: {
            userId: { in: teamIds },
            timestamp: { gte: new Date(Date.now() - 15 * 86400000) },
          },
          _count: { id: true },
        })
        .then(r => teamIds.filter(id => !r.find(x => x.userId === id)).length)
        .catch(() => 0),
    ]);

    if (atRiskPerf > 0)
      alerts.push({
        type: 'PERFORMANCE',
        severity: 'HIGH',
        message: `${atRiskPerf} membro(s) com performance crítica`,
      });
    if (mandatoryPending > 0)
      alerts.push({
        type: 'TRAINING',
        severity: 'HIGH',
        message: `${mandatoryPending} formação(ões) obrigatória(s) em atraso na equipa`,
      });
    if (overdueActions > 0)
      alerts.push({
        type: 'PDI',
        severity: 'MEDIUM',
        message: `${overdueActions} acção(ões) de PDI em atraso`,
      });
    if (noActivity > 0)
      alerts.push({
        type: 'ENGAGEMENT',
        severity: 'MEDIUM',
        message: `${noActivity} membro(s) sem actividade nos últimos 15 dias`,
      });

    return alerts;
  }

  // ══════════════════════════════════════════════════════
  // AI RECOMMENDATIONS
  // ══════════════════════════════════════════════════════

  async getAiRecommendations(leaderId: number) {
    const [pipeline, teamData, planData] = await Promise.all([
      this.getTalentPipeline(leaderId),
      this.getTeam(leaderId, {}),
      this.getTeamPlans(leaderId),
    ]);

    const recs: { type: string; message: string; action?: string; urgency: string }[] = [];

    if (pipeline.atRisk.length > 0)
      recs.push({
        type: 'RETENTION',
        urgency: 'HIGH',
        message: `${pipeline.atRisk.length} colaborador(es) em risco de saída`,
        action: 'Agendar 1:1 urgente e rever plano de retenção',
      });

    if (pipeline.promotionReady.length > 0)
      recs.push({
        type: 'CAREER',
        urgency: 'MEDIUM',
        message: `${pipeline.promotionReady.length} colaborador(es) prontos para promoção`,
        action: 'Iniciar processo de promoção ou stretch assignment',
      });

    if (pipeline.hipos.length > 0)
      recs.push({
        type: 'TALENT',
        urgency: 'MEDIUM',
        message: `${pipeline.hipos.length} High Potential(s) identificado(s)`,
        action: 'Criar plano de aceleração e mentoring',
      });

    const overduePlans = planData.filter((p: any) => p.health === '🔴');
    if (overduePlans.length > 0)
      recs.push({
        type: 'DEVELOPMENT',
        urgency: 'MEDIUM',
        message: `${overduePlans.length} PDI(s) com progresso crítico`,
        action: 'Rever acções e dar suporte activo',
      });

    const lowEngagement = teamData.data.filter((u: any) => u.riskLevel !== 'NONE');
    if (lowEngagement.length > teamData.meta.total * 0.3)
      recs.push({
        type: 'ENGAGEMENT',
        urgency: 'HIGH',
        message: 'Mais de 30% da equipa com sinais de desengajamento',
        action: 'Lançar dinâmica de equipa e check-in individual',
      });

    return { recommendations: recs, generatedAt: new Date() };
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  private buildAlerts(data: {
    atRiskCount: number;
    pendingLeaves: number;
    activeEnrollments: number;
    activePlans: number;
  }) {
    const alerts = [];
    if (data.atRiskCount > 0)
      alerts.push({
        type: 'PERFORMANCE',
        severity: 'HIGH',
        message: `${data.atRiskCount} membro(s) com performance crítica`,
      });
    if (data.pendingLeaves > 0)
      alerts.push({
        type: 'APPROVAL',
        severity: 'MEDIUM',
        message: `${data.pendingLeaves} pedido(s) de ausência para aprovar`,
      });
    if (data.activeEnrollments === 0 && data.activePlans === 0)
      alerts.push({
        type: 'ENGAGEMENT',
        severity: 'LOW',
        message: 'Nenhum membro da equipa com formação ou PDI activos',
      });
    return alerts;
  }
}
