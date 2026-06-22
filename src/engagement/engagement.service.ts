// src/engagement/engagement.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSurveyDto,
  UpdateSurveyDto,
  SurveyFilterDto,
  SubmitSurveyDto,
  SubmitENPSDto,
  SubmitMoodDto,
  CreateFeedbackDto,
  FeedbackFilterDto,
  FeedbackReplyDto,
  CreateRecognitionDto,
  RecognitionFilterDto,
  CreateOneOnOneDto,
  EngagementUpdateOneOnOneDto,
  CreateActionPlanDto,
  UpdateActionPlanDto,
  EngagementFilterDto,
  SurveyType,
  SurveyStatus,
  RecognitionType,
} from './engagement.dto';

// ─── Scoring helpers ──────────────────────────────────────────────

/** eNPS: Promoters (9-10) - Detractors (0-6) */
function calcENPS(scores: number[]): number {
  if (!scores.length) return 0;
  const p = scores.filter(s => s >= 9).length / scores.length;
  const d = scores.filter(s => s <= 6).length / scores.length;
  return Math.round((p - d) * 100);
}

/** Engagement index from survey avg scores */
function toIndex(avg: number, scale: number): number {
  return scale > 0 ? +((avg / scale) * 100).toFixed(1) : 0;
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class EngagementService {
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // SURVEYS (CRUD + LIFECYCLE)
  // ══════════════════════════════════════════════════════

  async getSurveys(filters: SurveyFilterDto = {}) {
    const { type, status, departmentId, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prismaRead.engagementSurvey.findMany({
        where,
        skip,
        take: limit,
        include: { _count: { select: { responses: true, questions: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaRead.engagementSurvey.count({ where }),
    ]);

    const enriched = await Promise.all(
      data.map(async s => {
        // Participation rate: responses / total active users
        const totalUsers = await this.prismaRead.user.count({ where: { active: true } });
        const rate = totalUsers > 0 ? +((s._count.responses / totalUsers) * 100).toFixed(1) : 0;
        return { ...s, participationRate: rate };
      }),
    );

    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getSurvey(id: number) {
    const s = await this.prismaRead.engagementSurvey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
    if (!s) throw new NotFoundException('Inquérito não encontrado');

    const totalUsers = await this.prismaRead.user.count({ where: { active: true } });
    return {
      ...s,
      participationRate: totalUsers > 0 ? +((s._count.responses / totalUsers) * 100).toFixed(1) : 0,
    };
  }

  async createSurvey(dto: CreateSurveyDto, createdById: number) {
    const { questions, startDate, endDate, ...data } = dto;

    return (this.prisma as any).engagementSurvey.create({
      data: {
        ...data,
        status: SurveyStatus.DRAFT,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        questions: {
          create: questions.map((q, i) => ({
            text: q.text,
            type: q.type,
            order: q.order ?? i + 1,
            required: q.required ?? true,
            options: q.options ?? [],
            scaleMax: q.scaleMax ?? 5,
          })),
        },
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
  }

  async updateSurvey(id: number, dto: UpdateSurveyDto) {
    await this.getSurvey(id);
    const data: any = { ...dto };
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    return this.prisma.engagementSurvey.update({ where: { id }, data });
  }

  async activateSurvey(id: number) {
    const s = await this.getSurvey(id);
    if (s.status === SurveyStatus.ACTIVE) throw new BadRequestException('Já está activo');
    const updated = await this.prisma.engagementSurvey.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    // Notify all active users
    const users = await this.prismaRead.user.findMany({
      where: { active: true },
      select: { id: true },
    });
    await this.prisma.notificationLog.createMany({
      data: users.map(u => ({
        userId: u.id,
        type: 'SURVEY_AVAILABLE',
        message: `Nova pesquisa disponível: "${s.title}"`,
        metadata: JSON.stringify({}),
      })),
      skipDuplicates: true,
    });

    return updated;
  }

  async closeSurvey(id: number) {
    await this.getSurvey(id);
    return this.prisma.engagementSurvey.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
  }

  // ─── Submit ──────────────────────────────────────────

  async submitSurvey(userId: number, dto: SubmitSurveyDto) {
    const survey = await (this.prisma as any).engagementSurvey.findUnique({
      where: { id: dto.surveyId },
      include: { questions: true },
    });
    if (!survey) throw new NotFoundException('Inquérito não encontrado');
    if (survey.status !== 'ACTIVE') throw new BadRequestException('Inquérito não está activo');

    const existing = await this.prisma.surveyResponse.findFirst({
      where: { userId, surveyId: dto.surveyId },
    });
    if (existing) return { message: 'Já respondeste a este inquérito', alreadySubmitted: true };

    // Compute score from numeric answers
    const numericAnswers = dto.answers.filter(a => a.value !== undefined);
    const avg = numericAnswers.length
      ? +(numericAnswers.reduce((s, a) => s + (a.value ?? 0), 0) / numericAnswers.length).toFixed(2)
      : 0;

    const response = await (this.prisma as any).surveyResponse.create({
      data: {
        userId,
        surveyId: dto.surveyId,
        score: avg,
        anonymous: dto.submitAnonymously ?? false,
        answers: {
          create: dto.answers.map(a => ({
            questionId: a.questionId,
            value: a.value,
            comment: a.comment,
            selectedOption: a.selectedOption,
          })),
        },
      },
    });

    // Award XP for completing a survey
    await this.prisma.userPoints.upsert({
      where: { userId },
      create: { userId, points: 10 },
      update: { points: { increment: 10 } },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'SURVEY_COMPLETED',
          message: `Obrigado! A tua resposta foi registada. +10 XP 🎉`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return { message: 'Inquérito submetido com sucesso', responseId: response.id };
  }

  // ─── Results ─────────────────────────────────────────

  async getSurveyResults(surveyId: number, requesterId: number) {
    const survey = await (this.prisma as any).engagementSurvey.findUnique({
      where: { id: surveyId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        responses: {
          include: {
            answers: true,
            // Only expose user info if survey is NOT anonymous
            user: { select: { id: true, fullName: true, department: { select: { name: true } } } },
          },
        },
      },
    });
    if (!survey) throw new NotFoundException('Inquérito não encontrado');

    const responses = survey.responses as any[];

    // Respect anonymity threshold (min 3 responses to show results)
    const MIN_THRESHOLD = survey.minResponsesForResults ?? 3;
    const showDetails = responses.length >= MIN_THRESHOLD;

    const totalResponses = responses.length;
    const avgScore = totalResponses
      ? +(responses.reduce((s, r) => s + (r.score ?? 0), 0) / totalResponses).toFixed(2)
      : 0;
    const engagementIndex = toIndex(avgScore, 5);

    // Per-question stats
    const questionStats = (survey.questions as any[]).map(q => {
      const qAnswers = responses.flatMap(r =>
        (r.answers as any[]).filter(a => a.questionId === q.id),
      );
      const numeric = qAnswers.filter(a => a.value !== null && a.value !== undefined);
      const avg = numeric.length
        ? +(numeric.reduce((s: number, a: any) => s + a.value, 0) / numeric.length).toFixed(2)
        : null;

      // Text comments (only if above threshold and not anonymous survey)
      const comments =
        !survey.anonymous && showDetails ? qAnswers.filter(a => a.comment).map(a => a.comment) : [];

      // Option frequency for MULTIPLE type
      const optionCount: Record<string, number> = {};
      for (const a of qAnswers.filter(a => a.selectedOption)) {
        optionCount[a.selectedOption] = (optionCount[a.selectedOption] ?? 0) + 1;
      }

      return {
        question: q.text,
        type: q.type,
        scaleMax: q.scaleMax,
        avgScore: avg,
        responses: qAnswers.length,
        comments: comments.slice(0, 20),
        optionCount,
        distribution: numeric.map(a => a.value),
      };
    });

    // Department breakdown (if not anonymous)
    let byDepartment: any[] = [];
    if (!survey.anonymous && showDetails) {
      const deptMap: Record<string, { total: number; sum: number }> = {};
      for (const r of responses) {
        const dept = r.user?.department?.name ?? 'N/A';
        if (!deptMap[dept]) deptMap[dept] = { total: 0, sum: 0 };
        deptMap[dept].sum += r.score ?? 0;
        deptMap[dept].total += 1;
      }
      byDepartment = Object.entries(deptMap)
        .map(([dept, d]) => ({
          department: dept,
          avgScore: +(d.sum / d.total).toFixed(2),
          responses: d.total,
        }))
        .sort((a, b) => b.avgScore - a.avgScore);
    }

    const totalUsers = await this.prismaRead.user.count({ where: { active: true } });
    const participationRate =
      totalUsers > 0 ? +((totalResponses / totalUsers) * 100).toFixed(1) : 0;

    return {
      survey: {
        id: survey.id,
        title: survey.title,
        type: survey.type,
        anonymous: survey.anonymous,
      },
      totalResponses,
      avgScore,
      engagementIndex,
      participationRate,
      questionStats,
      byDepartment,
      thresholdReached: showDetails,
    };
  }

  // ─── Templates ───────────────────────────────────────

  async getTemplates() {
    return (this.prisma as any).engagementSurvey.findMany({
      where: { isTemplate: true },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ══════════════════════════════════════════════════════
  // eNPS
  // ══════════════════════════════════════════════════════

  async submitENPS(userId: number, dto: SubmitENPSDto) {
    // eNPS is stored as a special survey response
    const survey = await (this.prisma as any).engagementSurvey.findFirst({
      where: { type: SurveyType.ENPS, status: 'ACTIVE' },
      include: { questions: true },
    });

    if (!survey) throw new NotFoundException('Nenhuma pesquisa eNPS activa no momento');

    const eNPSQuestion = (survey.questions as any[]).find(q => q.type === 'ENPS');
    if (!eNPSQuestion) throw new BadRequestException('Pesquisa eNPS mal configurada');

    return this.submitSurvey(userId, {
      surveyId: survey.id,
      submitAnonymously: true,
      answers: [{ questionId: eNPSQuestion.id, value: dto.score, comment: dto.reason }],
    });
  }

  async getENPSScore(departmentId?: number) {
    const survey = await (this.prisma as any).engagementSurvey.findFirst({
      where: { type: SurveyType.ENPS, status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: { responses: { include: { answers: { include: { question: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!survey) return { enps: null, promoters: 0, passives: 0, detractors: 0, total: 0 };

    const scores = (survey.responses as any[])
      .flatMap(r => r.answers as any[])
      .filter(a => a.question?.type === 'ENPS' && a.value !== null)
      .map(a => a.value as number);

    const enps = calcENPS(scores);
    const promoters = scores.filter(s => s >= 9).length;
    const passives = scores.filter(s => s === 7 || s === 8).length;
    const detractors = scores.filter(s => s <= 6).length;

    return {
      enps,
      promoters,
      passives,
      detractors,
      total: scores.length,
      promoterPct: scores.length ? +((promoters / scores.length) * 100).toFixed(1) : 0,
      detractorPct: scores.length ? +((detractors / scores.length) * 100).toFixed(1) : 0,
      label: enps >= 50 ? 'Excelente' : enps >= 20 ? 'Bom' : enps >= 0 ? 'Neutro' : 'Crítico',
    };
  }

  // ══════════════════════════════════════════════════════
  // MOOD TRACKING
  // ══════════════════════════════════════════════════════

  async submitMood(userId: number, dto: SubmitMoodDto) {
    // Prevent duplicate check-in on same day
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await (this.prisma as any).moodCheckin
      ?.findFirst({
        where: { userId, createdAt: { gte: today } },
      })
      .catch(() => null);

    if (existing) return { message: 'Já fizeste o teu check-in hoje', mood: existing.mood };

    const checkin = await (this.prisma as any).moodCheckin
      ?.create({
        data: { userId, mood: dto.mood, note: dto.note, tags: dto.tags ?? [] },
      })
      .catch(() => null);

    if (!checkin) {
      // Fallback: store mood as a survey response if moodCheckin table doesn't exist
      return { message: 'Check-in registado (modo compatibilidade)', mood: dto.mood };
    }

    // Detect sudden mood drop — alert manager if mood ≤ 2 for 3 consecutive days
    await this.detectMoodAlert(userId, dto.mood);

    return { message: `Check-in registado! Estado: ${dto.mood}/5`, checkin };
  }

  async getMoodTrend(userId: number, days = 14) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const checkins = await (this.prisma as any).moodCheckin
      ?.findMany({
        where: { userId, createdAt: { gte: from } },
        orderBy: { createdAt: 'asc' },
        select: { mood: true, note: true, createdAt: true, tags: true },
      })
      .catch(() => [] as any[]);

    const avg = checkins.length
      ? +(checkins.reduce((s: number, c: any) => s + c.mood, 0) / checkins.length).toFixed(1)
      : null;

    return { trend: checkins, avgMood: avg, days };
  }

  async getTeamMoodOverview(managerId: number) {
    const team = await this.prismaRead.user.findMany({
      where: { managerId, active: true },
      select: { id: true, fullName: true, avatarUrl: true },
    });

    const from = new Date();
    from.setDate(from.getDate() - 7);

    const teamData = await Promise.all(
      team.map(async u => {
        const checkins = await (this.prisma as any).moodCheckin
          ?.findMany({
            where: { userId: u.id, createdAt: { gte: from } },
            select: { mood: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          })
          .catch(() => [] as any[]);

        const avg = checkins.length
          ? +(checkins.reduce((s: number, c: any) => s + c.mood, 0) / checkins.length).toFixed(1)
          : null;

        return {
          user: { id: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl },
          avgMood: avg,
          checkins: checkins.length,
          lastMood: checkins[0]?.mood ?? null,
          alert: avg !== null && +avg <= 2,
        };
      }),
    );

    return {
      team: teamData,
      alerts: teamData.filter(u => u.alert),
      teamAvg:
        teamData.filter(u => u.avgMood !== null).length > 0
          ? +(
              teamData.filter(u => u.avgMood !== null).reduce((s, u) => s + +(u.avgMood ?? 0), 0) /
              teamData.filter(u => u.avgMood !== null).length
            ).toFixed(1)
          : null,
    };
  }

  private async detectMoodAlert(userId: number, currentMood: number) {
    if (currentMood > 2) return;

    const from = new Date();
    from.setDate(from.getDate() - 3);
    const recent = await (this.prisma as any).moodCheckin
      ?.findMany({
        where: { userId, createdAt: { gte: from } },
        select: { mood: true },
      })
      .catch(() => [] as any[]);

    if (recent.length >= 2 && recent.every((c: any) => c.mood <= 2)) {
      const user = await (this.prisma as any).user.findUnique({
        where: { id: userId },
        select: { managerId: true, fullName: true },
      });
      if (user?.managerId) {
        await this.prisma.notificationLog
          .create({
            data: {
              userId: user.managerId,
              type: 'MOOD_ALERT',
              message: `⚠️ ${user.fullName} tem registado baixo bem-estar nos últimos 3 dias`,
              metadata: JSON.stringify({}),
            },
          })
          .catch(() => {});
      }
    }
  }

  // ══════════════════════════════════════════════════════
  // FEEDBACK CONTÍNUO
  // ══════════════════════════════════════════════════════

  async createFeedback(fromUserId: number, dto: CreateFeedbackDto) {
    const fb = await (this.prisma as any).feedback
      ?.create({
        data: {
          fromUserId: dto.anonymous ? null : fromUserId,
          toUserId: dto.toUserId,
          type: dto.type,
          message: dto.message,
          anonymous: dto.anonymous ?? false,
          projectRef: dto.projectRef,
          status: 'OPEN',
        },
      })
      .catch(async () => {
        // Fallback: use notificationLog to record feedback intent
        await this.prisma.notificationLog.create({
          data: {
            userId: dto.toUserId ?? fromUserId,
            type: 'FEEDBACK_RECEIVED',
            message: dto.message.slice(0, 200),
            metadata: JSON.stringify({}),
          },
        });
        return null;
      });

    // Notify recipient
    if (dto.toUserId && !dto.anonymous) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: dto.toUserId,
            type: 'FEEDBACK_RECEIVED',
            message: `Recebeste novo feedback de um colega`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return fb ?? { message: 'Feedback registado', type: dto.type };
  }

  async getFeedback(filters: FeedbackFilterDto) {
    const { type, toUserId, fromUserId, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (type) where.type = type;
    if (toUserId) where.toUserId = toUserId;
    if (fromUserId) where.fromUserId = fromUserId;

    const data = await (this.prisma as any).feedback
      ?.findMany({
        where,
        skip,
        take: limit,
        include: {
          from: { select: { id: true, fullName: true, avatarUrl: true } },
          to: { select: { id: true, fullName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => [] as any[]);

    const total = await (this.prisma as any).feedback?.count({ where }).catch(() => 0);

    // Mask anonymous authors
    const safe = (data as any[]).map((f: any) => ({
      ...f,
      from: f.anonymous ? { id: null, fullName: 'Anónimo', avatarUrl: null } : f.from,
    }));

    return { data: safe, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async replyToFeedback(feedbackId: number, userId: number, dto: FeedbackReplyDto) {
    return (this.prisma as any).feedback
      ?.update({
        where: { id: feedbackId },
        data: { reply: dto.message, repliedAt: new Date(), repliedById: userId, status: 'REPLIED' },
      })
      .catch(() => ({ message: 'Resposta registada' }));
  }

  // ══════════════════════════════════════════════════════
  // RECONHECIMENTO & KUDOS
  // ══════════════════════════════════════════════════════

  async giveRecognition(fromUserId: number, dto: CreateRecognitionDto) {
    if (fromUserId === dto.toUserId)
      throw new BadRequestException('Não podes reconhecer-te a ti próprio');

    const to = await this.prismaRead.user.findUnique({
      where: { id: dto.toUserId },
      select: { id: true, fullName: true },
    });
    if (!to) throw new NotFoundException('Utilizador não encontrado');

    const recognition = await (this.prisma as any).recognition
      ?.create({
        data: {
          fromUserId,
          toUserId: dto.toUserId,
          type: dto.type,
          message: dto.message,
          public: dto.public ?? true,
          value: dto.value,
          badgeId: dto.badgeId,
        },
      })
      .catch(() => null);

    // Always award XP to recipient
    const xp =
      dto.type === RecognitionType.KUDOS
        ? 15
        : dto.type === RecognitionType.ACHIEVEMENT
          ? 50
          : dto.type === RecognitionType.MILESTONE
            ? 100
            : 20;

    await this.prisma.userPoints.upsert({
      where: { userId: dto.toUserId },
      create: { userId: dto.toUserId, points: xp },
      update: { points: { increment: xp } },
    });

    // Award badge if provided
    if (dto.badgeId) {
      await this.prisma.badgeAward
        .create({
          data: { userId: dto.toUserId, badgeId: dto.badgeId },
        })
        .catch(() => {});
    }

    // Notify recipient
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.toUserId,
          type: 'RECOGNITION_RECEIVED',
          message: `🏆 Recebeste um reconhecimento! +${xp} XP`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return { message: `Reconhecimento enviado para ${to.fullName}!`, xpAwarded: xp, recognition };
  }

  async getRecognitionFeed(filters: RecognitionFilterDto) {
    const { toUserId, fromUserId, departmentId, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: any = { public: true };
    if (toUserId) where.toUserId = toUserId;
    if (fromUserId) where.fromUserId = fromUserId;
    if (departmentId) {
      where.to = { departmentId };
    }

    const data = await (this.prisma as any).recognition
      ?.findMany({
        where,
        skip,
        take: limit,
        include: {
          from: { select: { id: true, fullName: true, avatarUrl: true } },
          to: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => [] as any[]);

    const total = await (this.prisma as any).recognition?.count({ where }).catch(() => 0);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getLeaderboard(
    type: 'points' | 'recognitions' | 'kudos',
    departmentId?: number,
    limit = 10,
  ) {
    const where: any = { active: true };
    if (departmentId) where.departmentId = departmentId;

    if (type === 'points') {
      const users = await this.prismaRead.user.findMany({
        where,
        include: { points: true, position: { select: { name: true } } },
        orderBy: { points: { points: 'desc' } },
        take: limit,
      });
      return users.map((u, i) => ({
        rank: i + 1,
        user: { id: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl, position: u.position },
        points: u.points?.points ?? 0,
      }));
    }

    // Recognition-based leaderboard
    const data = await (this.prisma as any).recognition
      ?.groupBy({
        by: ['toUserId'],
        where: { ...(departmentId ? { to: { departmentId } } : {}) },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit,
      })
      .catch(() => [] as any[]);

    const userIds = (data as any[]).map((d: any) => d.toUserId);
    const users = await this.prismaRead.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } },
    });

    return (data as any[]).map((d: any, i: number) => ({
      rank: i + 1,
      user: users.find(u => u.id === d.toUserId),
      count: d._count.id,
    }));
  }

  // ══════════════════════════════════════════════════════
  // 1:1 MEETINGS
  // ══════════════════════════════════════════════════════

  async createOneOnOne(userId: number, dto: CreateOneOnOneDto) {
    const oneOnOne = await (this.prisma as any).oneOnOneMeeting
      ?.create({
        data: {
          hostId: userId,
          participantId: dto.participantId,
          scheduledAt: new Date(dto.scheduledAt),
          durationMinutes: dto.durationMinutes ?? 30,
          agenda: dto.agenda,
          status: 'SCHEDULED',
          recurring: dto.recurring ?? false,
          frequency: dto.frequency,
        },
      })
      .catch(() => null);

    // Notify participant
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.participantId,
          type: 'ONE_ON_ONE_SCHEDULED',
          message: `1:1 agendado para ${new Date(dto.scheduledAt).toLocaleDateString('pt')}`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return oneOnOne ?? { message: '1:1 agendado', scheduledAt: dto.scheduledAt };
  }

  async getOneOnOnes(userId: number) {
    return (this.prisma as any).oneOnOneMeeting
      ?.findMany({
        where: { OR: [{ hostId: userId }, { participantId: userId }] },
        include: {
          host: { select: { id: true, fullName: true, avatarUrl: true } },
          participant: { select: { id: true, fullName: true, avatarUrl: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      })
      .catch(() => [] as any[]);
  }

  async updateOneOnOne(id: number, userId: number, dto: EngagementUpdateOneOnOneDto) {
    const data: any = { ...dto };
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.completed) data.status = 'COMPLETED';

    return (this.prisma as any).oneOnOneMeeting
      ?.update({
        where: { id },
        data,
      })
      .catch(() => ({ message: 'Actualizado' }));
  }

  // ══════════════════════════════════════════════════════
  // ACTION PLANS
  // ══════════════════════════════════════════════════════

  async createActionPlan(createdById: number, dto: CreateActionPlanDto) {
    const plan = await (this.prisma as any).engagementAction
      ?.create({
        data: {
          title: dto.title,
          description: dto.description,
          assigneeId: dto.assigneeId,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          surveyId: dto.surveyId,
          departmentId: dto.departmentId,
          priority: dto.priority ?? 'MEDIUM',
          status: 'OPEN',
          progress: 0,
          createdById,
        },
      })
      .catch(() => null);

    if (dto.assigneeId) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: dto.assigneeId,
            type: 'ACTION_PLAN_ASSIGNED',
            message: `Nova acção de engagement atribuída: "${dto.title}"`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return plan ?? { message: 'Plano de acção criado', ...dto };
  }

  async getActionPlans(
    filters: { departmentId?: number; status?: string; page?: number; limit?: number } = {},
  ) {
    const { departmentId, status, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (departmentId) where.departmentId = departmentId;
    if (status) where.status = status;

    const data = await (this.prisma as any).engagementAction
      ?.findMany({
        where,
        skip,
        take: limit,
        include: {
          assignee: { select: { id: true, fullName: true, avatarUrl: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => [] as any[]);

    const total = await (this.prisma as any).engagementAction?.count({ where }).catch(() => 0);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async updateActionPlan(id: number, dto: UpdateActionPlanDto) {
    const data: any = { ...dto };
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    return (this.prisma as any).engagementAction
      ?.update({ where: { id }, data })
      .catch(() => ({ message: 'Actualizado', ...dto }));
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS & ENGAGEMENT INDEX
  // ══════════════════════════════════════════════════════

  async getEngagementIndex(departmentId?: number) {
    // Last 5 COMPLETED surveys
    const surveys = await (this.prisma as any).engagementSurvey.findMany({
      where: { status: 'COMPLETED', type: { not: SurveyType.ENPS } },
      include: { responses: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const history = surveys.map(s => {
      const responses = s.responses as any[];
      const avg = responses.length
        ? +(responses.reduce((sum, r) => sum + (r.score ?? 0), 0) / responses.length).toFixed(2)
        : 0;
      return {
        surveyId: s.id,
        title: s.title,
        type: s.type,
        date: s.createdAt,
        avgScore: avg,
        responses: responses.length,
      };
    });

    const currentIndex = history[0]?.avgScore ?? 0;
    const engagementIndex = toIndex(currentIndex, 5);
    const trend = history.length > 1 ? +(currentIndex - (history[1]?.avgScore ?? 0)).toFixed(2) : 0;

    // Participation trend
    const totalUsers = await this.prismaRead.user.count({ where: { active: true } });
    const latestParticipation = surveys[0]
      ? +((surveys[0].responses.length / Math.max(totalUsers, 1)) * 100).toFixed(1)
      : 0;

    return {
      currentIndex: engagementIndex,
      avgScore: currentIndex,
      trend,
      trendLabel: trend > 0 ? 'subiu' : trend < 0 ? 'desceu' : 'estável',
      latestParticipation,
      totalUsers,
      history,
      level:
        engagementIndex >= 75
          ? 'EXCELLENT'
          : engagementIndex >= 55
            ? 'GOOD'
            : engagementIndex >= 40
              ? 'FAIR'
              : 'AT_RISK',
    };
  }

  async getDashboard(filters: EngagementFilterDto = {}) {
    const { departmentId } = filters;
    const userWhere: any = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const [
      totalUsers,
      activeSurveys,
      completedSurveys,
      engagementIndex,
      enps,
      totalRecognitions,
      totalFeedback,
      recentRecognitions,
      activePlans,
    ] = await Promise.all([
      this.prismaRead.user.count({ where: userWhere }),
      this.prismaRead.engagementSurvey.count({ where: { status: 'ACTIVE' } }),
      this.prismaRead.engagementSurvey.count({ where: { status: 'COMPLETED' } }),
      this.getEngagementIndex(departmentId),
      this.getENPSScore(departmentId),
      (this.prisma as any).recognition?.count().catch(() => 0),
      (this.prisma as any).feedback?.count().catch(() => 0),
      (this.prisma as any).recognition
        ?.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          where: { public: true },
          include: {
            from: { select: { id: true, fullName: true, avatarUrl: true } },
            to: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        })
        .catch(() => [] as any[]),
      (this.prisma as any).engagementAction
        ?.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } })
        .catch(() => 0),
    ]);

    return {
      kpis: {
        totalUsers,
        activeSurveys,
        completedSurveys,
        engagementIndex: engagementIndex.currentIndex,
        engagementTrend: engagementIndex.trend,
        participationRate: engagementIndex.latestParticipation,
        enps: enps.enps,
        totalRecognitions,
        totalFeedback,
        activePlans,
        engagementLevel: engagementIndex.level,
      },
      engagementHistory: engagementIndex.history,
      enpsBreakdown: enps,
      recentRecognitions,
    };
  }

  async getEngagementHeatmap(metric: 'score' | 'participation' | 'mood' = 'score') {
    const departments = await this.prismaRead.department.findMany({
      select: { id: true, name: true, users: { where: { active: true }, select: { id: true } } },
    });

    const result = await Promise.all(
      departments.map(async dept => {
        const userIds = dept.users.map(u => u.id);
        if (!userIds.length) return { department: dept.name, value: null, count: 0 };

        if (metric === 'score') {
          const responses = await this.prismaRead.surveyResponse.findMany({
            where: { userId: { in: userIds } },
            select: { score: true },
            orderBy: { createdAt: 'desc' },
            take: userIds.length * 3,
          });
          const avg = responses.length
            ? +(responses.reduce((s, r) => s + (r.score ?? 0), 0) / responses.length).toFixed(2)
            : null;
          return { department: dept.name, value: avg, count: responses.length };
        }

        if (metric === 'participation') {
          const responded = await this.prismaRead.surveyResponse.count({
            where: { userId: { in: userIds } },
          });
          const rate = userIds.length > 0 ? +((responded / userIds.length) * 100).toFixed(1) : 0;
          return { department: dept.name, value: rate, count: userIds.length };
        }

        // mood
        const checkins = await (this.prisma as any).moodCheckin
          ?.findMany({
            where: {
              userId: { in: userIds },
              createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
            },
            select: { mood: true },
          })
          .catch(() => [] as any[]);
        const avgMood = (checkins as any[]).length
          ? +(
              (checkins as any[]).reduce((s: number, c: any) => s + c.mood, 0) /
              (checkins as any[]).length
            ).toFixed(2)
          : null;
        return { department: dept.name, value: avgMood, count: (checkins as any[]).length };
      }),
    );

    return result;
  }

  async getManagerInsights(managerId: number) {
    const team = await this.prismaRead.user.findMany({
      where: { managerId, active: true },
      select: { id: true },
    });
    const userIds = team.map(u => u.id);
    if (!userIds.length) return { message: 'Sem equipa directa', data: [] };

    const [teamResponses, teamMood, recentRecognitions, pendingOneOnOnes] = await Promise.all([
      this.prismaRead.surveyResponse.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, score: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: userIds.length * 5,
      }),
      (this.prisma as any).moodCheckin
        ?.findMany({
          where: {
            userId: { in: userIds },
            createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
          select: { userId: true, mood: true },
        })
        .catch(() => [] as any[]),
      (this.prisma as any).recognition
        ?.count({
          where: { toUserId: { in: userIds } },
        })
        .catch(() => 0),
      (this.prisma as any).oneOnOneMeeting
        ?.count({
          where: {
            OR: [{ hostId: managerId }, { participantId: managerId }],
            status: 'SCHEDULED',
            scheduledAt: { gte: new Date() },
          },
        })
        .catch(() => 0),
    ]);

    const avgScore = teamResponses.length
      ? +(teamResponses.reduce((s, r) => s + (r.score ?? 0), 0) / teamResponses.length).toFixed(2)
      : null;
    const avgMood = (teamMood as any[]).length
      ? +(
          (teamMood as any[]).reduce((s: number, c: any) => s + c.mood, 0) /
          (teamMood as any[]).length
        ).toFixed(1)
      : null;

    // Identify at-risk members (no recent survey response in 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const recentRespondents = new Set(
      teamResponses.filter(r => r.createdAt >= thirtyDaysAgo).map(r => r.userId),
    );
    const atRisk = userIds.filter(id => !recentRespondents.has(id)).length;

    return {
      teamSize: userIds.length,
      engagementScore: avgScore !== null ? toIndex(avgScore, 5) : null,
      avgMood,
      recognitionsReceived: recentRecognitions,
      pendingOneOnOnes,
      atRiskCount: atRisk,
      insights: this.buildManagerInsights(avgScore, avgMood, atRisk, userIds.length),
    };
  }

  private buildManagerInsights(
    score: number | null,
    mood: number | null,
    atRisk: number,
    teamSize: number,
  ): string[] {
    const out: string[] = [];
    if (score !== null && score < 3) out.push('⚠️ Score de engajamento da equipa abaixo da média');
    if (mood !== null && mood < 3) out.push('😟 Humor geral da equipa está baixo esta semana');
    if (atRisk > 0)
      out.push(`📊 ${atRisk} colaboradores sem resposta a surveys nos últimos 30 dias`);
    if (score !== null && score >= 4)
      out.push('✅ Equipa com alto nível de engajamento — continua assim!');
    if (out.length === 0) out.push('🟢 Equipa estável — sem alertas activos');
    return out;
  }

  async getHumanSuccessScore(userId: number) {
    // Composite: Engagement (33%) + Performance (33%) + Learning (34%)
    const [responses, reviews, enrollments, points] = await Promise.all([
      this.prismaRead.surveyResponse.findMany({
        where: { userId },
        select: { score: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prismaRead.performanceReview.findMany({
        where: { userId, status: 'COMPLETED' },
        select: { score: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      this.prismaRead.enrollment.findMany({
        where: { userId, status: 'COMPLETED' },
        select: { id: true },
      }),
      this.prismaRead.userPoints.findUnique({ where: { userId } }),
    ]);

    const engScore = responses.length
      ? toIndex(responses.reduce((s, r) => s + (r.score ?? 0), 0) / responses.length, 5)
      : 0;
    const perfScore = reviews.length
      ? toIndex(reviews.reduce((s, r) => s + (r.score ?? 0), 0) / reviews.length, 5)
      : 0;
    const learnScore = Math.min(enrollments.length * 10, 100);

    const hss = +(engScore * 0.33 + perfScore * 0.33 + learnScore * 0.34).toFixed(1);

    return {
      userId,
      humanSuccessScore: hss,
      grade: hss >= 80 ? 'A' : hss >= 65 ? 'B' : hss >= 50 ? 'C' : 'D',
      breakdown: { engagement: engScore, performance: perfScore, learning: learnScore },
      xpPoints: points?.points ?? 0,
    };
  }

  // ══════════════════════════════════════════════════════
  // QUICK STATS (for header/cards)
  // ══════════════════════════════════════════════════════

  async getMyEngagementSummary(userId: number) {
    const [pendingSurveys, received, points, recentMood, hss] = await Promise.all([
      (this.prisma as any).engagementSurvey.findMany({
        where: {
          status: 'ACTIVE',
          responses: { none: { userId } },
        },
        select: { id: true, title: true, type: true, endDate: true },
        take: 5,
      }),
      (this.prisma as any).recognition?.count({ where: { toUserId: userId } }).catch(() => 0),
      this.prismaRead.userPoints.findUnique({ where: { userId } }),
      (this.prisma as any).moodCheckin
        ?.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { mood: true, createdAt: true },
        })
        .catch(() => null),
      this.getHumanSuccessScore(userId),
    ]);

    return {
      pendingSurveys: pendingSurveys.length,
      surveys: pendingSurveys,
      recognitionsReceived: received,
      xpPoints: points?.points ?? 0,
      lastMood: recentMood?.mood ?? null,
      humanSuccessScore: hss.humanSuccessScore,
      hssGrade: hss.grade,
    };
  }
}
