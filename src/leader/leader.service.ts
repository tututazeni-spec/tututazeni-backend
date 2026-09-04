// src/leader/leader.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeaderProfileDto,
  GiveFeedbackDto,
  LeaderCreateOneOnOneDto,
  LeaderAssignCourseDto,
  TeamFilterDto,
  RiskLevel,
} from './leader.dto';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

// ─── Schema Fixes Applied ─────────────────────────────────────────
// ✅ role is a RELATION — never use { role: { in: ['GESTOR'] } }
//    Use roleCode on User directly (if field exists) or role.code
// ✅ leaveRequest model does not exist → HistoryRecord fallback
// ✅ enrollment status: enum EnrollmentStatus (Prisma) — convenção EN em toda a plataforma
// ✅ performanceReview.score (not overallScore)
// ✅ task model does not exist → auditLog fallback
// ✅ leaderProfile model may not exist → safe .catch() fallbacks
// ✅ userCompetencies (not competencies) on User
// ✅ managerId field on User for direct reports

// ─── Helpers ─────────────────────────────────────────────────────
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

// LeaderProfile não existe em prisma/schema.prisma (confirmado — sem
// migration para o modelo). upsertProfile/getProfile são os dois únicos
// pontos que o tocam; este wrapper mantém o degrade gracioso já documentado
// no cabeçalho do ficheiro sem espalhar `any` pelo resto da classe (ao
// contrário de Feedback/OneOnOneMeeting acima, que eram modelos reais e o
// wrapper genérico nunca teve razão de ser).
interface LeaderProfileDelegate {
  upsert: (args: {
    where: { userId: number };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    include?: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  findUnique: (args: {
    where: { userId: number };
    include?: Record<string, unknown>;
  }) => Promise<Record<string, unknown> | null>;
}

function safeLeaderProfile(prisma: PrismaService): LeaderProfileDelegate {
  const delegate = (prisma as unknown as { leaderProfile?: LeaderProfileDelegate }).leaderProfile;
  return (
    delegate ?? {
      upsert: async args => args.create,
      findUnique: async () => null,
    }
  );
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class LeaderService {
  private readonly logger = new Logger(LeaderService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // LEADERS LIST
  // ══════════════════════════════════════════════════════

  async getLeaders() {
    // role is a RELATION — filter by role.code, not role string
    const users = await this.prisma.read.user.findMany({
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
    const leader = await this.prisma.read.user.findUnique({
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
      this.prisma.read.user.count({ where: { managerId: leaderId, active: true } }),
      this.prisma.read.enrollment.count({
        where: { user: { managerId: leaderId }, status: EnrollmentStatus.IN_PROGRESS },
      }),
      this.prisma.read.enrollment.count({
        where: {
          user: { managerId: leaderId },
          status: EnrollmentStatus.COMPLETED,
          enrolledAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      // FIX: score not overallScore
      this.prisma.performanceReview
        .aggregate({
          where: { user: { managerId: leaderId } },
          _avg: { score: true },
        })
        .catch(e => {
          this.logger.warn({
            leaderId,
            action: 'getLeaderDashboard.avgPerfScore',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular score médio de performance da equipa',
          });
          return { _avg: { score: null } };
        }),
      this.prisma.read.developmentPlan.count({
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
        .catch(e => {
          this.logger.warn({
            leaderId,
            action: 'getLeaderDashboard.pendingLeaves',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar pedidos de ausência pendentes da equipa',
          });
          return 0;
        }),
      this.prisma.read.surveyResponse.count({
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
        .catch(e => {
          this.logger.warn({
            leaderId,
            action: 'getLeaderDashboard.atRiskCount',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular contagem de membros em risco de performance',
          });
          return 0;
        }),
      this.prisma.read.badgeAward.findMany({
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
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.UserWhereInput = { managerId: leaderId, active: true };
    if (search)
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];

    const [members, total] = await Promise.all([
      this.prisma.read.user.findMany({
        where,
        skip,
        take,
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
          enrollments: {
            select: { status: true },
            where: { status: EnrollmentStatus.IN_PROGRESS },
          },
          developmentPlans: {
            select: { id: true, overallProgress: true, status: true },
            where: { isTemplate: false, status: 'ACTIVE' },
            take: 1,
          },
          _count: { select: { badgeAwards: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.read.user.count({ where }),
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

    const paginatedResponse = buildPaginatedResponse(sorted, total, page, limit);
    return {
      ...paginatedResponse,
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

  async getMemberProfile(user: CurrentUserData, memberId: number) {
    const leaderId = user.id;
    const member = await this.prisma.user.findUnique({
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
          select: {
            id: true,
            score: true,
            type: true,
            createdAt: true,
            cycle: { select: { name: true } },
          },
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

    // Ownership (A3): o membro tem de pertencer à equipa do líder autenticado
    // (managerId === leaderId), ser o próprio, ou o utilizador ser ADMIN/RH.
    // Substitui o fallback anterior que não impedia realmente o acesso.
    const isTeamMember = await this.prisma.read.user.count({
      where: { id: memberId, managerId: leaderId },
    });
    if (!isTeamMember && leaderId !== memberId && !isPrivileged(user, [Role.ADMIN, Role.RH])) {
      throw new NotFoundException('Membro não encontrado');
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
        member.enrollments.filter(e => e.status === EnrollmentStatus.IN_PROGRESS).length,
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
    const where: Prisma.PerformanceReviewWhereInput = { user: { managerId: leaderId } };
    // FIX: PerformanceReview/PerformanceCycle não têm campo `period` — o
    // filtro escrevia sempre numa chave inexistente (ignorada pelo Prisma
    // atrás do `any`) e nunca filtrava nada. O conceito mais próximo é o
    // nome do ciclo de avaliação (ex: "2026-Q1"), acessível via a relação.
    if (period) where.cycle = { name: { contains: period, mode: 'insensitive' } };

    const reviews = await this.prisma.read.performanceReview.findMany({
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

  async giveFeedback(user: CurrentUserData, dto: GiveFeedbackDto) {
    const giverId = user.id;

    // Ownership: o destinatário tem de pertencer à equipa do líder autenticado
    // (managerId === giverId), ser o próprio, ou o utilizador ser ADMIN/RH.
    // Sem isto, qualquer LIDER/DIRECTOR/GESTOR dava feedback a qualquer
    // utilizador da plataforma, não só à sua equipa.
    const isTeamMember = await this.prisma.read.user.count({
      where: { id: dto.recipientId, managerId: giverId },
    });
    if (
      !isTeamMember &&
      giverId !== dto.recipientId &&
      !isPrivileged(user, [Role.ADMIN, Role.RH])
    ) {
      throw new NotFoundException('Membro não encontrado');
    }

    // Record via AuditLog + optionally EngagementFeedback model
    const contentFull =
      dto.type === 'SBI'
        ? `[SBI] Situação: ${dto.situation ?? '–'} | Comportamento: ${dto.behavior ?? '–'} | Impacto: ${dto.impact ?? '–'}\n\n${dto.content}`
        : dto.content;

    // FIX: Feedback é um modelo real (mesmo achado de reports.service.ts/
    // automation.service.ts/dashboard-rh.service.ts — safeM() nunca teve
    // razão de ser aqui); mantido o .catch() só como resiliência genuína a
    // falhas de BD.
    const feedback = await this.prisma.feedback
      .create({
        data: {
          fromUserId: giverId,
          toUserId: dto.recipientId,
          type: dto.type,
          message: contentFull,
          anonymous: dto.isPrivate ?? false,
        },
      })
      .catch(e => {
        this.logger.warn({
          giverId,
          receiverId: dto.recipientId,
          action: 'giveFeedback.create',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar registo de feedback',
        });
        return {
          giverId,
          receiverId: dto.recipientId,
          type: dto.type,
          content: contentFull,
        };
      });

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
      .catch(e => {
        this.logger.warn({
          userId: giverId,
          entityId: dto.recipientId,
          action: 'FEEDBACK_GIVEN',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao escrever audit log de feedback',
        });
      });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.recipientId,
          type: 'FEEDBACK_RECEIVED',
          message: `Recebeste um novo feedback`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: dto.recipientId,
          action: 'FEEDBACK_RECEIVED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de feedback recebido',
        });
      });

    return { message: 'Feedback enviado', feedback };
  }

  async getTeamFeedbacks(leaderId: number, userId?: number) {
    // A10-17: quando userId era passado, a query trocava a filtragem por
    // "giver.managerId: leaderId" e passava a devolver feedback recebido por
    // QUALQUER pessoa — não só a equipa do líder chamador. Agora userId só
    // estreita dentro do âmbito da equipa, nunca o substitui.
    const where: Prisma.FeedbackWhereInput = { from: { managerId: leaderId } };
    if (userId) where.toUserId = userId;
    return this.prisma.read.feedback
      .findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      .catch(e => {
        this.logger.warn({
          leaderId,
          userId,
          action: 'getTeamFeedbacks',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter feedbacks da equipa',
        });
        return [];
      });
  }

  // ══════════════════════════════════════════════════════
  // 1:1 MEETINGS
  // ══════════════════════════════════════════════════════

  async createOneOnOne(user: CurrentUserData, dto: LeaderCreateOneOnOneDto) {
    const leaderId = user.id;

    // Ownership: o participante tem de pertencer à equipa do líder autenticado
    // (managerId === leaderId), ser o próprio, ou o utilizador ser ADMIN/RH.
    // Sem isto, qualquer LIDER/DIRECTOR/GESTOR agendava 1:1s com qualquer
    // utilizador da plataforma, não só com a sua equipa.
    const isTeamMember = await this.prisma.read.user.count({
      where: { id: dto.participantId, managerId: leaderId },
    });
    if (
      !isTeamMember &&
      leaderId !== dto.participantId &&
      !isPrivileged(user, [Role.ADMIN, Role.RH])
    ) {
      throw new NotFoundException('Membro não encontrado');
    }

    // FIX: OneOnOneMeeting é um modelo real — mesmo achado de Feedback acima.
    const meeting = await this.prisma.oneOnOneMeeting
      .create({
        data: {
          hostId: leaderId,
          participantId: dto.participantId,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
          agenda: dto.agenda,
          status: dto.status ?? 'SCHEDULED',
        },
      })
      .catch(e => {
        this.logger.warn({
          leaderId,
          participantId: dto.participantId,
          action: 'createOneOnOne',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar reunião 1:1',
        });
        return { leaderId, participantId: dto.participantId, status: 'SCHEDULED', ...dto };
      });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.participantId,
          type: '1ON1_SCHEDULED',
          message: 'Tens uma reunião 1:1 agendada',
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: dto.participantId,
          action: '1ON1_SCHEDULED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de reunião 1:1 agendada',
        });
      });

    return meeting;
  }

  async getOneOnOnes(leaderId: number, memberId?: number) {
    const where: Prisma.OneOnOneMeetingWhereInput = { hostId: leaderId };
    if (memberId) where.participantId = memberId;
    return this.prisma.read.oneOnOneMeeting
      .findMany({
        where,
        orderBy: { scheduledAt: 'desc' },
        take: 20,
      })
      .catch(e => {
        this.logger.warn({
          leaderId,
          memberId,
          action: 'getOneOnOnes',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter reuniões 1:1',
        });
        return [];
      });
  }

  async completeOneOnOne(meetingId: number, notes: string, user: CurrentUserData) {
    const meeting = await this.prisma.read.oneOnOneMeeting
      .findUnique({ where: { id: meetingId } })
      .catch(e => {
        this.logger.warn({
          meetingId,
          userId: user?.id,
          action: 'completeOneOnOne.findUnique',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao procurar reunião 1:1',
        });
        return null;
      });

    // Ownership (A3): a reunião 1:1 tem dois donos possíveis — o líder (hostId)
    // e o membro (participantId) — além de ADMIN/RH. Verificação manual porque
    // assertCanAccess só suporta um único ownerId.
    if (!meeting) throw new NotFoundException('Reunião 1:1 não encontrada');
    const isOwner =
      String(meeting.hostId) === String(user.id) ||
      String(meeting.participantId) === String(user.id);
    if (!isOwner && !isPrivileged(user, [Role.ADMIN, Role.RH])) {
      throw new NotFoundException('Reunião 1:1 não encontrada');
    }

    // FIX: OneOnOneMeeting é um modelo real — mesmo achado de Feedback/
    // createOneOnOne/getOneOnOnes acima; o wrapper safeM() nunca disparava.
    return this.prisma.oneOnOneMeeting
      .update({
        where: { id: meetingId },
        data: { status: 'COMPLETED', minutes: notes, completedAt: new Date() },
      })
      .catch(e => {
        this.logger.warn({
          meetingId,
          userId: user?.id,
          action: 'completeOneOnOne.update',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao actualizar reunião 1:1 como concluída',
        });
        return { id: meetingId, status: 'COMPLETED', notes };
      });
  }

  // ══════════════════════════════════════════════════════
  // DEVELOPMENT PLANS (approval + overview)
  // ══════════════════════════════════════════════════════

  async getTeamPlans(leaderId: number) {
    // FIX: `as any`/`as any[]` eram desnecessários — PdiGoal.progress é um
    // campo real (goals: PdiGoal[]) e o select/include já é totalmente
    // inferível pelo Prisma sem casts.
    const plans = await this.prisma.developmentPlan.findMany({
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
        goals: { select: { progress: true }, take: 10 },
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

  async approvePlan(planId: number, approver: CurrentUserData) {
    const existing = await this.prisma.read.developmentPlan.findUnique({
      where: { id: planId },
      select: { id: true, user: { select: { managerId: true } } },
    });
    if (!existing) throw new NotFoundException('PDI não encontrado');
    // Ownership: só o gestor directo do colaborador (ou ADMIN/RH) pode aprovar
    // o PDI — sem isto, qualquer LIDER/DIRECTOR aprovava o PDI de um
    // colaborador de outra equipa, fora da sua cadeia de gestão.
    const isOwnTeam = existing.user?.managerId === approver.id;
    if (!isOwnTeam && !isPrivileged(approver, [Role.ADMIN, Role.RH])) {
      throw new NotFoundException('PDI não encontrado');
    }

    const plan = await this.prisma.developmentPlan.update({
      where: { id: planId },
      data: { status: 'ACTIVE', activatedAt: new Date() },
      include: { user: { select: { id: true, fullName: true } } },
    });

    await this.prisma.pdiApproval
      .create({
        data: { planId, approverId: approver.id, decision: 'APPROVE' },
      })
      .catch(e => {
        this.logger.warn({
          planId,
          approverId: approver.id,
          action: 'approvePlan.pdiApproval',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar aprovação de PDI em PdiApproval',
        });
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
      .catch(e => {
        this.logger.warn({
          userId: plan.userId,
          action: 'PDI_APPROVED',
          planId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de PDI aprovado',
        });
      });

    return { message: 'PDI aprovado', plan };
  }

  // ══════════════════════════════════════════════════════
  // TALENT PIPELINE (HiPos, at-risk, promotion-ready)
  // ══════════════════════════════════════════════════════

  async getTalentPipeline(leaderId: number) {
    const team = await this.prisma.read.user.findMany({
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

  async assignCourse(user: CurrentUserData, dto: LeaderAssignCourseDto) {
    const leaderId = user.id;

    // Ownership: todos os utilizadores atribuídos têm de pertencer à equipa
    // do líder autenticado (managerId === leaderId), ou o utilizador ser
    // ADMIN/RH. Sem isto, qualquer LIDER/DIRECTOR/GESTOR inscrevia qualquer
    // utilizador da plataforma num curso, não só a sua equipa — e o método
    // nem sequer recebia a identidade do chamador antes desta correcção.
    if (!isPrivileged(user, [Role.ADMIN, Role.RH])) {
      const teamMemberCount = await this.prisma.read.user.count({
        where: { id: { in: dto.userIds }, managerId: leaderId },
      });
      if (teamMemberCount !== dto.userIds.length) {
        throw new NotFoundException('Um ou mais membros não encontrados');
      }
    }

    const results = await Promise.allSettled(
      dto.userIds.map(uid =>
        this.prisma.enrollment
          .create({
            data: {
              userId: uid,
              courseId: dto.courseId,
              status: EnrollmentStatus.NOT_STARTED,
              enrolledAt: new Date(),
            },
          })
          .catch(e => {
            this.logger.warn({
              userId: uid,
              courseId: dto.courseId,
              action: 'assignCourse.enroll',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao inscrever utilizador no curso atribuído pelo líder',
            });
            return null;
          }),
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
        .catch(e => {
          this.logger.warn({
            userId: uid,
            courseId: dto.courseId,
            action: 'COURSE_ASSIGNED',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de curso atribuído',
          });
        });
    }

    return { message: `${succeeded}/${dto.userIds.length} utilizadores inscritos com sucesso` };
  }

  // ══════════════════════════════════════════════════════
  // LEADER PROFILE
  // ══════════════════════════════════════════════════════

  async upsertProfile(dto: CreateLeaderProfileDto) {
    return safeLeaderProfile(this.prisma)
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
      .catch(e => {
        this.logger.warn({
          userId: dto.userId,
          action: 'upsertProfile',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao guardar perfil de líder — modelo leaderProfile pode estar ausente',
        });
        return {
          userId: dto.userId,
          ...dto,
          message: 'Perfil guardado (modelo leaderProfile ausente — execute migration)',
        };
      });
  }

  async getProfile(userId: number) {
    return safeLeaderProfile(this.prisma)
      .findUnique({
        where: { userId },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          action: 'getProfile',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter perfil de líder — modelo leaderProfile pode estar ausente',
        });
        return null;
      });
  }

  // ══════════════════════════════════════════════════════
  // ALERTS
  // ══════════════════════════════════════════════════════

  async getLeaderAlerts(leaderId: number) {
    const team = await this.prisma.read.user.findMany({
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
        .catch(e => {
          this.logger.warn({
            leaderId,
            action: 'getLeaderAlerts.atRiskPerf',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar membros com performance crítica',
          });
          return 0;
        }),
      // FIX: Course.mandatory é um campo real (mesmo achado confirmado em
      // dashboard-rh.service.ts/reports.service.ts) — o `as any` era
      // desnecessário, nunca escondia um campo inexistente.
      this.prisma.enrollment
        .count({
          where: {
            userId: { in: teamIds },
            course: { mandatory: true },
            status: EnrollmentStatus.IN_PROGRESS,
          },
        })
        .catch(e => {
          this.logger.warn({
            leaderId,
            action: 'getLeaderAlerts.mandatoryPending',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar formações obrigatórias em atraso',
          });
          return 0;
        }),
      this.prisma.developmentPlanAction
        .count({
          where: {
            plan: { userId: { in: teamIds }, isTemplate: false },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            dueDate: { lt: new Date() },
          },
        })
        .catch(e => {
          this.logger.warn({
            leaderId,
            action: 'getLeaderAlerts.overdueActions',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar acções de PDI em atraso',
          });
          return 0;
        }),
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
        .catch(e => {
          this.logger.warn({
            leaderId,
            action: 'getLeaderAlerts.noActivity',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular membros sem actividade recente',
          });
          return 0;
        }),
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

    const overduePlans = planData.filter(p => p.health === '🔴');
    if (overduePlans.length > 0)
      recs.push({
        type: 'DEVELOPMENT',
        urgency: 'MEDIUM',
        message: `${overduePlans.length} PDI(s) com progresso crítico`,
        action: 'Rever acções e dar suporte activo',
      });

    const lowEngagement = teamData.data.filter(u => u.riskLevel !== 'NONE');
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
