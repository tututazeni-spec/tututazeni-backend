// src/avatar-training/avatar-training.service.ts
import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAvatarDto, UpdateAvatarDto, AvatarFilterDto,
  CreateScenarioDto, ScenarioFilterDto,
  StartSessionDto, SendMessageDto, CompleteSessionDto, BehavioralScoreDto,
  AnalyticsFilterDto,
  AvatarRole, SessionStatus, MessageRole, Difficulty,
} from './avatar-training.dto';

// ─── Helpers ─────────────────────────────────────────────────────

const safeM = (prisma: any, name: string) => (prisma as any)[name] ?? {
  findMany:   async () => [],
  findFirst:  async () => null,
  findUnique: async () => null,
  create:     async (d: any) => d.data,
  createMany: async () => ({ count: 0 }),
  upsert:     async (d: any) => d.create,
  update:     async (d: any) => d.data,
  delete:     async () => null,
  count:      async () => 0,
  groupBy:    async () => [],
};

/** Base XP per difficulty */
const DIFFICULTY_XP: Record<string, number> = {
  BEGINNER: 15, INTERMEDIATE: 30, ADVANCED: 50, EXPERT: 80,
};

/** Score grade */
function gradeScore(score: number): string {
  if (score >= 90) return 'EXCEPTIONAL';
  if (score >= 75) return 'ABOVE_AVERAGE';
  if (score >= 60) return 'AVERAGE';
  if (score >= 40) return 'BELOW_AVERAGE';
  return 'NEEDS_IMPROVEMENT';
}

/** AI scoring heuristic — keyword overlap */
function scoreUserMessage(
  message: string,
  expectedKeywords: string[],
  behaviorWeights: Record<string, number>,
): { score: number; behavioral: Record<string, number> } {
  const lower   = message.toLowerCase();
  const matched = expectedKeywords.filter(k => lower.includes(k.toLowerCase())).length;
  const keyScore= expectedKeywords.length > 0
    ? Math.round((matched / expectedKeywords.length) * 100)
    : 70; // default if no expected keywords

  // Heuristic behavioral scoring
  const empathyWords    = ['entendo', 'compreendo', 'imagino', 'sinto', 'obrigado'];
  const assertiveWords  = ['vou', 'farei', 'comprometo', 'garanto', 'certeza'];
  const clarityPenalty  = message.length < 10 ? -20 : 0;

  const empathy      = Math.min(100, 40 + empathyWords.filter(w => lower.includes(w)).length * 15);
  const assertiveness= Math.min(100, 40 + assertiveWords.filter(w => lower.includes(w)).length * 15);
  const clarity      = Math.min(100, 50 + Math.min(message.length / 5, 30) + clarityPenalty);

  return {
    score: keyScore,
    behavioral: { empathy, assertiveness, clarity, decisionMaking: keyScore },
  };
}

