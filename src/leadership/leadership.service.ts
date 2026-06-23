import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeadershipProgramDto,
  UpdateLeadershipProgramDto,
  EnrollLeadershipDto,
  UpdateParticipantProgressDto,
  LeadershipCreateOneOnOneDto,
  CompleteOneOnOneDto,
  Submit360FeedbackDto,
  SubmitPulseDto,
  CreateMentoringDto,
  LogMentoringSessionDto,
  UpsertTeamHealthDto,
  SendKudosDto,
  LeadershipFilterDto,
} from './leadership.dto';

@Injectable()
export class LeadershipService {
  private readonly logger = new Logger(LeadershipService.name);
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  // ─── PROGRAMAS ────────────────────────────────────────────────────────────

  async findAll(filters: LeadershipFilterDto) {
    const { page = 1, limit = 20, level, status, mandatory } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (level) where.level = level;
    if (status) where.status = status;
    if (mandatory !== undefined) where.mandatory = mandatory;

    const [data, total] = await Promise.all([
      this.prismaRead.leadershipProgram.findMany({
        where,
        skip,
        take: limit,
        include: { _count: { select: { participants: true } } },
        orderBy: [{ level: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prismaRead.leadershipProgram.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const p = await this.prismaRead.leadershipProgram.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatarUrl: true,
                position: { select: { name: true } },
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        },
        _count: { select: { participants: true } },
      },
    });
    if (!p) throw new NotFoundException('Programa de liderança não encontrado');
    return p;
  }

  async create(dto: CreateLeadershipProgramDto) {
    return this.prisma.leadershipProgram.create({
      data: {
        name: dto.name,
        description: dto.description,
        level: dto.level,
        status: dto.status ?? 'DRAFT',
        durationWeeks: dto.durationWeeks,
        learningPathId: dto.learningPathId,
        mandatory: dto.mandatory ?? false,
        minLeadershipScore: dto.minLeadershipScore,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  async update(id: number, dto: UpdateLeadershipProgramDto) {
    await this.findOne(id);
    return this.prisma.leadershipProgram.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const p = (await this.findOne(id)) as any;
    if (p._count.participants > 0) {
      throw new BadRequestException(
        'Programa com participantes não pode ser eliminado. Archive-o primeiro.',
      );
    }
    await this.prisma.leadershipProgram.delete({ where: { id } });
    return { message: 'Programa removido' };
  }

  // ─── PARTICIPAÇÃO ─────────────────────────────────────────────────────────

  async enroll(dto: EnrollLeadershipDto) {
    const exists = await this.prisma.leadershipParticipant.findUnique({
      where: { userId_programId: { userId: dto.userId, programId: dto.programId } },
    });
    if (exists) throw new ConflictException('Utilizador já inscrito neste programa');

    const participant = await this.prisma.leadershipParticipant.create({
      data: {
        userId: dto.userId,
        programId: dto.programId,
        status: 'ENROLLED',
        progress: 0,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        program: true,
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.userId,
          type: 'LEADERSHIP_ENROLLED',
          message: `Inscrito no programa de liderança "${participant.program.name}"`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return participant;
  }

  async updateProgress(userId: number, programId: number, dto: UpdateParticipantProgressDto) {
    const participant = await this.prismaRead.leadershipParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
      include: { program: true },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado');

    const isCompleting = dto.progress >= 100 || dto.status === 'COMPLETED';

    const updated = await this.prisma.leadershipParticipant.update({
      where: { userId_programId: { userId, programId } },
      data: {
        progress: dto.progress,
        status: isCompleting
          ? 'COMPLETED'
          : (dto.status ?? (dto.progress > 0 ? 'IN_PROGRESS' : participant.status)),
        completedAt: isCompleting ? new Date() : undefined,
        notes: dto.notes ?? undefined,
      },
    });

    if (isCompleting) {
      const code = `LEAD-${Date.now()}-${userId}-${programId}`;
      await this.prisma.certificate
        .create({
          data: {
            userId,
            type: 'LEADERSHIP',
            programId,
            validationCode: code,
            fileUrl: `/certificates/${code}.pdf`,
          },
        })
        .catch(() => {});

      await this.prisma.userPoints
        .upsert({
          where: { userId },
          create: { userId, points: 300 },
          update: { points: { increment: 300 } },
        })
        .catch(() => {});

      // Recalcular leadership score
      await this.recalcLeadershipScore(userId);
    }

    return updated;
  }

  async withdraw(userId: number, programId: number) {
    const existing = await this.prisma.leadershipParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
    });
    if (!existing) throw new NotFoundException('Inscrição não encontrada');
    return this.prisma.leadershipParticipant.update({
      where: { userId_programId: { userId, programId } },
      data: { status: 'WITHDRAWN' },
    });
  }

  async getMyPrograms(userId: number) {
    return this.prismaRead.leadershipParticipant.findMany({
      where: { userId },
      include: {
        program: {
          select: { id: true, name: true, level: true, status: true, durationWeeks: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  async getProgramStats(programId: number) {
    await this.findOne(programId);
    const [total, completed, inProgress, avgProgress] = await Promise.all([
      this.prismaRead.leadershipParticipant.count({ where: { programId } }),
      this.prismaRead.leadershipParticipant.count({ where: { programId, status: 'COMPLETED' } }),
      this.prismaRead.leadershipParticipant.count({ where: { programId, status: 'IN_PROGRESS' } }),
      this.prismaRead.leadershipParticipant.aggregate({
        where: { programId },
        _avg: { progress: true },
      }),
    ]);

    return {
      programId,
      total,
      completed,
      inProgress,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      avgProgress: Math.round(avgProgress._avg.progress ?? 0),
    };
  }

  // ─── TEAM DASHBOARD ───────────────────────────────────────────────────────

  async getTeamDashboard(managerId: number) {
    const team = await this.prismaRead.user.findMany({
      where: { managerId, active: true },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        email: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
    });

    const teamData = await Promise.all(
      team.map(async member => {
        const [latestReview, pendingApprovals, feedbackCount] = await Promise.all([
          this.prismaRead.performanceReview.findFirst({
            where: { userId: member.id },
            orderBy: { createdAt: 'desc' },
            select: { score: true, category: true, status: true },
          }),
          this.prismaRead.performanceReview.count({
            where: { userId: member.id, status: 'PENDING_APPROVAL' },
          }),
          (this.prisma as any).continuousFeedback.count({
            where: { userId: member.id },
          }),
        ]);

        const pendingLeaves = 0; // TODO: implementar LeaveRequest

        // Calcular status semáforo
        const perfScore = latestReview?.score ?? 0;
        const hasPending = pendingApprovals > 0;
        let statusColor = 'GREEN';
        if (perfScore < 2 || hasPending) statusColor = 'YELLOW';
        if (perfScore < 1) statusColor = 'RED';

        return {
          user: member,
          latestReview,
          pendingApprovals,
          feedbackCount,
          statusColor,
        };
      }),
    );

    // Alertas do gestor
    const alerts = teamData
      .filter(m => m.statusColor !== 'GREEN' || m.pendingApprovals > 0)
      .map(m => ({
        userId: m.user.id,
        name: m.user.fullName,
        type: m.statusColor === 'RED' ? 'PERFORMANCE_RISK' : 'PENDING_APPROVAL',
        message:
          m.statusColor === 'RED'
            ? `${m.user.fullName} com score de performance crítico`
            : `${m.user.fullName} tem ${m.pendingApprovals} aprovações pendentes`,
      }));

    // Team health
    const teamHealth = await this.getTeamHealth(managerId);

    return { team: teamData, alerts, teamHealth, managerId, total: team.length };
  }

  // ─── TEAM HEALTH ──────────────────────────────────────────────────────────

  async getTeamHealth(managerId: number) {
    const existing = await this.prisma.teamHealth.findUnique({ where: { managerId } });

    // Calcular métricas automáticas
    const teamIds = (
      await this.prismaRead.user.findMany({
        where: { managerId, active: true },
        select: { id: true },
      })
    ).map(u => u.id);

    const [completedReviews, totalReviews, completedPdis, totalPdis] = await Promise.all([
      this.prismaRead.performanceReview.count({
        where: { userId: { in: teamIds }, status: 'FINALIZED' },
      }),
      this.prismaRead.performanceReview.count({ where: { userId: { in: teamIds } } }),
      this.prismaRead.leadershipParticipant.count({
        where: { userId: { in: teamIds }, status: 'COMPLETED' },
      }),
      this.prismaRead.leadershipParticipant.count({ where: { userId: { in: teamIds } } }),
    ]);

    const evaluationsOnTimePct =
      totalReviews > 0 ? Math.round((completedReviews / totalReviews) * 100) : 0;
    const pdisCompletedPct = totalPdis > 0 ? Math.round((completedPdis / totalPdis) * 100) : 0;

    // Calcular score global (0-100)
    const engagement = existing?.engagementScore ?? 0;
    const turnoverPenalty = 100 - (existing?.turnoverRate ?? 0);
    const absentPenalty = 100 - (existing?.absenteeismRate ?? 0);
    const globalScore = Math.round(
      engagement * 0.3 +
        turnoverPenalty * 0.2 +
        absentPenalty * 0.15 +
        pdisCompletedPct * 0.2 +
        evaluationsOnTimePct * 0.15,
    );

    let healthStatus = 'GREEN';
    if (globalScore < 60) healthStatus = 'YELLOW';
    if (globalScore < 40) healthStatus = 'RED';

    return {
      managerId,
      globalScore,
      healthStatus,
      metrics: {
        engagementScore: existing?.engagementScore ?? null,
        turnoverRate: existing?.turnoverRate ?? null,
        absenteeismRate: existing?.absenteeismRate ?? null,
        pdisCompletedPct,
        evaluationsOnTimePct,
      },
    };
  }

  async upsertTeamHealth(managerId: number, dto: UpsertTeamHealthDto) {
    return this.prisma.teamHealth.upsert({
      where: { managerId },
      create: { managerId, ...dto },
      update: { ...dto, updatedAt: new Date() },
    });
  }

  // ─── ONE-ON-ONE ───────────────────────────────────────────────────────────

  async createOneOnOne(managerId: number, dto: LeadershipCreateOneOnOneDto) {
    const oneOnOne = await this.prisma.oneOnOne.create({
      data: {
        managerId,
        subordinateId: dto.subordinateId,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes ?? 30,
        agenda: dto.agenda,
        meetingUrl: dto.meetingUrl,
        status: 'SCHEDULED',
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.subordinateId,
          type: 'ONEONONE_SCHEDULED',
          message: `1:1 agendado para ${new Date(dto.scheduledAt).toLocaleDateString('pt-AO')}`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return oneOnOne;
  }

  async getOneOnOnes(managerId: number, subordinateId?: number) {
    const where: any = { managerId };
    if (subordinateId) where.subordinateId = subordinateId;

    return this.prismaRead.oneOnOne.findMany({
      where,
      include: {
        subordinate: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 50,
    });
  }

  async completeOneOnOne(managerId: number, dto: CompleteOneOnOneDto) {
    const meeting = await this.prismaRead.oneOnOne.findFirst({
      where: { id: dto.oneOnOneId, managerId },
    });
    if (!meeting) throw new NotFoundException('1:1 não encontrado');

    return this.prisma.oneOnOne.update({
      where: { id: dto.oneOnOneId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        minutes: dto.minutes,
        actionItems: dto.actionItems,
        nextMeetingDate: dto.nextMeetingDate ? new Date(dto.nextMeetingDate) : null,
      },
    });
  }

  // ─── FEEDBACK 360° ────────────────────────────────────────────────────────

  async submit360Feedback(respondentId: number, dto: Submit360FeedbackDto) {
    // Criar ou actualizar respostas por competência
    const feedback = await this.prisma.leadershipFeedback360.create({
      data: {
        leaderId: dto.leaderId,
        respondentId: dto.anonymous ? null : respondentId,
        cycleId: dto.cycleId,
        anonymous: dto.anonymous ?? false,
        qualitativeFeedback: dto.qualitativeFeedback,
        responses: {
          create: dto.responses.map(r => ({
            competency: r.competency,
            score: r.score,
          })),
        },
      },
    });

    // Recalcular score 360 do líder
    await this.recalcLeadershipScore(dto.leaderId);

    // Notificar líder (sem identificar respondente se anónimo)
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.leaderId,
          type: 'LEADERSHIP_360_RECEIVED',
          message: 'Recebeu um novo feedback 360° de liderança',
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return { message: 'Feedback 360° submetido', feedbackId: feedback.id };
  }

  async get360Summary(leaderId: number) {
    const feedbacks = await this.prismaRead.leadershipFeedback360.findMany({
      where: { leaderId },
      include: { responses: true },
    });

    if (!feedbacks.length) return { leaderId, totalResponses: 0, byCompetency: [], avgScore: 0 };

    // Agrupar por competência
    const compMap: Record<string, number[]> = {};
    for (const f of feedbacks) {
      for (const r of f.responses) {
        if (!compMap[r.competency]) compMap[r.competency] = [];
        compMap[r.competency].push(r.score);
      }
    }

    const byCompetency = Object.entries(compMap).map(([competency, scores]) => ({
      competency,
      avgScore: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10,
      count: scores.length,
      insight:
        scores.filter(s => s <= 2).length / scores.length >= 0.5
          ? `⚠ ${Math.round((scores.filter(s => s <= 2).length / scores.length) * 100)}% indicam lacuna`
          : null,
    }));

    const allScores = Object.values(compMap).flat();
    const avgScore =
      Math.round((allScores.reduce((s, v) => s + v, 0) / allScores.length) * 10) / 10;

    const qualitative = feedbacks
      .filter(f => f.qualitativeFeedback)
      .map(f => f.qualitativeFeedback);

    return { leaderId, totalResponses: feedbacks.length, byCompetency, avgScore, qualitative };
  }

  // ─── PULSE ────────────────────────────────────────────────────────────────

  async submitPulse(respondentId: number, dto: SubmitPulseDto) {
    return this.prisma.leadershipPulse.create({
      data: {
        leaderId: dto.leaderId,
        respondentId,
        overallScore: dto.overallScore,
        q1: dto.q1,
        q2: dto.q2,
        q3: dto.q3,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      },
    });
  }

  // ─── MENTORING ────────────────────────────────────────────────────────────

  async createMentoring(dto: CreateMentoringDto) {
    const existing = await this.prisma.mentoring.findFirst({
      where: { mentorId: dto.mentorId, menteeId: dto.menteeId, status: 'ACTIVE' },
    });
    if (existing)
      throw new ConflictException('Relação de mentoring já existe entre estes utilizadores');

    return this.prisma.mentoring.create({
      data: {
        mentorId: dto.mentorId,
        menteeId: dto.menteeId,
        objective: dto.objective,
        durationMonths: dto.durationMonths,
        reverseMentoring: dto.reverseMentoring ?? false,
        status: 'ACTIVE',
      },
    });
  }

  async logMentoringSession(userId: number, dto: LogMentoringSessionDto) {
    const mentoring = await this.prismaRead.mentoring.findFirst({
      where: { id: dto.mentoringId, OR: [{ mentorId: userId }, { menteeId: userId }] },
    });
    if (!mentoring) throw new NotFoundException('Mentoring não encontrado ou sem acesso');

    return this.prisma.mentoringSession.create({
      data: {
        mentoringId: dto.mentoringId,
        sessionDate: new Date(dto.sessionDate),
        durationMinutes: dto.durationMinutes,
        summary: dto.summary,
        actionItems: dto.actionItems,
        rating: dto.rating,
      },
    });
  }

  async getMyMentoring(userId: number) {
    const [asMentor, asMentee] = await Promise.all([
      this.prismaRead.mentoring.findMany({
        where: { mentorId: userId, status: 'ACTIVE' },
        include: {
          mentee: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              position: { select: { name: true } },
            },
          },
          sessions: { orderBy: { sessionDate: 'desc' }, take: 3 },
        },
      }),
      this.prismaRead.mentoring.findMany({
        where: { menteeId: userId, status: 'ACTIVE' },
        include: {
          mentor: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              position: { select: { name: true } },
            },
          },
          sessions: { orderBy: { sessionDate: 'desc' }, take: 3 },
        },
      }),
    ]);

    return { asMentor, asMentee };
  }

  // ─── KUDOS ────────────────────────────────────────────────────────────────

  async sendKudos(senderId: number, dto: SendKudosDto) {
    if (senderId === dto.receiverId) {
      throw new BadRequestException('Não pode dar kudos a si próprio');
    }

    const kudos = await this.prisma.kudos.create({
      data: { senderId, receiverId: dto.receiverId, message: dto.message, badge: dto.badge },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.receiverId,
          type: 'KUDOS_RECEIVED',
          message: `Recebeu um reconhecimento de um colega!`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return kudos;
  }

  async getKudosWall(userId?: number) {
    const where: any = {};
    if (userId) where.receiverId = userId;

    return this.prismaRead.kudos.findMany({
      where,
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true } },
        receiver: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── LEADERSHIP SCORE ─────────────────────────────────────────────────────

  async recalcLeadershipScore(leaderId: number) {
    const [teamHealth, programsCompleted, feedback360, oneOnOnes] = await Promise.all([
      this.prismaRead.teamHealth.findUnique({ where: { managerId: leaderId } }),
      this.prismaRead.leadershipParticipant.count({
        where: { userId: leaderId, status: 'COMPLETED' },
      }),
      this.get360Summary(leaderId),
      this.prismaRead.oneOnOne.count({ where: { managerId: leaderId, status: 'COMPLETED' } }),
    ]);

    const teamHealthScore = teamHealth ? ((teamHealth as any).engagementScore ?? 0) : 0;
    const developmentScore = Math.min(100, programsCompleted * 20); // 5 programas = 100
    const feedback360Score = feedback360.avgScore > 0 ? (feedback360.avgScore / 5) * 100 : 0;
    const punctualityScore = Math.min(100, oneOnOnes * 10); // 10 reuniões = 100

    // Leadership Score (0-1000)
    const score = Math.round(
      teamHealthScore * 0.3 * 10 + // max 300
        developmentScore * 0.25 * 10 + // max 250
        feedback360Score * 0.2 * 10 + // max 200
        punctualityScore * 0.15 * 10 + // max 150
        Math.min(100, programsCompleted * 20) * 0.1 * 10, // max 100
    );

    let classification = 'AVERAGE';
    if (score >= 800) classification = 'TOP_10';
    else if (score >= 650) classification = 'ABOVE_AVERAGE';
    else if (score < 400) classification = 'CRITICAL';
    else if (score < 500) classification = 'BELOW_AVERAGE';

    await this.prisma.leadershipScore.upsert({
      where: { userId: leaderId },
      create: { userId: leaderId, score, classification, calculatedAt: new Date() },
      update: { score, classification, calculatedAt: new Date() },
    });

    return { leaderId, score, classification };
  }

  async getLeadershipScore(userId: number) {
    return this.prismaRead.leadershipScore.findUnique({ where: { userId } });
  }

  async getLeadershipRanking() {
    return this.prismaRead.leadershipScore.findMany({
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
      },
      orderBy: { score: 'desc' },
      take: 50,
    });
  }

  // ─── DASHBOARD DO LÍDER (visão pessoal) ──────────────────────────────────

  async getMyLeaderDashboard(userId: number) {
    const [score, programs, mentoring, upcoming1on1s, recentKudos] = await Promise.all([
      this.getLeadershipScore(userId),
      this.getMyPrograms(userId),
      this.getMyMentoring(userId),
      this.prismaRead.oneOnOne.findMany({
        where: { managerId: userId, status: 'SCHEDULED', scheduledAt: { gte: new Date() } },
        include: { subordinate: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
      }),
      this.getKudosWall(userId),
    ]);

    return { score, programs, mentoring, upcoming1on1s, recentKudos };
  }
}
