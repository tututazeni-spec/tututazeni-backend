// src/avatar-training/avatar-training-ai-tutor.service.ts
// Fase 4 — adaptador para o AI-Tutor existente (docs/Avatar_Training.md §8).
// Não existe aqui um segundo motor de tutoria: reutiliza AiProvidersService
// (fornecedor, chaves só no servidor), AiTutorService.getSettings (limites,
// temperatura, idioma, citação de fontes) e as tabelas AiTutorSession/AiMessage
// (único local do texto da conversa). O Avatar Training guarda apenas eventos
// de referência em AvatarTrainingInteraction, sem duplicar a transcrição.
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/decorators';
import { assertCanAccess } from '../common/authz/ownership';
import { AiProvidersService } from '../ai-tutor/ai-providers.service';
import { AiTutorService } from '../ai-tutor/ai-tutor.service';
import { AUTHORIZED_DOC_CATEGORIES, AiKnowledgeService } from '../ai-tutor/ai-knowledge.service';
import { AskTutorDto, TutorRequestMode } from './dto/avatar-training.dto';
import { StoredStep, parseJson, parseSteps } from './avatar-training.helpers';

/** Versão do prompt — registada em cada resposta para permitir auditoria. */
export const TUTOR_PROMPT_VERSION = 'avatar-tutor-v1';

const TUTOR_TIMEOUT_MS = 25_000;
const MAX_REQUESTS_PER_ATTEMPT = 40;
const MAX_REQUESTS_PER_MINUTE = 5;
const MAX_EXCERPTS = 3;
const HISTORY_TURNS = 6;
const TAG = '"channel":"AI_TUTOR"';

export type TutorStatus = 'OK' | 'NO_SOURCE' | 'UNAVAILABLE' | 'LIMIT_REACHED' | 'ESCALATED';

interface Excerpt {
  type: 'STEP' | 'COURSE' | 'LESSON' | 'DOCUMENT' | 'LIBRARY_ITEM';
  id: string;
  title: string;
  snippet: string;
}

@Injectable()
export class AvatarTrainingAiTutorService {
  private readonly logger = new Logger(AvatarTrainingAiTutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly providers: AiProvidersService,
    private readonly aiTutor: AiTutorService,
    private readonly knowledge: AiKnowledgeService,
  ) {}

  // ── Estado (sem segredos) ──────────────────────────────────────────────────

  async status() {
    const info = this.providers.getProviderInfo();
    const settings = await this.aiTutor.getSettings();
    return {
      provider: info.provider,
      model: info.model,
      promptVersion: TUTOR_PROMPT_VERSION,
      dailyMessageLimit: settings.dailyMessageLimit,
      sourceOnly: true,
      textFallback: true,
    };
  }

  // ── Pergunta ao AI-Tutor dentro da sala ────────────────────────────────────