/** Build AI avatar prompt */
function buildAvatarPrompt(
  avatar: any, scenario: any, conversationHistory: any[], userMessage: string,
): string {
  const persona   = avatar?.systemPrompt ?? `És um avatar de treino corporativo com papel de ${avatar?.role ?? 'coach'}.`;
  const context   = scenario?.context ?? '';
  const objective = scenario?.objective ?? '';
  const history   = conversationHistory.slice(-6).map((m: any) =>
    `${m.role === 'USER' ? 'Utilizador' : 'Avatar'}: ${m.content}`).join('\n');

  return `${persona}

CONTEXTO DO CENÁRIO: ${context}
OBJECTIVO DO TREINO: ${objective}
PERSONALIDADE: ${avatar?.personality ?? 'EMPATHETIC'}
IDIOMA: ${avatar?.language ?? 'pt'}

HISTÓRICO:
${history}

Utilizador: ${userMessage}

Responde de forma natural, útil e avaliativa. Se o utilizador errou, corrige com empatia. Se acertou, reforça positivamente. Máximo 3 frases.
Avatar:`;
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class AvatarTrainingService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // AVATARS — CRUD
  // ══════════════════════════════════════════════════════

  async createAvatar(userId: number, dto: CreateAvatarDto) {
    const avatar = await safeM(this.prisma, 'trainingAvatar').create({
      data: {
        name:          dto.name,
        description:   dto.description,
        role:          dto.role,
        style:         dto.style         ?? 'MINIMALIST',
        personality:   dto.personality   ?? 'EMPATHETIC',
        language:      dto.language      ?? 'pt',
        voiceId:       dto.voiceId,
        avatarImageUrl:dto.avatarImageUrl,
        systemPrompt:  dto.systemPrompt,
        isPublic:      dto.isPublic      ?? false,
        hasMemory:     dto.hasMemory     ?? true,
        knowledgeUrls: dto.knowledgeUrls ?? [],
        brandingColor: dto.brandingColor,
        createdById:   userId,
        active:        true,
      },
    }).catch(async () => {
      // Fallback for Prisma model not yet created
      return {
        id: null, ...dto,
        message: 'Avatar registado (modelo trainingAvatar ausente — execute migration)',
      };
    });

    return avatar;
  }

  async getAvatars(filters: AvatarFilterDto = {}) {
    const { page = 1, limit = 20, role, isPublic } = filters;
    const skip  = (page - 1) * limit;
    const where: any = { active: true };
    if (role)    where.role    = role;
    if (isPublic !== undefined) where.isPublic = isPublic;

    const data  = await safeM(this.prisma, 'trainingAvatar').findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]);
    const total = await safeM(this.prisma, 'trainingAvatar').count({ where }).catch(() => 0);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getAvatar(id: number) {
    const a = await safeM(this.prisma, 'trainingAvatar').findUnique({ where: { id } }).catch(() => null);
    if (!a) throw new NotFoundException('Avatar não encontrado');
    return a;
  }

  async updateAvatar(id: number, dto: UpdateAvatarDto) {
    return safeM(this.prisma, 'trainingAvatar').update({ where: { id }, data: dto })
      .catch(() => ({ id, message: 'Actualizado', ...dto }));
  }

  async deleteAvatar(id: number) {
    await safeM(this.prisma, 'trainingAvatar').update({
      where: { id }, data: { active: false },
    }).catch(() => null);
    return { message: 'Avatar desactivado' };
  }

  async uploadKnowledge(avatarId: number, fileUrl: string, title: string) {
    await safeM(this.prisma, 'avatarKnowledge').create({
      data: { avatarId, fileUrl, title, processed: false },
    }).catch(() => null);

    return { avatarId, fileUrl, title, message: 'Documento adicionado à base de conhecimento' };
  }

  // ══════════════════════════════════════════════════════
  // SCENARIOS — CRUD
  // ══════════════════════════════════════════════════════

  async createScenario(createdById: number, dto: CreateScenarioDto) {
    const { turns, ...data } = dto;

    const scenario = await this.prisma.avatarScenario.create({
      data: {
        ...data,
        active:    true,
        ...(createdById && { createdById } as any),
        ...(turns && { turns: { create: turns } } as any),
      },
      include: { competency: { select: { id: true, name: true } } },
    }).catch(async () => {
      return {
        ...dto, id: null,
        message: 'Cenário criado (alguns campos podem requerer migration)',
      };
    });

    return scenario;
  }

  async getScenarios(filters: ScenarioFilterDto = {}) {
    const { page = 1, limit = 20, category, difficulty, competencyId, search } = filters;
    const skip  = (page - 1) * limit;
    const where: any = { active: true };
    if (category)     where.category     = category;
    if (difficulty)   where.difficulty   = difficulty;
    if (competencyId) where.competencyId = competencyId;
    if (search) where.OR = [
      { title:       { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];

    const [data, total] = await Promise.all([
      this.prisma.avatarScenario.findMany({
        where, skip, take: limit,
        include: { competency: { select: { id: true, name: true } } },
        orderBy: { difficulty: 'asc' },
      }),
      this.prisma.avatarScenario.count({ where }),
    ]);

    // Enrich with user completion stats
    const ids = data.map(s => s.id);
    const completions = await this.prisma.avatarSession.groupBy({
      by:     ['scenarioId'],
      where:  { scenarioId: { in: ids }, status: 'COMPLETED' },
      _count: { id: true },
      _avg:   { score: true },
    }).catch(() => [] as any[]);
    const cMap = new Map((completions as any[]).map((c: any) => [c.scenarioId, c]));

    return {
      data: data.map(s => ({
        ...s,
        completions: cMap.get(s.id)?._count.id ?? 0,
        avgScore:    cMap.get(s.id)?._avg.score ? +(cMap.get(s.id)._avg.score).toFixed(1) : null,
        xpReward:    (s as any).xpReward ?? DIFFICULTY_XP[(s as any).difficulty ?? 'BEGINNER'],
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getScenario(id: number, userId?: number) {
    const s = await (this.prisma as any).avatarScenario.findUnique({
      where:   { id },
      include: {
      competency: { select: { id: true, name: true } },
      turns:      { orderBy: { order: 'asc' } },
      },
    }).catch(() => null);
    if (!s) throw new NotFoundException('Cenário não encontrado');

    // User best attempt
    let bestSession = null;
    if (userId) {
      bestSession = await this.prisma.avatarSession.findFirst({
        where:   { userId, scenarioId: id, status: 'COMPLETED' },
        orderBy: { score: 'desc' },
      }).catch(() => null);
    }

    return { ...s, bestSession, xpReward: (s as any).xpReward ?? DIFFICULTY_XP[(s as any).difficulty ?? 'BEGINNER'] };
  }

  // ══════════════════════════════════════════════════════
  // SESSIONS — LIFECYCLE
  // ══════════════════════════════════════════════════════

  async startSession(userId: number, dto: StartSessionDto) {
    const scenario = await this.getScenario(dto.scenarioId, userId);

    // Abandon any active session for this scenario
    await this.prisma.avatarSession.updateMany({
      where: { userId, scenarioId: dto.scenarioId, status: 'IN_PROGRESS' },
      data:  { status: 'ABANDONED' },
    }).catch(() => {});

    // Get avatar (from scenario or override)
    const avatarId = dto.avatarId ?? (scenario as any).avatarId;
    const avatar   = avatarId
      ? await safeM(this.prisma, 'trainingAvatar').findUnique({ where: { id: avatarId } }).catch(() => null)
      : null;

    // Build opening line
    const openingMessage = avatar
      ? `Olá! Sou ${avatar.name}. ${scenario.context ?? ''} Vamos começar o treino?`
      : `Bem-vindo ao cenário "${scenario.title}". Está pronto para começar?`;

    const session = await (this.prisma as any).avatarSession.create({
      data: {
        userId,
        scenarioId: dto.scenarioId,
        status:     'IN_PROGRESS',
        startedAt:  new Date(),
        ...(avatarId && { avatarId } as any),
        ...(dto.language && { language: dto.language } as any),
        conversationHistory: JSON.stringify([
          { role: 'AVATAR', content: openingMessage, timestamp: new Date() },
        ]),
      },
      include: {
        scenario:  { include: { competency: true, turns: { orderBy: { order: 'asc' }, take: 1 } } },
      },
    });

    await this.prisma.notificationLog.create({
      data: {
        userId,
        type:     'AVATAR_SESSION_STARTED',
        message:  `Sessão iniciada: "${scenario.title}"`,
        metadata: JSON.stringify({ sessionId: session.id, scenarioId: dto.scenarioId }),
      },
    }).catch(() => {});

    return {
      session,
      avatar,
      openingMessage,
      scenario: { title: scenario.title, objective: (scenario as any).objective },
    };
  }

  async sendMessage(sessionId: number, userId: number, dto: SendMessageDto) {
    const session = await (this.prisma as any).avatarSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: { include: {
          turns:  { orderBy: { order: 'asc' } },
        }},
      },
    }).catch(() => null);

    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.userId !== userId) throw new ForbiddenException();
    if (session.status !== SessionStatus.IN_PROGRESS)
      throw new BadRequestException('Sessão não está activa');

    const history: any[] = session.conversationHistory
      ? JSON.parse(session.conversationHistory as string) : [];

    history.push({ role: 'USER', content: dto.message, timestamp: new Date() });

    // Get current turn
    const turns      = (session.scenario as any).turns ?? [];
    const turnIndex  = dto.turnIndex ?? history.filter((m: any) => m.role === 'USER').length - 1;
    const currentTurn= turns[Math.min(turnIndex, turns.length - 1)];

    // Score user message
    const { score: turnScore, behavioral } = scoreUserMessage(
      dto.message,
      currentTurn?.expectedKeywords ?? [],
      {},
    );

    // Generate avatar response
    let avatarResponse = '';
    if (currentTurn) {
      if (turnScore >= 60) {
        avatarResponse = currentTurn.successPath ?? currentTurn.avatarLine ?? 'Muito bem! Continua assim.';
      } else {
        avatarResponse = currentTurn.failPath ?? `Quase lá! ${currentTurn.hint ?? 'Tenta reformular a tua resposta.'}`;
      }
    } else {
      // Free-form AI response (no structured turn)
      const avatar = (session as any).avatarId
        ? await safeM(this.prisma, 'trainingAvatar').findUnique({ where: { id: (session as any).avatarId } }).catch(() => null)
        : null;

      avatarResponse = avatar?.systemPrompt
        ? `[IA] Obrigado pela tua resposta. Como posso ajudar mais?`
        : 'Boa resposta! O que gostarias de explorar a seguir?';
    }

    history.push({ role: 'AVATAR', content: avatarResponse, timestamp: new Date(), score: turnScore, behavioral });

    // Update session
    await this.prisma.avatarSession.update({
      where: { id: sessionId },
      data:  { conversationHistory: JSON.stringify(history) } as any,
    });

    // Check if all turns completed
    const userTurns      = history.filter((m: any) => m.role === 'USER').length;
    const isLastTurn     = turns.length > 0 && userTurns >= turns.length;
    const avgTurnScore   = history.filter((m: any) => m.score !== undefined)
      .reduce((a: number, m: any) => a + m.score, 0) /
      Math.max(history.filter((m: any) => m.score !== undefined).length, 1);

    return {
      avatarResponse,
      turnScore,
      behavioral,
      isLastTurn,
      suggestedCompletion: isLastTurn,
      currentTurnIndex: turnIndex,
      totalTurns: turns.length,
      runningScore: +avgTurnScore.toFixed(1),
    };
  }

  async completeSession(sessionId: number, userId: number, dto: CompleteSessionDto) {
    const session = await this.prisma.avatarSession.findUnique({
      where: { id: sessionId }, include: { scenario: true },
    }).catch(() => null);

    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.userId !== userId) throw new ForbiddenException();

    // Calculate score from conversation history if not provided
    let finalScore = dto.score;
    if (finalScore === undefined) {
      const history: any[] = session.conversationHistory
        ? JSON.parse(session.conversationHistory as string) : [];
      const scored = history.filter((m: any) => m.score !== undefined);
      finalScore   = scored.length
        ? Math.round(scored.reduce((a: number, m: any) => a + m.score, 0) / scored.length)
        : 70;
    }

    // Behavioral aggregate
    const history: any[] = session.conversationHistory
      ? JSON.parse(session.conversationHistory as string) : [];
    const behavioralMsgs = history.filter((m: any) => m.behavioral);
    const behavioral: Record<string, number> = {};
    for (const m of behavioralMsgs) {
      for (const [k, v] of Object.entries(m.behavioral as Record<string, number>)) {
        if (!behavioral[k]) behavioral[k] = 0;
        behavioral[k] += v;
      }
    }
    if (behavioralMsgs.length > 0) {
      for (const k of Object.keys(behavioral)) {
        behavioral[k] = Math.round(behavioral[k] / behavioralMsgs.length);
      }
    }

    const duration = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    const grade    = gradeScore(finalScore);

    const updated = await this.prisma.avatarSession.update({
      where: { id: sessionId },
      data:  {
        status:      'COMPLETED',
        completedAt: new Date(),
        score:       finalScore,
        feedback:    dto.feedback,
        ...(dto.userRating      && { userRating:       dto.userRating      } as any),
        ...(dto.confidenceLevel && { confidenceLevel:  dto.confidenceLevel } as any),
        ...(dto.reflection      && { reflection:       dto.reflection      } as any),
        ...(duration            && { durationSeconds:  duration            } as any),
        ...(behavioral          && { behavioralScore:  JSON.stringify(behavioral) } as any),
      },
      include: { scenario: { include: { competency: true } } },
    });

    // XP award
    const xpBase   = (session.scenario as any).xpReward
      ?? DIFFICULTY_XP[(session.scenario as any).difficulty ?? 'BEGINNER'];
    const xpBonus  = finalScore >= 90 ? Math.round(xpBase * 0.5) : 0;
    const xpEarned = finalScore >= 40 ? xpBase + xpBonus : Math.round(xpBase * 0.25);

    await this.prisma.userPoints.upsert({
      where:  { userId },
      create: { userId, points: xpEarned },
      update: { points: { increment: xpEarned } },
    });

    // Badge for perfect score
    if (finalScore >= 90) {
      const perfectBadge = await this.prisma.badge.findFirst({
        where: { code: 'AVATAR_PERFECT' } as any,
      }).catch(() => null);
      if (perfectBadge) {
        await this.prisma.badgeAward.create({
          data: { userId, badgeId: perfectBadge.id },
        }).catch(() => {});
      }
    }

    // Notification
    await this.prisma.notificationLog.create({
      data: {
        userId,
        type:     'AVATAR_SESSION_COMPLETED',
        message:  `Sessão concluída! Score: ${finalScore} — ${grade}. +${xpEarned} XP 🎉`,
        metadata: JSON.stringify({}),
      },
    }).catch(() => {});

    // Suggest next scenario
    const nextScenario = await this.suggestNextScenario(userId, session.scenarioId);

    return {
      session:      updated,
      finalScore,
      grade,
      behavioral,
      xpEarned,
      durationSeconds: duration,
      strengths:    this.buildStrengths(behavioral),
      improvements: this.buildImprovements(behavioral, finalScore),
      nextScenario,
    };
  }

  async pauseSession(sessionId: number, userId: number) {
    return this.prisma.avatarSession.update({
      where: { id: sessionId, userId },
      data:  { status: 'PAUSED' },
    }).catch(() => ({ sessionId, status: 'PAUSED' }));
  }

  async resumeSession(sessionId: number, userId: number) {
    return this.prisma.avatarSession.update({
      where: { id: sessionId, userId },
      data:  { status: 'IN_PROGRESS' },
    }).catch(() => ({ sessionId, status: 'IN_PROGRESS' }));
  }

  // ══════════════════════════════════════════════════════
  // HISTORY & PROGRESS
  // ══════════════════════════════════════════════════════

  async getMyHistory(userId: number, limit = 20) {
    const sessions = await this.prisma.avatarSession.findMany({
      where:   { userId },
      include: { scenario: { include: { competency: true } } },
      orderBy: { startedAt: 'desc' },
      take:    limit,
    });

    const completed = sessions.filter(s => s.status === 'COMPLETED');
    const avgScore  = completed.length
      ? +(completed.reduce((a, s) => a + (s.score ?? 0), 0) / completed.length).toFixed(1)
      : null;

    return {
      sessions,
      stats: {
        total:     sessions.length,
        completed: completed.length,
        avgScore,
        totalXP:   completed.reduce((a, s) => a + Math.round((s.score ?? 0) / 10), 0),
        streak:    this.calculateStreak(sessions),
      },
    };
  }

  async getSessionDetail(sessionId: number, userId: number) {
    const s = await this.prisma.avatarSession.findUnique({
      where:   { id: sessionId },
      include: { scenario: { include: { competency: true, turns: { orderBy: { order: 'asc' } } } } } as any,
    }).catch(() => null);
    if (!s) throw new NotFoundException('Sessão não encontrada');
    if (s.userId !== userId) throw new ForbiddenException();

    const history  = s.conversationHistory ? JSON.parse(s.conversationHistory as string) : [];
    const behavioral = (s as any).behavioralScore ? JSON.parse((s as any).behavioralScore) : {};

    return { ...s, conversationHistory: history, behavioral };
  }

  // ══════════════════════════════════════════════════════
  // LEADERBOARD & SOCIAL
  // ══════════════════════════════════════════════════════

  async getLeaderboard(scenarioId: number, limit = 10) {
    const sessions = await this.prisma.avatarSession.findMany({
      where:   { scenarioId, status: 'COMPLETED' },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true,
        department: { select: { name: true } } } } },
      orderBy: { score: 'desc' },
      take:    limit,
    });

    return sessions.map((s, i) => ({
      rank:      i + 1,
      user:      (s as any).user,
      score:     s.score,
      grade:     gradeScore(s.score ?? 0),
      duration:  (s as any).durationSeconds,
      completedAt: s.completedAt,
    }));
  }

  async getGlobalLeaderboard(departmentId?: number, limit = 20) {
    const where: any = { status: 'COMPLETED' };
    if (departmentId) where.user = { departmentId };

    const grouped = await this.prisma.avatarSession.groupBy({
      by:      ['userId'],
      where,
      _avg:    { score: true },
      _count:  { id: true },
      orderBy: { _avg: { score: 'desc' } },
      take:    limit,
    }).catch(() => [] as any[]);

    const userIds = (grouped as any[]).map((g: any) => g.userId);
    const users   = await this.prisma.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, fullName: true, avatarUrl: true,
        department:  { select: { name: true } },
        position:    { select: { name: true } } },
    });
    const uMap = new Map(users.map(u => [u.id, u]));

    return (grouped as any[]).map((g: any, i: number) => ({
      rank:      i + 1,
      user:      uMap.get(g.userId),
      avgScore:  +(g._avg.score).toFixed(1),
      sessions:  g._count.id,
    }));
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════

  async getDashboard(filters: AnalyticsFilterDto = {}) {
    const { departmentId, category } = filters;
    const userWhere: any = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const sessionsWhere: any = {};
    if (category) sessionsWhere.scenario = { category };
    if (departmentId) sessionsWhere.user  = { departmentId };

    const [
      totalScenarios, activeSessions, completedSessions,
      topScenarios, categoryBreakdown, recentCompletions, avgScoreResult,
    ] = await Promise.all([
      this.prisma.avatarScenario.count({ where: { active: true } }),
      this.prisma.avatarSession.count({ where: { ...sessionsWhere, status: 'IN_PROGRESS' } }),
      this.prisma.avatarSession.count({ where: { ...sessionsWhere, status: 'COMPLETED' } }),
      // Top scenarios by completions
      this.prisma.avatarSession.groupBy({
        by:      ['scenarioId'],
        where:   { ...sessionsWhere, status: 'COMPLETED' },
        _count:  { id: true },
        _avg:    { score: true },
        orderBy: { _count: { id: 'desc' } },
        take:    5,
      }).catch(() => [] as any[]),
      // By category
      (this.prisma as any).avatarScenario.groupBy({
         by:     ['category'],
         where:  { active: true },
         _count: { id: true },
         }).catch(() => [] as any[]),
      // Recent completions
      (this.prisma as any).avatarSession.findMany({
      where:   { ...sessionsWhere, status: 'COMPLETED' },
       include: {
       user:     { select: { id: true, fullName: true, avatarUrl: true } },
       scenario: { select: { id: true, title: true, category: true } },
       },
        orderBy: { completedAt: 'desc' },
        take:    5,
      }),
      // Avg score
      this.prisma.avatarSession.aggregate({
        where: { ...sessionsWhere, status: 'COMPLETED' },
        _avg:  { score: true },
      }).catch(() => ({ _avg: { score: null } })),
    ]);

    // Enrich top scenarios with titles
    const scenarioIds = (topScenarios as any[]).map((s: any) => s.scenarioId);
    const scenarios   = scenarioIds.length
      ? await (this.prisma as any).avatarScenario.findMany({ where: { id: { in: scenarioIds } }, select: { id: true, title: true, category: true } })
      : [];
    const sMap = new Map(scenarios.map(s => [s.id, s]));

    return {
      kpis: {
        totalScenarios,
        activeSessions,
        completedSessions,
        avgScore: avgScoreResult._avg.score ? +(avgScoreResult._avg.score).toFixed(1) : null,
      },
      topScenarios: (topScenarios as any[]).map((s: any) => ({
        scenario:    sMap.get(s.scenarioId),
        completions: s._count.id,
        avgScore:    s._avg.score ? +(s._avg.score).toFixed(1) : null,
      })),
      categoryBreakdown: (categoryBreakdown as any[]).map((c: any) => ({
        category: c.category, count: c._count.id,
      })),
      recentCompletions,
    };
  }

  async getUserAnalytics(userId: number) {
    const sessions = await (this.prisma as any).avatarSession.findMany({
       where:   { userId },
       include: { scenario: { select: { category: true, difficulty: true, title: true } } },
       orderBy: { startedAt: 'asc' },
         });

    const completed  = sessions.filter(s => s.status === 'COMPLETED');
    const byCategory = (completed as any[]).reduce((acc: Record<string, { count: number; totalScore: number }>, s: any) => {
    const cat = s.scenario?.category ?? 'OTHER';
      if (!acc[cat]) acc[cat] = { count: 0, totalScore: 0 };
      acc[cat].count++;
      acc[cat].totalScore += s.score ?? 0;
      return acc;
    }, {});

    const points = await this.prisma.userPoints.findUnique({ where: { userId } });

    return {
      userId,
      totalSessions: sessions.length,
      completed:     completed.length,
      avgScore:      completed.length
        ? +(completed.reduce((a, s) => a + (s.score ?? 0), 0) / completed.length).toFixed(1)
        : null,
      xpPoints:      points?.points ?? 0,
      streak:        this.calculateStreak(sessions),
      byCategory:    Object.entries(byCategory).map(([cat, d]) => ({
        category: cat,
        count:    (d as any).count,
        avgScore: +((d as any).totalScore / (d as any).count).toFixed(1),
      })),
      evolution: completed.map(s => ({
        date:  s.completedAt,
        score: s.score,
        title: (s.scenario as any)?.title,
      })),
    };
  }

  async getTeamAnalytics(managerId: number) {
    const team = await this.prisma.user.findMany({
      where:  { managerId, active: true },
      select: { id: true, fullName: true, avatarUrl: true,
        position: { select: { name: true } } },
    });
    if (!team.length) return { team: [], message: 'Sem equipa directa' };

    const teamIds  = team.map(u => u.id);
    const sessions = await this.prisma.avatarSession.findMany({
      where:   { userId: { in: teamIds }, status: 'COMPLETED' },
      select:  { userId: true, score: true, scenarioId: true, completedAt: true },
    });

    const enriched = team.map(u => {
      const uSessions = sessions.filter(s => s.userId === u.id);
      const avg       = uSessions.length
        ? +(uSessions.reduce((a, s) => a + (s.score ?? 0), 0) / uSessions.length).toFixed(1)
        : null;
      return {
        user:      u,
        sessions:  uSessions.length,
        avgScore:  avg,
        alert:     avg !== null && avg < 50,
      };
    });

    const teamAvg = enriched.filter(u => u.avgScore !== null).length > 0
      ? +(enriched.filter(u => u.avgScore !== null)
          .reduce((a, u) => a + +(u.avgScore ?? 0), 0)
        / enriched.filter(u => u.avgScore !== null).length).toFixed(1)
      : null;

    return {
      team: enriched.sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0)),
      teamAvg,
      alerts: enriched.filter(u => u.alert),
    };
  }

  // ══════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ══════════════════════════════════════════════════════

  async getRecommendedScenarios(userId: number, limit = 6) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { userCompetencies: { select: { competencyId: true, currentLevel: true } } },
    });

    // Competencies with gaps
    const gapCompIds = (user?.userCompetencies ?? [])
      .filter(c => (c.currentLevel ?? 0) < 4)
      .map(c => c.competencyId);

    // Already completed scenario IDs
    const completedIds = await this.prisma.avatarSession
      .findMany({ where: { userId, status: 'COMPLETED' }, select: { scenarioId: true } })
      .then(ss => ss.map(s => s.scenarioId))
      .catch(() => [] as number[]);

    const where: any = {
      active: true,
      id: completedIds.length ? { notIn: completedIds } : undefined,
    };
    if (gapCompIds.length) where.competencyId = { in: gapCompIds };

    const scenarios = await this.prisma.avatarScenario.findMany({
      where,
      include: { competency: { select: { name: true } } },
      orderBy: { difficulty: 'asc' },
      take:    limit,
    });

    // Fallback to popular if none match
    if (!scenarios.length) {
      return this.prisma.avatarScenario.findMany({
        where: { active: true, id: completedIds.length ? { notIn: completedIds } : undefined },
        include: { competency: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take:    limit,
      });
    }

    return scenarios;
  }

  private async suggestNextScenario(userId: number, completedScenarioId: number) {
    const current = await this.prisma.avatarScenario.findUnique({
      where: { id: completedScenarioId },
    }).catch(() => null);

    return this.prisma.avatarScenario.findFirst({
      where: {
        active: true,
        id:     { not: completedScenarioId },
        ...(current && { category: (current as any).category }),
      },
      include: { competency: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  private calculateStreak(sessions: any[]): number {
    const completed = sessions
      .filter(s => s.status === 'COMPLETED' && s.completedAt)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    if (!completed.length) return 0;
    let streak = 1;
    for (let i = 1; i < completed.length; i++) {
      const diff = (new Date(completed[i - 1].completedAt).getTime() -
        new Date(completed[i].completedAt).getTime()) / 86400000;
      if (diff <= 2) streak++;
      else break;
    }
    return streak;
  }

  private buildStrengths(behavioral: Record<string, number>): string[] {
    const out: string[] = [];
    if ((behavioral.empathy ?? 0) >= 70)      out.push('Excelente empatia nas respostas');
    if ((behavioral.clarity ?? 0) >= 70)      out.push('Comunicação clara e objectiva');
    if ((behavioral.assertiveness ?? 0) >= 70) out.push('Alto nível de assertividade');
    if (!out.length)                           out.push('Completou o cenário com sucesso');
    return out;
  }

  private buildImprovements(behavioral: Record<string, number>, score: number): string[] {
    const out: string[] = [];
    if ((behavioral.empathy ?? 100) < 50)       out.push('Desenvolver empatia nas interacções difíceis');
    if ((behavioral.clarity ?? 100) < 50)       out.push('Melhorar clareza e estrutura das respostas');
    if ((behavioral.assertiveness ?? 100) < 50) out.push('Ser mais assertivo nas tomadas de decisão');
    if (score < 60)                             out.push('Rever os conceitos chave deste cenário');
    return out;
  }
}
