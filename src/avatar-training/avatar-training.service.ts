// src/avatar-training/avatar-training.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, ScenarioCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAvatarDto,
  UpdateAvatarDto,
  AvatarFilterDto,
  CreateScenarioDto,
  ScenarioFilterDto,
  StartSessionDto,
  SendMessageDto,
  CompleteSessionDto,
  AvatarTrainingAnalyticsFilterDto,
  SessionStatus,
} from './avatar-training.dto';

// ─── Helpers ─────────────────────────────────────────────────────

const safeM = (prisma: any, name: string) =>
  prisma[name] ?? {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d.data,
    createMany: async () => ({ count: 0 }),
    upsert: async (d: any) => d.create,
    update: async (d: any) => d.data,
    delete: async () => null,
    count: async () => 0,
    groupBy: async () => [],
  };

// AvatarSession.conversationHistory é uma String (JSON serializado à mão) —
// esta interface documenta a forma real das mensagens (confirmada nos
// próprios .push() deste ficheiro), já que não há tipo gerado pelo Prisma
// para o conteúdo de uma coluna de texto.
export interface ConversationMessage {
  role: 'USER' | 'AVATAR';
  content: string;
  timestamp: Date;
  score?: number;
  behavioral?: Record<string, number>;
}

/** Base XP per difficulty */
const DIFFICULTY_XP: Record<string, number> = {
  BEGINNER: 15,
  INTERMEDIATE: 30,
  ADVANCED: 50,
  EXPERT: 80,
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
  const lower = message.toLowerCase();
  const matched = expectedKeywords.filter(k => lower.includes(k.toLowerCase())).length;
  const keyScore =
    expectedKeywords.length > 0 ? Math.round((matched / expectedKeywords.length) * 100) : 70; // default if no expected keywords

  // Heuristic behavioral scoring
  const empathyWords = ['entendo', 'compreendo', 'imagino', 'sinto', 'obrigado'];
  const assertiveWords = ['vou', 'farei', 'comprometo', 'garanto', 'certeza'];
  const clarityPenalty = message.length < 10 ? -20 : 0;

  const empathy = Math.min(100, 40 + empathyWords.filter(w => lower.includes(w)).length * 15);
  const assertiveness = Math.min(
    100,
    40 + assertiveWords.filter(w => lower.includes(w)).length * 15,
  );
  const clarity = Math.min(100, 50 + Math.min(message.length / 5, 30) + clarityPenalty);

  return {
    score: keyScore,
    behavioral: { empathy, assertiveness, clarity, decisionMaking: keyScore },
  };
}

