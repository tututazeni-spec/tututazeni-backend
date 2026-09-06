// src/engagement/engagement.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  Prisma,
  ReviewStatus,
  SurveyType,
  SurveyStatus,
  RecognitionType,
  ActionPlanStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
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
} from './engagement.dto';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';
import { OneOnOneService } from '../one-on-one/one-on-one.service';

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
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneOnOne: OneOnOneService,
  ) {}

  // ══════════════════════════════════════════════════════
  // SURVEYS (CRUD + LIFECYCLE)
  // ══════════════════════════════════════════════════════

  async getSurveys(filters: SurveyFilterDto = {}) {
    const { type, status, departmentId, page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.EngagementSurveyWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    // FIX (#245): `departmentId` era aceite e nunca aplicado ao `where`
    // (EngagementSurvey não tinha nenhuma dimensão de departamento — ver
    // `targetDepartmentIds` no schema, adicionado para resolver isto).
    // `targetDepartmentIds: []` = survey aplica-se a todos os departamentos
    // (compatível com todas as surveys existentes, que ficaram com [] pela
    // migration) — por isso conta sempre, além das que têm o id no array.
    if (departmentId) {
      where.OR = [
        { targetDepartmentIds: { isEmpty: true } },
        { targetDepartmentIds: { has: departmentId } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.read.engagementSurvey.findMany({
        where,
        skip,
        take,
        include: { _count: { select: { responses: true, questions: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.engagementSurvey.count({ where }),
    ]);

    const enriched = await Promise.all(
      data.map(async s => {
        // Participation rate: responses / colaboradores no público-alvo
        // (#245: antes era sempre / total de activos, mesmo em surveys
        // dirigidas a um departamento — desnormalizava a taxa para baixo).
        const totalUsers = await this.audienceSize(s.targetDepartmentIds);
        const rate = totalUsers > 0 ? +((s._count.responses / totalUsers) * 100).toFixed(1) : 0;
        return { ...s, participationRate: rate };
      }),
    );

    return buildPaginatedResponse(enriched, total, page, limit);
  }

  /** Nº de colaboradores activos no público-alvo de uma survey — todos os
   * activos se `targetDepartmentIds` estiver vazio (survey sem alvo, ver
   * schema), só os desses departamentos caso contrário. Ver issue #245. */
  private async audienceSize(targetDepartmentIds: number[]): Promise<number> {
    return this.prisma.read.user.count({
      where: {
        active: true,
        ...(targetDepartmentIds.length > 0 ? { departmentId: { in: targetDepartmentIds } } : {}),
      },
    });
  }

  async getSurvey(id: number) {
    const s = await this.prisma.read.engagementSurvey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
    if (!s) throw new NotFoundException('Inquérito não encontrado');

    const totalUsers = await this.audienceSize(s.targetDepartmentIds);
    return {
      ...s,
      participationRate: totalUsers > 0 ? +((s._count.responses / totalUsers) * 100).toFixed(1) : 0,
    };
  }

  async createSurvey(dto: CreateSurveyDto, _createdById: number) {
    // FIX (#245): targetDepartmentIds era aceite pelo DTO e nunca persistido
    // (EngagementSurvey não tinha a coluna). Agora tem — ver
    // targetDepartmentIds no schema. `frequency` continua sem coluna
    // correspondente (nunca foi usado por nenhum consumidor deste DTO além
    // de o aceitar) — fica fora deste fix.
    const { questions, startDate, endDate, targetDepartmentIds, frequency, ...data } = dto;

    return this.prisma.engagementSurvey.create({
      data: {
        ...data,
        status: SurveyStatus.DRAFT,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        targetDepartmentIds: targetDepartmentIds ?? [],
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
    // FIX: `data: any` desnecessário — todos os campos de UpdateSurveyDto
    // (title/description/status/endDate) são colunas reais de
    // EngagementSurvey.
    const data: Prisma.EngagementSurveyUpdateInput = { ...dto };
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

    // FIX (#245): notificava sempre todos os activos, ignorando
    // targetDepartmentIds mesmo quando a survey tinha departamentos-alvo
    // definidos. [] continua a notificar todos, como antes.
    const users = await this.prisma.read.user.findMany({
      where: {
        active: true,
        ...(s.targetDepartmentIds.length > 0
          ? { departmentId: { in: s.targetDepartmentIds } }
          : {}),
      },
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
    const survey = await this.prisma.engagementSurvey.findUnique({
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

    const response = await this.prisma.surveyResponse.create({
      data: {
        userId,
        surveyId: dto.surveyId,
        score: avg,
        anonymous: dto.submitAnonymously ?? false,
        // FIX: `as any` desnecessário — todos os campos batem certo com
        // SurveyAnswer (questionId/value/comment/selectedOption).
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
          message: `Obrigado! A tua resposta foi registada. +10 Pontos de Experiência`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          action: 'SURVEY_COMPLETED',
          surveyId: dto.surveyId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de inquérito submetido',
        });
      });

    return { message: 'Inquérito submetido com sucesso', responseId: response.id };
  }

  // ─── Results ─────────────────────────────────────────

  async getSurveyResults(surveyId: number, _requesterId: number) {
    const survey = await this.prisma.engagementSurvey.findUnique({
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

    // FIX: todos os casts `as any[]`/`(a: any)` eram desnecessários — `survey`
    // já vem totalmente tipado do `include` acima (responses+answers+user,
    // questions).
    const responses = survey.responses;

    // Respect anonymity threshold (min 3 responses to show results)
    const MIN_THRESHOLD = survey.minResponsesForResults ?? 3;
    const showDetails = responses.length >= MIN_THRESHOLD;

    const totalResponses = responses.length;
    const avgScore = totalResponses
      ? +(responses.reduce((s, r) => s + (r.score ?? 0), 0) / totalResponses).toFixed(2)
      : 0;
    const engagementIndex = toIndex(avgScore, 5);

    // Per-question stats
    const questionStats = survey.questions.map(q => {
      const qAnswers = responses.flatMap(r => r.answers.filter(a => a.questionId === q.id));
      const numeric = qAnswers.filter(a => a.value !== null && a.value !== undefined);
      const avg = numeric.length
        ? +(numeric.reduce((s, a) => s + (a.value ?? 0), 0) / numeric.length).toFixed(2)
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
    let byDepartment: { department: string; avgScore: number; responses: number }[] = [];
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

    const totalUsers = await this.prisma.read.user.count({ where: { active: true } });
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
    return this.prisma.engagementSurvey.findMany({
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
    const survey = await this.prisma.engagementSurvey.findFirst({
      where: { type: SurveyType.ENPS, status: 'ACTIVE' },
      include: { questions: true },
    });

    if (!survey)
      throw new NotFoundException(
        'Nenhuma pesquisa de Índice de Recomendação dos colaboradores activa no momento',
      );

    // FIX: `as any[]` desnecessário — `survey.questions` já vem tipado do
    // `include: { questions: true }` acima.
    const eNPSQuestion = survey.questions.find(q => q.type === 'ENPS');
    if (!eNPSQuestion)
      throw new BadRequestException(
        'Pesquisa de Índice de Recomendação dos colaboradores mal configurada',
      );

    return this.submitSurvey(userId, {
      surveyId: survey.id,
      submitAnonymously: true,
      answers: [{ questionId: eNPSQuestion.id, value: dto.score, comment: dto.reason }],
    });
  }

  async getENPSScore(_departmentId?: number) {
    const survey = await this.prisma.engagementSurvey.findFirst({
      where: { type: SurveyType.ENPS, status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: { responses: { include: { answers: { include: { question: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    // Forma tem de coincidir com o `return` normal abaixo — o frontend
    // (components/engagement/OverviewTab.tsx) lê promoterPct/detractorPct
    // sem guarda (`e.pct.toFixed(1)`), assumindo o tipo `number` declarado em
    // DashboardData. Faltarem promoterPct/detractorPct/label aqui (BD vazia,
    // sem nenhuma survey eNPS ACTIVE/COMPLETED) causava
    // "Cannot read properties of undefined (reading 'toFixed')" no dashboard.
    if (!survey) {
      return {
        enps: null,
        promoters: 0,
        passives: 0,
        detractors: 0,
        total: 0,
        promoterPct: 0,
        detractorPct: 0,
        label: 'Sem dados',
      };
    }

    // FIX: casts desnecessários — `survey.responses`/`.answers` já vêm
    // tipados do `include` acima (responses → answers → question).
    const scores = survey.responses
      .flatMap(r => r.answers)
      .filter(a => a.question?.type === 'ENPS' && a.value !== null)
      .map(a => a.value);

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.moodCheckin.findFirst({
      where: { userId, date: today },
    });

    if (existing) return { message: 'Já fizeste o teu check-in hoje', mood: existing.mood };

    const checkin = await this.prisma.moodCheckin.create({
      data: { userId, mood: dto.mood, note: dto.note, tags: dto.tags ?? [], date: today },
    });

    // Detect sudden mood drop — alert manager if mood ≤ 2 for 3 consecutive days
    await this.detectMoodAlert(userId, dto.mood);

    return { message: `Check-in registado! Estado: ${dto.mood}/5`, checkin };
  }

  async getMoodTrend(userId: number, days = 14) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const checkins = await this.prisma.moodCheckin.findMany({
      where: { userId, createdAt: { gte: from } },
      orderBy: { createdAt: 'asc' },
      select: { mood: true, note: true, createdAt: true, tags: true },
    });

    const avg = checkins.length
      ? +(checkins.reduce((s, c) => s + c.mood, 0) / checkins.length).toFixed(1)
      : null;

    return { trend: checkins, avgMood: avg, days };
  }

  async getTeamMoodOverview(managerId: number) {
    const team = await this.prisma.read.user.findMany({
      where: { managerId, active: true },
      select: { id: true, fullName: true, avatarUrl: true },
    });

    const from = new Date();
    from.setDate(from.getDate() - 7);

    const teamData = await Promise.all(
      team.map(async u => {
        const checkins = await this.prisma.moodCheckin.findMany({
          where: { userId: u.id, createdAt: { gte: from } },
          select: { mood: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });

        const avg = checkins.length
          ? +(checkins.reduce((s, c) => s + c.mood, 0) / checkins.length).toFixed(1)
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
    const recent = await this.prisma.moodCheckin.findMany({
      where: { userId, createdAt: { gte: from } },
      select: { mood: true },
    });

    if (recent.length >= 2 && recent.every(c => c.mood <= 2)) {
      const user = await this.prisma.user.findUnique({
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
          .catch(e => {
            this.logger.warn({
              userId: user.managerId,
              subordinateId: userId,
              action: 'MOOD_ALERT',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao criar notificação de alerta de humor para o gestor',
            });
          });
      }
    }
  }

  // ══════════════════════════════════════════════════════
  // FEEDBACK CONTÍNUO
  // ══════════════════════════════════════════════════════

  async createFeedback(fromUserId: number, dto: CreateFeedbackDto) {
    const fb = await this.prisma.feedback.create({
      data: {
        fromUserId: dto.anonymous ? null : fromUserId,
        toUserId: dto.toUserId,
        type: dto.type,
        message: dto.message,
        anonymous: dto.anonymous ?? false,
        projectRef: dto.projectRef,
        status: 'OPEN',
      },
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
        .catch(e => {
          this.logger.warn({
            userId: dto.toUserId,
            fromUserId,
            action: 'FEEDBACK_RECEIVED',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de feedback recebido',
          });
        });
    }

    return fb;
  }

  async getFeedback(filters: FeedbackFilterDto) {
    const { type, toUserId, fromUserId, page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.FeedbackWhereInput = {};
    if (type) where.type = type;
    if (toUserId) where.toUserId = toUserId;
    if (fromUserId) where.fromUserId = fromUserId;

    const data = await this.prisma.feedback.findMany({
      where,
      skip,
      take,
      include: {
        from: { select: { id: true, fullName: true, avatarUrl: true } },
        to: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const total = await this.prisma.feedback.count({ where });

    // Mask anonymous authors
    const safe = data.map(f => ({
      ...f,
      from: f.anonymous ? { id: null, fullName: 'Anónimo', avatarUrl: null } : f.from,
    }));

    return buildPaginatedResponse(safe, total, page, limit);
  }

  async replyToFeedback(feedbackId: number, userId: number, dto: FeedbackReplyDto) {
    return this.prisma.feedback.update({
      where: { id: feedbackId },
      data: { reply: dto.message, repliedAt: new Date(), repliedById: userId, status: 'REPLIED' },
    });
  }

  // ══════════════════════════════════════════════════════
  // RECONHECIMENTO & KUDOS
  // ══════════════════════════════════════════════════════

  async giveRecognition(fromUserId: number, dto: CreateRecognitionDto) {
    if (fromUserId === dto.toUserId)
      throw new BadRequestException('Não podes reconhecer-te a ti próprio');

    const to = await this.prisma.read.user.findUnique({
      where: { id: dto.toUserId },
      select: { id: true, fullName: true },
    });
    if (!to) throw new NotFoundException('Utilizador não encontrado');

    const recognition = await this.prisma.recognition.create({
      data: {
        fromUserId,
        toUserId: dto.toUserId,
        type: dto.type,
        message: dto.message,
        public: dto.public ?? true,
        value: dto.value,
        badgeId: dto.badgeId,
      },
    });

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
        .catch(e => {
          this.logger.warn({
            userId: dto.toUserId,
            badgeId: dto.badgeId,
            fromUserId,
            action: 'giveRecognition.awardBadge',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao atribuir distintivo de reconhecimento',
          });
        });
    }

    // Notify recipient
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.toUserId,
          type: 'RECOGNITION_RECEIVED',
          message: ` Recebeste um reconhecimento! +${xp} XP`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: dto.toUserId,
          fromUserId,
          action: 'RECOGNITION_RECEIVED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de reconhecimento recebido',
        });
      });

    return { message: `Reconhecimento enviado para ${to.fullName}!`, xpAwarded: xp, recognition };
  }

  async getRecognitionFeed(filters: RecognitionFilterDto) {
    const { toUserId, fromUserId, departmentId, page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.RecognitionWhereInput = { public: true };
    if (toUserId) where.toUserId = toUserId;
    if (fromUserId) where.fromUserId = fromUserId;
    if (departmentId) {
      where.to = { departmentId };
    }

    const data = await this.prisma.recognition.findMany({
      where,
      skip,
      take,
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
    });

    const total = await this.prisma.recognition.count({ where });

    return buildPaginatedResponse(data, total, page, limit);
  }

  async getLeaderboard(
    type: 'points' | 'recognitions' | 'kudos',
    departmentId?: number,
    limit = 10,
  ) {
    const where: Prisma.UserWhereInput = { active: true };
    if (departmentId) where.departmentId = departmentId;

    if (type === 'points') {
      const users = await this.prisma.read.user.findMany({
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
    const data = await this.prisma.recognition.groupBy({
      by: ['toUserId'],
      where: { ...(departmentId ? { to: { departmentId } } : {}) },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    const userIds = data.map(d => d.toUserId);
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } },
    });

    return data.map((d, i) => ({
      rank: i + 1,
      user: users.find(u => u.id === d.toUserId),
      count: d._count.id,
    }));
  }

  // ══════════════════════════════════════════════════════
  // 1:1 MEETINGS
  // ══════════════════════════════════════════════════════

  async createOneOnOne(userId: number, dto: CreateOneOnOneDto) {
    // OneOnOneMeeting tem um dono de escrita único — OneOnOneService (Fase G4).
    const oneOnOne = await this.oneOnOne.schedule({
      hostId: userId,
      participantId: dto.participantId,
      scheduledAt: dto.scheduledAt,
      durationMinutes: dto.durationMinutes,
      agenda: dto.agenda,
      recurring: dto.recurring,
      frequency: dto.frequency,
    });

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
      .catch(e => {
        this.logger.warn({
          userId: dto.participantId,
          hostId: userId,
          action: 'ONE_ON_ONE_SCHEDULED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de 1:1 agendado',
        });
      });

    return oneOnOne;
  }

  async getOneOnOnes(userId: number) {
    return this.oneOnOne.listForUser(userId);
  }

  async updateOneOnOne(id: number, user: CurrentUserData, dto: EngagementUpdateOneOnOneDto) {
    const meeting = await this.oneOnOne.getOne(id);

    // Ownership (A3): host OU participante OU ADMIN/RH; senão 404 (não revela existência).
    const isOwner =
      String(user.id) === String(meeting.hostId) ||
      String(user.id) === String(meeting.participantId);
    if (!isOwner && !isPrivileged(user, [Role.ADMIN, Role.RH])) {
      throw new NotFoundException('1:1 não encontrado');
    }

    // `completed` → status/completedAt; `notes` → coluna real `minutes`.
    const { completed, notes, ...rest } = dto;
    return this.oneOnOne.update(id, {
      ...rest,
      minutes: notes,
      ...(completed ? { status: 'COMPLETED', completedAt: new Date() } : {}),
    });
  }

  // ══════════════════════════════════════════════════════
  // ACTION PLANS
  // ══════════════════════════════════════════════════════

  async createActionPlan(createdById: number, dto: CreateActionPlanDto) {
    const plan = await this.prisma.engagementAction.create({
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
    });

    if (dto.assigneeId) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: dto.assigneeId,
            type: 'ACTION_PLAN_ASSIGNED',
            message: `Nova acção de engajamento atribuída: "${dto.title}"`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(e => {
          this.logger.warn({
            userId: dto.assigneeId,
            createdById,
            action: 'ACTION_PLAN_ASSIGNED',
            planId: plan.id,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de plano de acção de engajamento atribuído',
          });
        });
    }

    return plan;
  }

  async getActionPlans(
    filters: { departmentId?: number; status?: string; page?: number; limit?: number } = {},
  ) {
    const { departmentId, status, page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.EngagementActionWhereInput = {};
    if (departmentId) where.departmentId = departmentId;
    // `status` chega como query string livre do controller — valida contra o
    // enum antes de passar ao Prisma (um valor fora do enum rebentava com
    // "Invalid value provided" em vez de simplesmente não filtrar).
    if (status && (Object.values(ActionPlanStatus) as string[]).includes(status)) {
      where.status = status as ActionPlanStatus;
    }

    const data = await this.prisma.engagementAction.findMany({
      where,
      skip,
      take,
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const total = await this.prisma.engagementAction.count({ where });

    return buildPaginatedResponse(data, total, page, limit);
  }

  async updateActionPlan(id: number, dto: UpdateActionPlanDto) {
    // FIX: EngagementAction não tem coluna `notes` (só title/description/
    // status/progress/dueDate) — `{...dto}` atrás de um `as any` arriscava
    // "Unknown argument `notes`" em runtime sempre que um chamador
    // preenchesse esse campo do DTO. `notes` é excluído explicitamente.
    const { notes: _notes, dueDate, ...rest } = dto;
    const data: Prisma.EngagementActionUpdateInput = { ...rest };
    if (dueDate) data.dueDate = new Date(dueDate);
    return this.prisma.engagementAction.update({ where: { id }, data });
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS & ENGAGEMENT INDEX
  // ══════════════════════════════════════════════════════

  async getEngagementIndex(_departmentId?: number) {
    // Last 5 COMPLETED surveys
    const surveys = await this.prisma.engagementSurvey.findMany({
      where: { status: 'COMPLETED', type: { not: SurveyType.ENPS } },
      include: { responses: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const history = surveys.map(s => {
      // FIX: `as any[]` desnecessário — `responses` já vem tipado do
      // `include: { responses: true }` acima.
      const responses = s.responses;
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
    const totalUsers = await this.prisma.read.user.count({ where: { active: true } });
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
    const userWhere: Prisma.UserWhereInput = { active: true };
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
      this.prisma.read.user.count({ where: userWhere }),
      this.prisma.read.engagementSurvey.count({ where: { status: 'ACTIVE' } }),
      this.prisma.read.engagementSurvey.count({ where: { status: 'COMPLETED' } }),
      this.getEngagementIndex(departmentId),
      this.getENPSScore(departmentId),
      this.prisma.recognition.count(),
      this.prisma.feedback.count(),
      this.prisma.recognition.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        where: { public: true },
        include: {
          from: { select: { id: true, fullName: true, avatarUrl: true } },
          to: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      }),
      this.prisma.engagementAction.count({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      }),
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
    const departments = await this.prisma.read.department.findMany({
      select: { id: true, name: true, users: { where: { active: true }, select: { id: true } } },
    });

    const result = await Promise.all(
      departments.map(async dept => {
        const userIds = dept.users.map(u => u.id);
        if (!userIds.length) return { department: dept.name, value: null, count: 0 };

        if (metric === 'score') {
          const responses = await this.prisma.read.surveyResponse.findMany({
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
          const responded = await this.prisma.read.surveyResponse.count({
            where: { userId: { in: userIds } },
          });
          const rate = userIds.length > 0 ? +((responded / userIds.length) * 100).toFixed(1) : 0;
          return { department: dept.name, value: rate, count: userIds.length };
        }

        // mood
        const checkins = await this.prisma.moodCheckin.findMany({
          where: {
            userId: { in: userIds },
            createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
          select: { mood: true },
        });
        const avgMood = checkins.length
          ? +(checkins.reduce((s, c) => s + c.mood, 0) / checkins.length).toFixed(2)
          : null;
        return { department: dept.name, value: avgMood, count: checkins.length };
      }),
    );

    return result;
  }

  async getManagerInsights(managerId: number) {
    const team = await this.prisma.read.user.findMany({
      where: { managerId, active: true },
      select: { id: true },
    });
    const userIds = team.map(u => u.id);
    if (!userIds.length) return { message: 'Sem equipa directa', data: [] };

    const [teamResponses, teamMood, recentRecognitions, pendingOneOnOnes] = await Promise.all([
      this.prisma.read.surveyResponse.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, score: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: userIds.length * 5,
      }),
      this.prisma.moodCheckin.findMany({
        where: {
          userId: { in: userIds },
          createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
        select: { userId: true, mood: true },
      }),
      this.prisma.recognition.count({
        where: { toUserId: { in: userIds } },
      }),
      this.prisma.oneOnOneMeeting.count({
        where: {
          OR: [{ hostId: managerId }, { participantId: managerId }],
          status: 'SCHEDULED',
          scheduledAt: { gte: new Date() },
        },
      }),
    ]);

    const avgScore = teamResponses.length
      ? +(teamResponses.reduce((s, r) => s + (r.score ?? 0), 0) / teamResponses.length).toFixed(2)
      : null;
    const avgMood = teamMood.length
      ? +(teamMood.reduce((s, c) => s + c.mood, 0) / teamMood.length).toFixed(1)
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
    _teamSize: number,
  ): string[] {
    const out: string[] = [];
    if (score !== null && score < 3)
      out.push(' Pontuação de engajamento da equipa abaixo da média');
    if (mood !== null && mood < 3) out.push(' Humor geral da equipa está baixo esta semana');
    if (atRisk > 0) out.push(` ${atRisk} colaboradores sem resposta a surveys nos últimos 30 dias`);
    if (score !== null && score >= 4)
      out.push('✅ Equipa com alto nível de engajamento — continua assim!');
    if (out.length === 0) out.push(' Equipa estável — sem alertas activos');
    return out;
  }

  async getHumanSuccessScore(userId: number) {
    // Composite: Engagement (33%) + Performance (33%) + Learning (34%)
    const [responses, reviews, enrollments, points] = await Promise.all([
      this.prisma.read.surveyResponse.findMany({
        where: { userId },
        select: { score: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.read.performanceReview.findMany({
        where: { userId, status: ReviewStatus.PUBLISHED },
        select: { score: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      this.prisma.read.enrollment.findMany({
        where: { userId, status: 'COMPLETED' },
        select: { id: true },
      }),
      this.prisma.read.userPoints.findUnique({ where: { userId } }),
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
      this.prisma.engagementSurvey.findMany({
        where: {
          status: 'ACTIVE',
          responses: { none: { userId } },
        },
        select: { id: true, title: true, type: true, endDate: true },
        take: 5,
      }),
      this.prisma.recognition.count({ where: { toUserId: userId } }),
      this.prisma.read.userPoints.findUnique({ where: { userId } }),
      this.prisma.moodCheckin.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { mood: true, createdAt: true },
      }),
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