  async ask(user: CurrentUserData, attemptId: number, dto: AskTutorDto) {
    const mode = dto.mode ?? TutorRequestMode.ASK;
    const attempt = await this.prisma.avatarTrainingAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assignment: {
          include: {
            session: {
              include: {
                program: {
                  select: {
                    id: true,
                    title: true,
                    courseId: true,
                    avatar: { select: { language: true, knowledgeBase: true } },
                  },
                },
                avatar: { select: { language: true, knowledgeBase: true } },
                knowledgeSources: { where: { status: 'APPROVED' } },
              },
            },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');
    assertCanAccess(attempt, attempt.userId, user, []);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        attempt.status === 'PAUSED'
          ? 'A sessão está em pausa — retome primeiro'
          : 'A tentativa já não aceita interacções',
      );
    }
    const question = (dto.question ?? '').trim();
    if (mode === TutorRequestMode.ASK && !question) {
      throw new ConflictException('Indique a dúvida a esclarecer');
    }

    const session = attempt.assignment.session;
    const steps = parseSteps(session.contentConfig);
    if (dto.stepKey && !steps.some(s => s.key === dto.stepKey)) {
      throw new NotFoundException('Etapa não encontrada');
    }
    const step = steps.find(s => s.key === dto.stepKey) ?? steps[attempt.currentStep];
    const label = this.userLabel(mode, question, step);

    // Limites — falha de limite nunca bloqueia a sessão: devolve estado claro.
    const limited = await this.checkLimits(user.id, attemptId);
    if (limited) {
      return this.respond(attemptId, step?.key, label, limited, 'LIMIT_REACHED', {});
    }

    // Fontes autorizadas: conteúdo da sessão + fontes da sessão + base de conhecimento do avatar.
    const avatarSources = parseJson<{ sourceType: string; sourceId: string }[]>(
      (session.avatar ?? session.program.avatar)?.knowledgeBase,
      [],
    );
    const excerpts = await this.gatherExcerpts(
      question || step?.title || session.title,
      steps,
      step,
      [...session.knowledgeSources, ...avatarSources],
      mode !== TutorRequestMode.ASK,
    );
    if (!excerpts.length) {
      await this.escalate(attemptId, step?.key, question || label);
      return this.respond(
        attemptId,
        step?.key,
        label,
        'Não encontrei nas fontes aprovadas desta formação informação suficiente para responder com segurança. A dúvida foi encaminhada para um formador.',
        'NO_SOURCE',
        { escalated: true },
      );
    }

    const settings = await this.aiTutor.getSettings();
    const language = session.avatar?.language ?? settings.defaultLanguage;
    const system = this.buildSystemPrompt(
      session.title,
      session.objectives,
      language,
      settings.customSystemPromptAddendum,
    );
    const aiSessionId = await this.ensureAiSession(
      user.id,
      attemptId,
      attempt.assignment.enrollmentId,
      session.program.courseId,
      system,
    );
    const history = await this.history(aiSessionId);
    const userContent = this.buildUserContent(mode, question, step, excerpts);

    const started = Date.now();
    let ai: Awaited<ReturnType<AiProvidersService['chat']>>;
    try {
      ai = await this.withTimeout(
        this.providers.chat(
          system,
          [...history, { role: 'user' as const, content: userContent }],
          800,
          settings.temperature,
        ),
        TUTOR_TIMEOUT_MS,
      );
    } catch (e) {
      this.logger.warn({
        userId: user.id,
        attemptId,
        action: 'AVATAR_AI_TUTOR_CALL',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'AI-Tutor indisponível — a sessão continua por texto',
      });
      return this.respond(
        attemptId,
        step?.key,
        label,
        'O AI-Tutor está temporariamente indisponível. Pode continuar a sessão e tentar de novo mais tarde, ou pedir ajuda a um formador.',
        'UNAVAILABLE',
        {},
      );
    }
    const latencyMs = Date.now() - started;

    const parsed = this.parseMarkers(ai.text, steps, step?.key);
    const sourceRefs = excerpts.map(x => ({ type: x.type, id: x.id, title: x.title }));
    // O texto da conversa fica apenas no AI-Tutor (AiMessage).
    await this.prisma.aiMessage.create({
      data: { sessionId: aiSessionId, role: 'USER', content: userContent.slice(0, 6000) },
    });
    const saved = await this.prisma.aiMessage.create({
      data: {
        sessionId: aiSessionId,
        role: 'ASSISTANT',
        content: parsed.text,
        tokensUsed: ai.tokensUsed,
        latencyMs,
        provider: ai.provider,
        model: ai.model,
        sourcesConsulted: JSON.stringify(sourceRefs),
      },
    });

    if (parsed.escalate) await this.escalate(attemptId, step?.key, question || label);

    const status: TutorStatus = parsed.escalate ? 'ESCALATED' : 'OK';
    const result = await this.respond(attemptId, step?.key, label, parsed.text, status, {
      aiSessionId,
      aiMessageId: saved.id,
      promptVersion: TUTOR_PROMPT_VERSION,
      provider: ai.provider,
      model: ai.model,
      tokensUsed: ai.tokensUsed ?? null,
      latencyMs,
      mode,
      sources: sourceRefs,
      suggestedStepKey: parsed.suggestedStepKey ?? null,
      escalated: parsed.escalate,
    });
    await this.audit.log({
      userId: user.id,
      action: 'AI_TUTOR_REQUEST',
      entity: 'AvatarTrainingAttempt',
      entityId: attemptId,
      metadata: {
        status,
        mode,
        promptVersion: TUTOR_PROMPT_VERSION,
        provider: ai.provider,
        model: ai.model,
        tokensUsed: ai.tokensUsed ?? null,
      },
    });
    return {
      ...result,
      sources: settings.showSources ? sourceRefs : [],
      // Recomendação de reforço — nunca altera nota nem progresso.
      suggestedStepKey: parsed.suggestedStepKey ?? null,
    };
  }