/** Build AI avatar prompt */
function buildAvatarPrompt(
  avatar: {
    systemPrompt?: string | null;
    role?: string;
    personality?: string;
    language?: string;
  } | null,
  // context/objective não existem em AvatarScenario (achado estrutural, ver
  // comentário em createScenario) — este parâmetro nunca os fornece de
  // facto, ficam sempre como string vazia.
  scenario: { context?: string; objective?: string } | null,
  conversationHistory: ConversationMessage[],
  userMessage: string,
): string {
  const persona =
    avatar?.systemPrompt ??
    `És um avatar de treino corporativo com papel de ${avatar?.role ?? 'coach'}.`;
  const context = scenario?.context ?? '';
  const objective = scenario?.objective ?? '';
  const history = conversationHistory
    .slice(-6)
    .map(m => `${m.role === 'USER' ? 'Utilizador' : 'Avatar'}: ${m.content}`)
    .join('\n');

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
  private readonly logger = new Logger(AvatarTrainingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // AVATARS — CRUD
  // ══════════════════════════════════════════════════════

  async createAvatar(userId: number, dto: CreateAvatarDto) {
    const avatar = await safeM(this.prisma, 'trainingAvatar')
      .create({
        data: {
          name: dto.name,
          description: dto.description,
          role: dto.role,
          style: dto.style ?? 'MINIMALIST',
          personality: dto.personality ?? 'EMPATHETIC',
          language: dto.language ?? 'pt',
          voiceId: dto.voiceId,
          avatarImageUrl: dto.avatarImageUrl,
          systemPrompt: dto.systemPrompt,
          isPublic: dto.isPublic ?? false,
          hasMemory: dto.hasMemory ?? true,
          knowledgeUrls: dto.knowledgeUrls ?? [],
          brandingColor: dto.brandingColor,
          createdById: userId,
          active: true,
        },
      })
      .catch(async e => {
        // Fallback for Prisma model not yet created
        this.logger.warn({
          userId,
          action: 'CREATE_AVATAR',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar avatar — possivelmente modelo trainingAvatar ausente (migration pendente)',
        });
        return {
          id: null,
          ...dto,
          message: 'Avatar registado (modelo trainingAvatar ausente — execute migration)',
        };
      });

    return avatar;
  }

  async getAvatars(filters: AvatarFilterDto = {}) {
    const { page = 1, limit = 20, role, isPublic } = filters;
    const skip = (page - 1) * limit;
    const where: any = { active: true };
    if (role) where.role = role;
    if (isPublic !== undefined) where.isPublic = isPublic;

    const data = await safeM(this.prisma, 'trainingAvatar')
      .findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      })
      .catch(e => {
        this.logger.warn({
          filters,
          action: 'GET_AVATARS_LIST',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao listar avatares de treino',
        });
        return [] as any[];
      });
    const total = await safeM(this.prisma, 'trainingAvatar')
      .count({ where })
      .catch(e => {
        this.logger.warn({
          filters,
          action: 'GET_AVATARS_COUNT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar avatares de treino',
        });
        return 0;
      });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getAvatar(id: number) {
    const a = await safeM(this.prisma, 'trainingAvatar')
      .findUnique({ where: { id } })
      .catch(e => {
        this.logger.warn({
          avatarId: id,
          action: 'GET_AVATAR',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter avatar de treino',
        });
        return null;
      });
    if (!a) throw new NotFoundException('Avatar não encontrado');
    return a;
  }

  async updateAvatar(id: number, dto: UpdateAvatarDto) {
    return safeM(this.prisma, 'trainingAvatar')
      .update({ where: { id }, data: dto })
      .catch(e => {
        this.logger.warn({
          avatarId: id,
          action: 'UPDATE_AVATAR',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao actualizar avatar de treino',
        });
        return { id, message: 'Actualizado', ...dto };
      });
  }

  async deleteAvatar(id: number) {
    await safeM(this.prisma, 'trainingAvatar')
      .update({
        where: { id },
        data: { active: false },
      })
      .catch(e => {
        this.logger.warn({
          avatarId: id,
          action: 'DELETE_AVATAR',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao desactivar avatar de treino',
        });
        return null;
      });
    return { message: 'Avatar desactivado' };
  }

  async uploadKnowledge(avatarId: number, fileUrl: string, title: string) {
    await safeM(this.prisma, 'avatarKnowledge')
      .create({
        data: { avatarId, fileUrl, title, processed: false },
      })
      .catch(e => {
        this.logger.warn({
          avatarId,
          action: 'UPLOAD_AVATAR_KNOWLEDGE',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao adicionar documento à base de conhecimento do avatar',
        });
        return null;
      });

    return { avatarId, fileUrl, title, message: 'Documento adicionado à base de conhecimento' };
  }

  // ══════════════════════════════════════════════════════
  // SCENARIOS — CRUD
  // ══════════════════════════════════════════════════════

  // AvatarScenario só persiste title/description/difficulty/category/competencyId/
  // active — avatarId, estimatedMinutes, xpReward, context, objective, thumbnailUrl,
  // isTemplate, createdById e turns (diálogo ramificado) são aceites no DTO mas não
  // têm coluna/relação no schema; ver memória sobre esta lacuna arquitectural.
  async createScenario(createdById: number, dto: CreateScenarioDto) {
    const scenario = await this.prisma.avatarScenario.create({
      data: {
        title: dto.title,
        description: dto.description,
        difficulty: dto.difficulty,
        category: dto.category,
        competencyId: dto.competencyId,
        active: true,
      },
      include: { competency: { select: { id: true, name: true } } },
    });

    return scenario;
  }

  async getScenarios(filters: ScenarioFilterDto = {}) {
    const { page = 1, limit = 20, category, difficulty, competencyId, search } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.AvatarScenarioWhereInput = { active: true };
    if (category) where.category = category;
    if (difficulty) where.difficulty = difficulty;
    if (competencyId) where.competencyId = competencyId;
    if (search)
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];

    const [data, total] = await Promise.all([
      this.prisma.read.avatarScenario.findMany({
        where,
        skip,
        take: limit,
        include: { competency: { select: { id: true, name: true } } },
        orderBy: { difficulty: 'asc' },
      }),
      this.prisma.read.avatarScenario.count({ where }),
    ]);

    // Enrich with user completion stats
    const ids = data.map(s => s.id);
    const completions = await this.prisma.avatarSession
      .groupBy({
        by: ['scenarioId'],
        where: { scenarioId: { in: ids }, status: 'COMPLETED' },
        _count: { id: true },
        _avg: { score: true },
      })
      .catch(e => {
        this.logger.warn({
          scenarioIds: ids,
          action: 'GET_SCENARIOS_COMPLETION_STATS',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter estatísticas de conclusão dos cenários',
        });
        return [] as {
          scenarioId: number;
          _count: { id: number };
          _avg: { score: number | null };
        }[];
      });
    const cMap = new Map(
      completions.map((c): [number, (typeof completions)[number]] => [c.scenarioId, c]),
    );

    return {
      data: data.map(s => ({
        ...s,
        completions: cMap.get(s.id)?._count.id ?? 0,
        avgScore: cMap.get(s.id)?._avg.score ? +cMap.get(s.id)!._avg.score!.toFixed(1) : null,
        // xpReward não existe em AvatarScenario (achado estrutural, ver
        // comentário acima de createScenario) — sempre cai no valor por
        // difficulty.
        xpReward: DIFFICULTY_XP[s.difficulty],
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getScenario(id: number, userId?: number) {
    type ScenarioWithCompetency = Prisma.AvatarScenarioGetPayload<{
      include: { competency: { select: { id: true; name: true } } };
    }>;
    const s: ScenarioWithCompetency | null = await this.prisma.avatarScenario
      .findUnique({
        where: { id },
        include: {
          competency: { select: { id: true, name: true } },
        },
      })
      .catch(e => {
        this.logger.warn({
          scenarioId: id,
          action: 'GET_SCENARIO',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter cenário de treino',
        });
        return null;
      });
    if (!s) throw new NotFoundException('Cenário não encontrado');

    // User best attempt
    let bestSession: Prisma.AvatarSessionGetPayload<object> | null = null;
    if (userId) {
      bestSession = await this.prisma.avatarSession
        .findFirst({
          where: { userId, scenarioId: id, status: 'COMPLETED' },
          orderBy: { score: 'desc' },
        })
        .catch(e => {
          this.logger.warn({
            userId,
            scenarioId: id,
            action: 'GET_SCENARIO_BEST_SESSION',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter melhor tentativa do utilizador no cenário',
          });
          return null;
        });
    }

    return {
      ...s,
      bestSession,
      // avatarId/xpReward não existem em AvatarScenario (achado estrutural,
      // ver comentário em createScenario) — avatarId fica sempre undefined
      // (startSession's `dto.avatarId ?? scenario.avatarId` depende só do
      // override explícito do DTO); xpReward cai sempre no valor por
      // difficulty.
      xpReward: DIFFICULTY_XP[s.difficulty],
    };
  }

  // ══════════════════════════════════════════════════════
  // SESSIONS — LIFECYCLE
  // ══════════════════════════════════════════════════════

  async startSession(userId: number, dto: StartSessionDto) {
    const scenario = await this.getScenario(dto.scenarioId, userId);

    // Abandon any active session for this scenario
    await this.prisma.avatarSession
      .updateMany({
        where: { userId, scenarioId: dto.scenarioId, status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED' },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          scenarioId: dto.scenarioId,
          action: 'ABANDON_PREVIOUS_SESSION',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao abandonar sessão anterior em progresso para o mesmo cenário',
        });
      });

    // Get avatar (from scenario or override)
    const avatarId = dto.avatarId;
    const avatar = avatarId
      ? await safeM(this.prisma, 'trainingAvatar')
          .findUnique({ where: { id: avatarId } })
          .catch(e => {
            this.logger.warn({
              avatarId,
              action: 'START_SESSION_GET_AVATAR',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao obter avatar para iniciar sessão',
            });
            return null;
          })
      : null;

    // Build opening line
    // NOTA: scenario.context não existe em AvatarScenario (achado
    // estrutural, ver comentário em createScenario) — sempre vazio.
    const openingMessage = avatar
      ? `Olá! Sou ${avatar.name}. Vamos começar o treino?`
      : `Bem-vindo ao cenário "${scenario.title}". Está pronto para começar?`;

    const session = await this.prisma.avatarSession.create({
      data: {
        userId,
        scenarioId: dto.scenarioId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        ...(avatarId && { avatarId }),
        ...(dto.language && { language: dto.language }),
        conversationHistory: JSON.stringify([
          { role: 'AVATAR', content: openingMessage, timestamp: new Date() },
        ]),
      },
      include: {
        scenario: { include: { competency: true } },
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'AVATAR_SESSION_STARTED',
          message: `Sessão iniciada: "${scenario.title}"`,
          metadata: JSON.stringify({ sessionId: session.id, scenarioId: dto.scenarioId }),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          sessionId: session.id,
          action: 'NOTIFY_AVATAR_SESSION_STARTED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de início de sessão de treino com avatar',
        });
      });

    return {
      session,
      avatar,
      openingMessage,
      // objective não existe em AvatarScenario (mesmo achado estrutural).
      scenario: { title: scenario.title },
    };
  }

  async sendMessage(sessionId: number, userId: number, dto: SendMessageDto) {
    type SessionWithScenario = Prisma.AvatarSessionGetPayload<{ include: { scenario: true } }>;
    const session: SessionWithScenario | null = await this.prisma.avatarSession
      .findUnique({
        where: { id: sessionId },
        include: {
          scenario: true,
        },
      })
      .catch(e => {
        this.logger.warn({
          sessionId,
          userId,
          action: 'SEND_MESSAGE_GET_SESSION',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter sessão de treino ao enviar mensagem',
        });
        return null;
      });

    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.userId !== userId) throw new ForbiddenException();
    if (session.status !== SessionStatus.IN_PROGRESS)
      throw new BadRequestException('Sessão não está activa');

    const history: ConversationMessage[] = session.conversationHistory
      ? JSON.parse(session.conversationHistory as string)
      : [];

    history.push({ role: 'USER', content: dto.message, timestamp: new Date() });

    // Get current turn — "turns" (diálogo ramificado) não existe em
    // AvatarScenario (achado estrutural, ver comentário em createScenario)
    // — é sempre [], por isso currentTurn é sempre undefined e o fluxo cai
    // sempre no "Free-form AI response" abaixo. Comportamento pré-existente,
    // não alterado aqui.
    const turns: {
      expectedKeywords?: string[];
      successPath?: string;
      avatarLine?: string;
      failPath?: string;
      hint?: string;
    }[] = (session.scenario as unknown as { turns?: typeof turns }).turns ?? [];
    const turnIndex = dto.turnIndex ?? history.filter(m => m.role === 'USER').length - 1;
    const currentTurn = turns[Math.min(turnIndex, turns.length - 1)];

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
        avatarResponse =
          currentTurn.successPath ?? currentTurn.avatarLine ?? 'Muito bem! Continua assim.';
      } else {
        avatarResponse =
          currentTurn.failPath ??
          `Quase lá! ${currentTurn.hint ?? 'Tenta reformular a tua resposta.'}`;
      }
    } else {
      // Free-form AI response (no structured turn)
      const avatar = session.avatarId
        ? await safeM(this.prisma, 'trainingAvatar')
            .findUnique({ where: { id: session.avatarId } })
            .catch(e => {
              this.logger.warn({
                avatarId: session.avatarId,
                sessionId,
                action: 'SEND_MESSAGE_GET_AVATAR',
                err: { message: e instanceof Error ? e.message : String(e) },
                msg: 'Falha ao obter avatar para gerar resposta livre',
              });
              return null;
            })
        : null;

      avatarResponse = avatar?.systemPrompt
        ? `[IA] Obrigado pela tua resposta. Como posso ajudar mais?`
        : 'Boa resposta! O que gostarias de explorar a seguir?';
    }

    history.push({
      role: 'AVATAR',
      content: avatarResponse,
      timestamp: new Date(),
      score: turnScore,
      behavioral,
    });

    // Update session
    await this.prisma.avatarSession.update({
      where: { id: sessionId },
      data: { conversationHistory: JSON.stringify(history) },
    });

    // Check if all turns completed
    const userTurns = history.filter(m => m.role === 'USER').length;
    const isLastTurn = turns.length > 0 && userTurns >= turns.length;
    const avgTurnScore =
      history.filter(m => m.score !== undefined).reduce((a: number, m) => a + (m.score ?? 0), 0) /
      Math.max(history.filter(m => m.score !== undefined).length, 1);

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
    type SessionWithScenario = Prisma.AvatarSessionGetPayload<{ include: { scenario: true } }>;
    const session: SessionWithScenario | null = await this.prisma.avatarSession
      .findUnique({
        where: { id: sessionId },
        include: { scenario: true },
      })
      .catch(e => {
        this.logger.warn({
          sessionId,
          userId,
          action: 'COMPLETE_SESSION_GET_SESSION',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter sessão de treino ao concluir',
        });
        return null;
      });

    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.userId !== userId) throw new ForbiddenException();

    // Calculate score from conversation history if not provided
    let finalScore = dto.score;
    if (finalScore === undefined) {
      const history: ConversationMessage[] = session.conversationHistory
        ? JSON.parse(session.conversationHistory as string)
        : [];
      const scored = history.filter(m => m.score !== undefined);
      finalScore = scored.length
        ? Math.round(scored.reduce((a: number, m) => a + (m.score ?? 0), 0) / scored.length)
        : 70;
    }

    // Behavioral aggregate
    const history: ConversationMessage[] = session.conversationHistory
      ? JSON.parse(session.conversationHistory as string)
      : [];
    const behavioralMsgs = history.filter(m => m.behavioral);
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
    const grade = gradeScore(finalScore);

    const updated = await this.prisma.avatarSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        score: finalScore,
        feedback: dto.feedback,
        ...(dto.userRating && { userRating: dto.userRating }),
        ...(dto.confidenceLevel && { confidenceLevel: dto.confidenceLevel }),
        ...(dto.reflection && { reflection: dto.reflection }),
        ...(duration && { durationSeconds: duration }),
        ...(behavioral && { behavioralScore: JSON.stringify(behavioral) }),
      },
      include: { scenario: { include: { competency: true } } },
    });

    // XP award — xpReward não existe em AvatarScenario (achado estrutural),
    // cai sempre no valor por difficulty.
    const xpBase = DIFFICULTY_XP[session.scenario.difficulty];
    const xpBonus = finalScore >= 90 ? Math.round(xpBase * 0.5) : 0;
    const xpEarned = finalScore >= 40 ? xpBase + xpBonus : Math.round(xpBase * 0.25);

    await this.prisma.userPoints.upsert({
      where: { userId },
      create: { userId, points: xpEarned },
      update: { points: { increment: xpEarned } },
    });

    // Badge for perfect score
    if (finalScore >= 90) {
      const perfectBadge = await this.prisma.badge
        .findFirst({
          // Badge não tem coluna `code` — só `name` é único. Este badge
          // nunca foi semeado em prisma/seed*, por isso esta procura
          // devolve sempre null tanto antes como depois desta correcção;
          // a diferença é que antes rebentava sempre com erro de validação
          // do Prisma (código escondido pelo .catch()) em vez de
          // simplesmente não encontrar nada.
          where: { name: 'AVATAR_PERFECT' },
        })
        .catch(e => {
          this.logger.warn({
            userId,
            sessionId,
            action: 'COMPLETE_SESSION_FIND_PERFECT_BADGE',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao procurar badge de score perfeito',
          });
          return null;
        });
      if (perfectBadge) {
        await this.prisma.badgeAward
          .create({
            data: { userId, badgeId: perfectBadge.id },
          })
          .catch(e => {
            this.logger.warn({
              userId,
              badgeId: perfectBadge.id,
              action: 'COMPLETE_SESSION_AWARD_PERFECT_BADGE',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao atribuir badge de score perfeito',
            });
          });
      }
    }

    // Notification
    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'AVATAR_SESSION_COMPLETED',
          message: `Sessão concluída! Score: ${finalScore} — ${grade}. +${xpEarned} XP 🎉`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          sessionId,
          action: 'NOTIFY_AVATAR_SESSION_COMPLETED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de conclusão de sessão',
        });
      });

    // Suggest next scenario
    const nextScenario = await this.suggestNextScenario(userId, session.scenarioId);

    return {
      session: updated,
      finalScore,
      grade,
      behavioral,
      xpEarned,
      durationSeconds: duration,
      strengths: this.buildStrengths(behavioral),
      improvements: this.buildImprovements(behavioral, finalScore),
      nextScenario,
    };
  }

  async pauseSession(sessionId: number, userId: number) {
    return this.prisma.avatarSession
      .update({
        where: { id: sessionId, userId },
        data: { status: 'PAUSED' },
      })
      .catch(e => {
        this.logger.warn({
          sessionId,
          userId,
          action: 'PAUSE_SESSION',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao pausar sessão de treino',
        });
        return { sessionId, status: 'PAUSED' };
      });
  }

  async resumeSession(sessionId: number, userId: number) {
    return this.prisma.avatarSession
      .update({
        where: { id: sessionId, userId },
        data: { status: 'IN_PROGRESS' },
      })
      .catch(e => {
        this.logger.warn({
          sessionId,
          userId,
          action: 'RESUME_SESSION',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao retomar sessão de treino',
        });
        return { sessionId, status: 'IN_PROGRESS' };
      });
  }

  // ══════════════════════════════════════════════════════
  // HISTORY & PROGRESS
  // ══════════════════════════════════════════════════════

  async getMyHistory(userId: number, limit = 20) {
    const sessions = await this.prisma.read.avatarSession.findMany({
      where: { userId },
      include: { scenario: { include: { competency: true } } },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    const completed = sessions.filter(s => s.status === 'COMPLETED');
    const avgScore = completed.length
      ? +(completed.reduce((a, s) => a + (s.score ?? 0), 0) / completed.length).toFixed(1)
      : null;

    return {
      sessions,
      stats: {
        total: sessions.length,
        completed: completed.length,
        avgScore,
        totalXP: completed.reduce((a, s) => a + Math.round((s.score ?? 0) / 10), 0),
        streak: this.calculateStreak(sessions),
      },
    };
  }

  async getSessionDetail(sessionId: number, userId: number) {
    type SessionWithScenario = Prisma.AvatarSessionGetPayload<{
      include: { scenario: { include: { competency: true } } };
    }>;
    const s: SessionWithScenario | null = await this.prisma.avatarSession
      .findUnique({
        where: { id: sessionId },
        include: {
          scenario: { include: { competency: true } },
        },
      })
      .catch(e => {
        this.logger.warn({
          sessionId,
          userId,
          action: 'GET_SESSION_DETAIL',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter detalhe da sessão de treino',
        });
        return null;
      });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    if (s.userId !== userId) throw new ForbiddenException();

    const history: ConversationMessage[] = s.conversationHistory
      ? JSON.parse(s.conversationHistory)
      : [];
    const behavioral = s.behavioralScore ? JSON.parse(s.behavioralScore) : {};

    return { ...s, conversationHistory: history, behavioral };
  }

  // ══════════════════════════════════════════════════════
  // LEADERBOARD & SOCIAL
  // ══════════════════════════════════════════════════════

  async getLeaderboard(scenarioId: number, limit = 10) {
    const sessions = await this.prisma.read.avatarSession.findMany({
      where: { scenarioId, status: 'COMPLETED' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { score: 'desc' },
      take: limit,
    });

    return sessions.map((s, i) => ({
      rank: i + 1,
      user: s.user,
      score: s.score,
      grade: gradeScore(s.score ?? 0),
      duration: s.durationSeconds,
      completedAt: s.completedAt,
    }));
  }

  async getGlobalLeaderboard(departmentId?: number, limit = 20) {
    const where: Prisma.AvatarSessionWhereInput = { status: 'COMPLETED' };
    if (departmentId) where.user = { departmentId };

    const grouped = await this.prisma.avatarSession
      .groupBy({
        by: ['userId'],
        where,
        _avg: { score: true },
        _count: { id: true },
        orderBy: { _avg: { score: 'desc' } },
        take: limit,
      })
      .catch(e => {
        this.logger.warn({
          departmentId,
          action: 'GET_GLOBAL_LEADERBOARD',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao calcular ranking global de sessões de treino com avatar',
        });
        return [] as {
          userId: number;
          _avg: { score: number | null };
          _count: { id: number };
        }[];
      });

    const userIds = grouped.map(g => g.userId);
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    });
    const uMap = new Map(users.map(u => [u.id, u]));

    return grouped.map((g, i) => ({
      rank: i + 1,
      user: uMap.get(g.userId),
      avgScore: +(g._avg.score ?? 0).toFixed(1),
      sessions: g._count.id,
    }));
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════

  async getDashboard(filters: AvatarTrainingAnalyticsFilterDto = {}) {
    const { departmentId, category } = filters;
    // NOTA: userWhere é construído mas nunca aplicado a nenhuma query abaixo
    // — achado pré-existente, não corrigido aqui (mesmo padrão encontrado em
    // content-library.service.ts#getAnalyticsDashboard).
    const userWhere: Prisma.UserWhereInput = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const sessionsWhere: Prisma.AvatarSessionWhereInput = {};
    if (category) sessionsWhere.scenario = { category };
    if (departmentId) sessionsWhere.user = { departmentId };

    const [
      totalScenarios,
      activeSessions,
      completedSessions,
      topScenarios,
      categoryBreakdown,
      recentCompletions,
      avgScoreResult,
    ] = await Promise.all([
      this.prisma.read.avatarScenario.count({ where: { active: true } }),
      this.prisma.read.avatarSession.count({ where: { ...sessionsWhere, status: 'IN_PROGRESS' } }),
      this.prisma.read.avatarSession.count({ where: { ...sessionsWhere, status: 'COMPLETED' } }),
      // Top scenarios by completions
      this.prisma.avatarSession
        .groupBy({
          by: ['scenarioId'],
          where: { ...sessionsWhere, status: 'COMPLETED' },
          _count: { id: true },
          _avg: { score: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        })
        .catch(e => {
          this.logger.warn({
            departmentId,
            category,
            action: 'GET_DASHBOARD_TOP_SCENARIOS',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular top cenários por conclusões no dashboard',
          });
          return [] as {
            scenarioId: number;
            _count: { id: number };
            _avg: { score: number | null };
          }[];
        }),
      // By category
      this.prisma.avatarScenario
        .groupBy({
          by: ['category'],
          where: { active: true },
          _count: { id: true },
        })
        .catch(e => {
          this.logger.warn({
            departmentId,
            category,
            action: 'GET_DASHBOARD_CATEGORY_BREAKDOWN',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular distribuição de cenários por categoria no dashboard',
          });
          return [] as { category: ScenarioCategory | null; _count: { id: number } }[];
        }),
      // Recent completions
      this.prisma.avatarSession.findMany({
        where: { ...sessionsWhere, status: 'COMPLETED' },
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          scenario: { select: { id: true, title: true, category: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 5,
      }),
      // Avg score
      this.prisma.avatarSession
        .aggregate({
          where: { ...sessionsWhere, status: 'COMPLETED' },
          _avg: { score: true },
        })
        .catch(e => {
          this.logger.warn({
            departmentId,
            category,
            action: 'GET_DASHBOARD_AVG_SCORE',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao calcular score médio no dashboard',
          });
          return { _avg: { score: null } };
        }),
    ]);

    // Enrich top scenarios with titles
    const scenarioIds = topScenarios.map(s => s.scenarioId);
    const scenarios = scenarioIds.length
      ? await this.prisma.avatarScenario.findMany({
          where: { id: { in: scenarioIds } },
          select: { id: true, title: true, category: true },
        })
      : [];
    const sMap = new Map(scenarios.map(s => [s.id, s]));

    return {
      kpis: {
        totalScenarios,
        activeSessions,
        completedSessions,
        avgScore: avgScoreResult._avg.score ? +avgScoreResult._avg.score.toFixed(1) : null,
      },
      topScenarios: topScenarios.map(s => ({
        scenario: sMap.get(s.scenarioId),
        completions: s._count.id,
        avgScore: s._avg.score ? +s._avg.score.toFixed(1) : null,
      })),
      categoryBreakdown: categoryBreakdown.map(c => ({
        category: c.category,
        count: c._count.id,
      })),
      recentCompletions,
    };
  }

  async getUserAnalytics(userId: number) {
    const sessions = await this.prisma.avatarSession.findMany({
      where: { userId },
      include: { scenario: { select: { category: true, difficulty: true, title: true } } },
      orderBy: { startedAt: 'asc' },
    });

    const completed = sessions.filter(s => s.status === 'COMPLETED');
    const byCategory = completed.reduce(
      (acc: Record<string, { count: number; totalScore: number }>, s) => {
        const cat = s.scenario?.category ?? 'OTHER';
        if (!acc[cat]) acc[cat] = { count: 0, totalScore: 0 };
        acc[cat].count++;
        acc[cat].totalScore += s.score ?? 0;
        return acc;
      },
      {},
    );

    const points = await this.prisma.read.userPoints.findUnique({ where: { userId } });

    return {
      userId,
      totalSessions: sessions.length,
      completed: completed.length,
      avgScore: completed.length
        ? +(completed.reduce((a, s) => a + (s.score ?? 0), 0) / completed.length).toFixed(1)
        : null,
      xpPoints: points?.points ?? 0,
      streak: this.calculateStreak(sessions),
      byCategory: Object.entries(byCategory).map(([cat, d]) => ({
        category: cat,
        count: d.count,
        avgScore: +(d.totalScore / d.count).toFixed(1),
      })),
      evolution: completed.map(s => ({
        date: s.completedAt,
        score: s.score,
        title: s.scenario?.title,
      })),
    };
  }

  async getTeamAnalytics(managerId: number) {
    const team = await this.prisma.read.user.findMany({
      where: { managerId, active: true },
      select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } },
    });
    if (!team.length) return { team: [], message: 'Sem equipa directa' };

    const teamIds = team.map(u => u.id);
    const sessions = await this.prisma.read.avatarSession.findMany({
      where: { userId: { in: teamIds }, status: 'COMPLETED' },
      select: { userId: true, score: true, scenarioId: true, completedAt: true },
    });

    const enriched = team.map(u => {
      const uSessions = sessions.filter(s => s.userId === u.id);
      const avg = uSessions.length
        ? +(uSessions.reduce((a, s) => a + (s.score ?? 0), 0) / uSessions.length).toFixed(1)
        : null;
      return {
        user: u,
        sessions: uSessions.length,
        avgScore: avg,
        alert: avg !== null && avg < 50,
      };
    });

    const teamAvg =
      enriched.filter(u => u.avgScore !== null).length > 0
        ? +(
            enriched.filter(u => u.avgScore !== null).reduce((a, u) => a + +(u.avgScore ?? 0), 0) /
            enriched.filter(u => u.avgScore !== null).length
          ).toFixed(1)
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
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
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
      .catch(e => {
        this.logger.warn({
          userId,
          action: 'GET_RECOMMENDED_SCENARIOS_COMPLETED_IDS',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter cenários já concluídos para recomendação',
        });
        return [] as number[];
      });

    const where: Prisma.AvatarScenarioWhereInput = {
      active: true,
      id: completedIds.length ? { notIn: completedIds } : undefined,
    };
    if (gapCompIds.length) where.competencyId = { in: gapCompIds };

    const scenarios = await this.prisma.read.avatarScenario.findMany({
      where,
      include: { competency: { select: { name: true } } },
      orderBy: { difficulty: 'asc' },
      take: limit,
    });

    // Fallback to popular if none match
    if (!scenarios.length) {
      return this.prisma.read.avatarScenario.findMany({
        where: { active: true, id: completedIds.length ? { notIn: completedIds } : undefined },
        include: { competency: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    return scenarios;
  }

  private async suggestNextScenario(userId: number, completedScenarioId: number) {
    const current = await this.prisma.avatarScenario
      .findUnique({
        where: { id: completedScenarioId },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          scenarioId: completedScenarioId,
          action: 'SUGGEST_NEXT_SCENARIO_GET_CURRENT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter cenário concluído para sugerir o próximo',
        });
        return null;
      });

    return this.prisma.avatarScenario
      .findFirst({
        where: {
          active: true,
          id: { not: completedScenarioId },
          ...(current && { category: current.category }),
        },
        include: { competency: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })
      .catch(e => {
        this.logger.warn({
          userId,
          scenarioId: completedScenarioId,
          action: 'SUGGEST_NEXT_SCENARIO',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao sugerir próximo cenário de treino',
        });
        return null;
      });
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  private calculateStreak(sessions: { status: string; completedAt: Date | null }[]): number {
    const completed = sessions
      .filter(s => s.status === 'COMPLETED' && s.completedAt)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    if (!completed.length) return 0;
    let streak = 1;
    for (let i = 1; i < completed.length; i++) {
      const diff =
        (new Date(completed[i - 1].completedAt).getTime() -
          new Date(completed[i].completedAt).getTime()) /
        86400000;
      if (diff <= 2) streak++;
      else break;
    }
    return streak;
  }

  private buildStrengths(behavioral: Record<string, number>): string[] {
    const out: string[] = [];
    if ((behavioral.empathy ?? 0) >= 70) out.push('Excelente empatia nas respostas');
    if ((behavioral.clarity ?? 0) >= 70) out.push('Comunicação clara e objectiva');
    if ((behavioral.assertiveness ?? 0) >= 70) out.push('Alto nível de assertividade');
    if (!out.length) out.push('Completou o cenário com sucesso');
    return out;
  }

  private buildImprovements(behavioral: Record<string, number>, score: number): string[] {
    const out: string[] = [];
    if ((behavioral.empathy ?? 100) < 50) out.push('Desenvolver empatia nas interacções difíceis');
    if ((behavioral.clarity ?? 100) < 50) out.push('Melhorar clareza e estrutura das respostas');
    if ((behavioral.assertiveness ?? 100) < 50)
      out.push('Ser mais assertivo nas tomadas de decisão');
    if (score < 60) out.push('Rever os conceitos chave deste cenário');
    return out;
  }
}