  /** Transcrição da tutoria — lida do AI-Tutor (única cópia); respeita a retenção dele. */
  async transcript(user: CurrentUserData, attemptId: number) {
    const attempt = await this.prisma.avatarTrainingAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, userId: true },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');
    assertCanAccess(attempt, attempt.userId, user, []);
    const aiSessionId = await this.findAiSessionId(attemptId);
    if (!aiSessionId) return { messages: [] };
    const messages = await this.prisma.aiMessage.findMany({
      where: { sessionId: aiSessionId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, sourcesConsulted: true, createdAt: true },
    });
    return {
      messages: messages.map(m => ({
        ...m,
        sourcesConsulted: parseJson(m.sourcesConsulted, []),
      })),
    };
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async history(aiSessionId: number) {
    const rows = await this.prisma.aiMessage.findMany({
      where: { sessionId: aiSessionId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TURNS * 2,
      select: { role: true, content: true },
    });
    return rows.reverse().map(r => ({
      role: r.role === 'USER' ? ('user' as const) : ('assistant' as const),
      content: r.content,
    }));
  }

  private userLabel(mode: TutorRequestMode, question: string, step?: StoredStep): string {
    const suffix = step ? `: ${step.title}` : '';
    switch (mode) {
      case TutorRequestMode.EXPLAIN_DIFFERENTLY:
        return `Explicar de outra forma${suffix}`;
      case TutorRequestMode.EXAMPLE:
        return `Pedir exemplo${suffix}`;
      case TutorRequestMode.PRACTICE_EXERCISE:
        return `Pedir exercício de revisão${suffix}`;
      default:
        return question;
    }
  }

  private async checkLimits(userId: number, attemptId: number): Promise<string | null> {
    const base = {
      attemptId,
      metadata: { contains: TAG },
      interactionType: 'USER_MESSAGE' as const,
    };
    const [perAttempt, lastMinute, settings] = await Promise.all([
      this.prisma.avatarTrainingInteraction.count({ where: base }),
      this.prisma.avatarTrainingInteraction.count({
        where: { ...base, createdAt: { gte: new Date(Date.now() - 60_000) } },
      }),
      this.aiTutor.getSettings(),
    ]);
    if (perAttempt >= MAX_REQUESTS_PER_ATTEMPT || lastMinute >= MAX_REQUESTS_PER_MINUTE) {
      return 'Atingiu o limite de pedidos ao AI-Tutor nesta sessão. Aguarde um momento ou peça ajuda a um formador.';
    }
    if (settings.dailyMessageLimit) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const today = await this.prisma.aiMessage.count({
        where: { role: 'USER', session: { userId }, createdAt: { gte: start } },
      });
      if (today >= settings.dailyMessageLimit) {
        return `Limite diário de ${settings.dailyMessageLimit} perguntas ao AI-Tutor atingido. Tente novamente amanhã.`;
      }
    }
    return null;
  }

  /** Só conteúdo autorizado: etapas da sessão (sem gabarito) + fontes aprovadas. */
  private async gatherExcerpts(
    query: string,
    steps: StoredStep[],
    current: StoredStep | undefined,
    sources: { sourceType: string; sourceId: string }[],
    forceCurrentStep: boolean,
  ): Promise<Excerpt[]> {
    const kws = this.knowledge.extractKeywords(query);
    const scored: (Excerpt & { _s: number })[] = [];

    for (const s of steps) {
      if (!s.content) continue;
      const text = `${s.title}. ${s.content}`;
      const forced = forceCurrentStep && s.key === current?.key;
      const sc = this.knowledge.score(text, kws) + (forced ? 100 : 0);
      if (sc > 0) {
        scored.push({
          type: 'STEP',
          id: s.key,
          title: s.title,
          snippet: this.knowledge.buildSnippet(text, kws, 220),
          _s: sc,
        });
      }
    }

    const intIds = (t: string) =>
      sources
        .filter(x => x.sourceType === t)
        .map(x => Number(x.sourceId))
        .filter(n => Number.isInteger(n));
    const courseIds = intIds('COURSE');
    const lessonIds = intIds('LESSON');
    const docIds = intIds('DOCUMENT');
    const libraryIds = sources.filter(x => x.sourceType === 'LIBRARY_ITEM').map(x => x.sourceId);

    const [courses, lessons, docs, library] = await Promise.all([
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds }, status: 'PUBLISHED' },
            select: { id: true, title: true, description: true },
          })
        : [],
      lessonIds.length
        ? this.prisma.lesson.findMany({
            where: { id: { in: lessonIds }, status: 'PUBLISHED' },
            select: { id: true, title: true, textContent: true },
          })
        : [],
      docIds.length
        ? this.prisma.document.findMany({
            where: {
              id: { in: docIds },
              status: 'ACTIVE',
              deletedAt: null,
              sensitivity: { in: ['PUBLIC', 'INTERNAL'] },
              category: { in: [...AUTHORIZED_DOC_CATEGORIES] },
            },
            select: { id: true, title: true, description: true, ocrText: true },
          })
        : [],
      libraryIds.length
        ? this.prisma.libraryItem.findMany({
            where: { id: { in: libraryIds }, isApproved: true, deletedAt: null },
            select: { id: true, title: true, description: true },
          })
        : [],
    ]);

    const push = (type: Excerpt['type'], id: string | number, title: string, body: string) => {
      const sc = this.knowledge.score(`${title}. ${body}`, kws);
      if (sc > 0) {
        scored.push({
          type,
          id: String(id),
          title,
          snippet: this.knowledge.buildSnippet(body || title, kws, 220),
          _s: sc,
        });
      }
    };
    courses.forEach(c => push('COURSE', c.id, c.title, c.description ?? ''));
    lessons.forEach(l => push('LESSON', l.id, l.title, l.textContent ?? ''));
    docs.forEach(d => push('DOCUMENT', d.id, d.title, d.ocrText ?? d.description ?? ''));
    library.forEach(i => push('LIBRARY_ITEM', i.id, i.title, i.description ?? ''));

    return scored
      .sort((a, b) => b._s - a._s)
      .slice(0, MAX_EXCERPTS)
      .map(({ _s, ...rest }) => rest);
  }

  private buildSystemPrompt(
    title: string,
    objectives: string[],
    language: string,
    addendum: string | null,
  ): string {
    return [
      `[${TUTOR_PROMPT_VERSION}] És o AI-Tutor que apoia um instrutor virtual numa sessão de formação INNOVA: "${title}".`,
      objectives.length ? `Objectivos de aprendizagem: ${objectives.join('; ')}.` : '',
      `Responde em ${language}, de forma clara, curta e didáctica.`,
      'Usa EXCLUSIVAMENTE as fontes fornecidas em cada pedido e cita-as como "Fonte: <título>".',
      'Se as fontes não chegarem, diz que não tens informação suficiente e termina com a linha [[ENCAMINHAR]].',
      'Nunca contradigas procedimentos aprovados nem apresentes opinião própria como política oficial.',
      'Nunca reveles respostas correctas de perguntas de avaliação; explica apenas o conceito.',
      'Não alteres nem comentes notas formais. Se um tópico merecer reforço noutra etapa, termina com [[REFORCO:<chave-da-etapa>]].',
      'Não peças nem uses dados pessoais do formando.',
      addendum ?? '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildUserContent(
    mode: TutorRequestMode,
    question: string,
    step: StoredStep | undefined,
    excerpts: Excerpt[],
  ): string {
    const task: Record<TutorRequestMode, string> = {
      [TutorRequestMode.ASK]: `Pergunta do formando: ${question}`,
      [TutorRequestMode.EXPLAIN_DIFFERENTLY]:
        'Explica o conceito da etapa actual de outra forma, mais simples.',
      [TutorRequestMode.EXAMPLE]: 'Dá um exemplo prático do conceito da etapa actual.',
      [TutorRequestMode.PRACTICE_EXERCISE]:
        'Propõe um pequeno exercício de revisão sobre a etapa actual (sem dar a solução de imediato).',
    };
    return [
      step ? `Etapa actual: "${step.title}" (chave ${step.key}).` : '',
      task[mode],
      '[Fontes autorizadas]',
      ...excerpts.map(x => `- (${x.type}: ${x.title}) ${x.snippet}`),
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseMarkers(text: string, steps: StoredStep[], currentKey?: string) {
    let out = text;
    let escalate = false;
    let suggestedStepKey: string | undefined;
    if (/\[\[ENCAMINHAR\]\]/i.test(out)) {
      escalate = true;
      out = out.replace(/\[\[ENCAMINHAR\]\]/gi, '');
    }
    const m = /\[\[REFORCO:([^\]]+)\]\]/i.exec(out);
    if (m) {
      const key = m[1].trim();
      if (key !== currentKey && steps.some(s => s.key === key)) suggestedStepKey = key;
      out = out.replace(/\[\[REFORCO:[^\]]*\]\]/gi, '');
    }
    return { text: out.trim(), escalate, suggestedStepKey };
  }

  private async findAiSessionId(attemptId: number): Promise<number | null> {
    const last = await this.prisma.avatarTrainingInteraction.findFirst({
      where: { attemptId, metadata: { contains: '"aiSessionId"' } },
      orderBy: { sequence: 'desc' },
      select: { metadata: true },
    });
    const id = parseJson<{ aiSessionId?: number }>(last?.metadata, {}).aiSessionId;
    return typeof id === 'number' ? id : null;
  }

  private async ensureAiSession(
    userId: number,
    attemptId: number,
    enrollmentId: number | null,
    courseId: number | null,
    system: string,
  ): Promise<number> {
    const existing = await this.findAiSessionId(attemptId);
    if (existing) {
      const alive = await this.prisma.aiTutorSession.findFirst({
        where: { id: existing, userId, endedAt: null },
        select: { id: true },
      });
      if (alive) return alive.id;
    }
    const created = await this.prisma.aiTutorSession.create({
      data: {
        userId,
        courseId: courseId ?? undefined,
        enrollmentId: enrollmentId ?? undefined,
      },
    });
    await this.prisma.aiMessage.create({
      data: { sessionId: created.id, role: 'SYSTEM', content: system },
    });
    return created.id;
  }

  /** Eventos de referência (sem a transcrição) + resposta ao cliente. */
  private async respond(
    attemptId: number,
    stepKey: string | undefined,
    question: string,
    message: string,
    status: TutorStatus,
    meta: Record<string, unknown>,
  ) {
    await this.prisma.$transaction(async tx => {
      const last = await tx.avatarTrainingInteraction.aggregate({
        where: { attemptId },
        _max: { sequence: true },
      });
      const seq = (last._max.sequence ?? 0) + 1;
      await tx.avatarTrainingInteraction.createMany({
        data: [
          {
            attemptId,
            sequence: seq,
            interactionType: 'USER_MESSAGE',
            stepKey,
            content: 'Pedido ao AI-Tutor',
            metadata: JSON.stringify({ channel: 'AI_TUTOR' }),
          },
          {
            attemptId,
            sequence: seq + 1,
            interactionType: 'AVATAR_MESSAGE',
            stepKey,
            content: status === 'OK' ? 'Resposta do AI-Tutor' : `AI-Tutor: ${status}`,
            metadata: JSON.stringify({ channel: 'AI_TUTOR', status, ...meta }),
          },
        ],
      });
    });
    return { status, question, message };
  }

  private async escalate(attemptId: number, stepKey: string | undefined, content: string) {
    await this.prisma.$transaction(async tx => {
      const last = await tx.avatarTrainingInteraction.aggregate({
        where: { attemptId },
        _max: { sequence: true },
      });
      await tx.avatarTrainingInteraction.create({
        data: {
          attemptId,
          sequence: (last._max.sequence ?? 0) + 1,
          interactionType: 'HELP_REQUEST',
          stepKey,
          content: content.slice(0, 1000),
          metadata: JSON.stringify({ channel: 'HUMAN_TRAINER', origin: 'AI_TUTOR' }),
        },
      });
    });
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('AI-Tutor timeout')), ms);
      p.then(
        v => {
          clearTimeout(t);
          resolve(v);
        },
        e => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }
}
