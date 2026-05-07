// src/ai-tutor/ai-tutor.service.ts
import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService }      from '../prisma/prisma.service';
import { AiProvidersService } from './ai-providers.service';
import {
  StartAiSessionDto, SendAiMessageDto, AiSessionFilterDto,
  RateMessageDto, ExecuteAgentActionDto, GenerateContentDto,
  TutorPersonality, AgentAction,
} from './ai-tutor.dto';

@Injectable()
export class AiTutorService {
  private readonly logger = new Logger(AiTutorService.name);

  constructor(
    private prisma:      PrismaService,
    private aiProviders: AiProvidersService,
  ) {}

  // ─── INICIAR SESSÃO ───────────────────────────────────────────────────────

  async startSession(userId: number, dto: StartAiSessionDto) {
    // 1. Carregar perfil completo do utilizador
    const user = await this.prisma.user.findUnique({
      where:   { id: userId },
      include: {
        position:        { select: { name: true, level: true } },
        department:      { select: { name: true } },
        userCompetencies:{ include: { competency: { select: { name: true, category: true } } }, orderBy: { currentLevel: 'desc' }, take: 5 },
        points:          { select: { points: true } },
      },
    });

    // 2. Contexto do curso
    let courseContext = '';
    let courseTitle   = '';
    if (dto.courseId) {
      const course = await this.prisma.course.findUnique({
        where:   { id: dto.courseId },
        include: { modules: { include: { lessons: { select: { id: true, title: true } } }, orderBy: { seq: 'asc' } } },
      });
      if (course) {
        courseTitle   = course.title;
        const modules = (course as any).modules ?? [];
        courseContext = `Curso: "${course.title}". ${course.description ?? ''}. Módulos: ${modules.map((m: any) => `${m.title} (${m.lessons?.length ?? 0} lições)`).join(', ')}.`;
      }
    }

    // 3. Contexto do PDI
    let pdiContext = '';
    if (dto.planId) {
      const plan = await this.prisma.developmentPlan.findFirst({
        where:   { id: dto.planId, userId },
        include: { actions: { select: { title: true, status: true, type: true }, take: 5 } },
      });
      if (plan) {
        const pending = (plan.actions as any[]).filter(a => a.status !== 'COMPLETED');
        pdiContext = `PDI activo: "${(plan as any).name}". Objectivo: ${(plan as any).goal}. Acções pendentes: ${pending.map((a: any) => a.title).join(', ')}.`;
      }
    }

    // 4. Memória persistente (últimas interações resumidas)
    const memory = await this.prisma.aiTutorMemory.findUnique({ where: { userId } });

    // 5. Histórico de aprendizagem
    const recentCourses = await this.prisma.enrollment.findMany({
      where:   { userId, status: { in: ['COMPLETED', 'IN_PROGRESS'] } },
      include: { course: { select: { title: true } } },
      orderBy: { enrolledAt: 'desc' },
      take:    3,
    });

    // 6. System prompt completo e contextualizado
    const systemPrompt = this.buildSystemPrompt({
      user:         user as any,
      courseContext,
      pdiContext,
      memory:       (memory as any)?.summary ?? '',
      personality:  dto.personality ?? TutorPersonality.FRIENDLY,
      recentCourses:(recentCourses as any[]).map(e => e.course?.title ?? '').filter(Boolean),
    });

    // 7. Criar sessão
    const session = await this.prisma.aiTutorSession.create({
      data: { userId, courseId: dto.courseId, enrollmentId: dto.enrollmentId },
    });

    await this.prisma.aiMessage.create({
      data: { sessionId: session.id, role: 'SYSTEM', content: systemPrompt },
    });

    // 8. XP por iniciar sessão com tutor
    await this.prisma.userPoints.upsert({
      where:  { userId },
      create: { userId, points: 2 },
      update: { points: { increment: 2 } },
    }).catch(() => {});

    const providerInfo = this.aiProviders.getProviderInfo();
    const userName     = (user as any)?.fullName?.split(' ')[0] ?? 'colega';

    return {
      session,
      courseTitle,
      provider: providerInfo,
      greeting: `Olá ${userName}! Sou o NOVA, o teu Tutor IA 🤖${courseTitle ? ` — estou contextualizado com o curso "${courseTitle}"` : ''}. Como posso ajudar-te hoje?`,
      quickActions: this.getQuickActions(!!dto.courseId, !!dto.planId),
    };
  }

  // ─── ENVIAR MENSAGEM ──────────────────────────────────────────────────────

  async sendMessage(userId: number, dto: SendAiMessageDto) {
    const session = await this.prisma.aiTutorSession.findFirst({
      where:   { id: dto.sessionId, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session)      throw new NotFoundException('Sessão não encontrada');
    if (session.endedAt) throw new BadRequestException('Esta sessão já foi encerrada');
    if (!dto.message?.trim()) throw new BadRequestException('Mensagem vazia');

    const start = Date.now();

    // Guardar mensagem do utilizador
    await this.prisma.aiMessage.create({
      data: { sessionId: dto.sessionId, role: 'USER', content: dto.message },
    });

    // Construir histórico de conversa (excluindo SYSTEM)
    const systemMsg = session.messages.find(m => m.role === 'SYSTEM');
    const historyMsgs = session.messages
      .filter(m => m.role !== 'SYSTEM')
      .slice(-20) // últimas 20 mensagens para não exceder contexto
      .map(m => ({ role: m.role === 'USER' ? 'user' as const : 'assistant' as const, content: m.content }));

    // Adicionar contexto extra se fornecido
    const userContent = dto.contextHint
      ? `[Contexto: ${dto.contextHint}]\n\n${dto.message}`
      : dto.message;

    historyMsgs.push({ role: 'user', content: userContent });

    const aiResponse = await this.aiProviders.chat(
      systemMsg?.content ?? this.buildFallbackPrompt(),
      historyMsgs,
      dto.maxTokens ?? 1024,
    );

    const latency = Date.now() - start;

    const saved = await this.prisma.aiMessage.create({
      data: {
        sessionId:  dto.sessionId,
        role:       'ASSISTANT',
        content:    aiResponse.text,
        tokensUsed: aiResponse.tokensUsed,
        latencyMs:  latency,
        provider:   aiResponse.provider,
        model:      aiResponse.model,
      },
    });

    // Actualizar memória de longo prazo (a cada 10 mensagens)
    const msgCount = session.messages.filter(m => m.role === 'USER').length;
    if (msgCount > 0 && msgCount % 10 === 0) {
      this.updateMemory(userId, session.messages as any[]).catch(() => {});
    }

    // XP por mensagem
    await this.prisma.userPoints.upsert({
      where:  { userId },
      create: { userId, points: 1 },
      update: { points: { increment: 1 } },
    }).catch(() => {});

    return {
      message:   saved,
      sessionId: dto.sessionId,
      provider:  aiResponse.provider,
      model:     aiResponse.model,
      latencyMs: latency,
    };
  }

  // ─── AVALIAR RESPOSTA ─────────────────────────────────────────────────────

  async rateMessage(userId: number, dto: RateMessageDto) {
    const msg = await this.prisma.aiMessage.findFirst({
      where: { id: dto.messageId, session: { userId } },
    });
    if (!msg) throw new NotFoundException('Mensagem não encontrada');
    if (msg.role !== 'ASSISTANT') throw new BadRequestException('Só é possível avaliar respostas do tutor');

    return this.prisma.aiMessage.update({
      where: { id: dto.messageId },
      data:  { rating: dto.rating, ratingFeedback: dto.feedback },
    });
  }

  // ─── ACÇÕES AGENTIC ───────────────────────────────────────────────────────

  async executeAgentAction(userId: number, dto: ExecuteAgentActionDto) {
    if (!dto.confirmed) throw new BadRequestException('Confirmação explícita obrigatória para acções do tutor');

    const session = await this.prisma.aiTutorSession.findFirst({ where: { id: dto.sessionId, userId } });
    if (!session) throw new NotFoundException('Sessão não encontrada');

    let result: any = null;
    let description  = '';

    switch (dto.action) {
      case AgentAction.ENROLL_COURSE: {
        const { courseId } = dto.params;
        if (!courseId) throw new BadRequestException('courseId obrigatório');
        const existing = await this.prisma.enrollment.findFirst({ where: { userId, courseId } });
        if (existing) throw new BadRequestException('Já inscrito neste curso');
        result = await this.prisma.enrollment.create({
          data: { userId, courseId, status: 'NOT_STARTED', origin: 'AI_TUTOR' },
        });
        description = `Inscrito no curso ID ${courseId}`;
        break;
      }

      case AgentAction.UPDATE_PDI_ACTION: {
        const { actionId, status } = dto.params;
        if (!actionId) throw new BadRequestException('actionId obrigatório');
        const action = await this.prisma.pdiAction.findFirst({
          where: { id: actionId, plan: { userId } },
        });
        if (!action) throw new ForbiddenException('Acção PDI não pertence ao utilizador');
        result = await this.prisma.pdiAction.update({
          where: { id: actionId },
          data:  { status: status ?? 'IN_PROGRESS', progress: status === 'COMPLETED' ? 100 : 50 },
        });
        description = `Acção PDI "${action.title}" actualizada para ${status}`;
        break;
      }

      case AgentAction.NOTIFY_MANAGER: {
        const { message } = dto.params;
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { managerId: true, fullName: true } });
        if (!user?.managerId) throw new BadRequestException('Utilizador não tem gestor definido');
        result = await this.prisma.notificationLog.create({
          data: {
            userId:   user.managerId,
            type:     'AI_TUTOR_REQUEST',
            message:  message ?? `${user.fullName} solicitou atenção via AI Tutor`,
            priority: 'MEDIUM',
            category: 'LMS',
            metadata: JSON.stringify({ requestedBy: userId }),
          },
        });
        description = 'Gestor notificado';
        break;
      }

      case AgentAction.GENERATE_QUIZ:
      case AgentAction.GENERATE_SUMMARY:
      case AgentAction.GENERATE_FLASHCARDS: {
        // Delegar para generateContent
        result = await this.generateContent(userId, {
          type:     dto.action === AgentAction.GENERATE_QUIZ ? 'QUIZ' : dto.action === AgentAction.GENERATE_SUMMARY ? 'SUMMARY' : 'FLASHCARDS',
          courseId: dto.params.courseId,
          topic:    dto.params.topic,
          count:    dto.params.count,
        });
        description = `Conteúdo gerado: ${dto.action}`;
        break;
      }

      default:
        throw new BadRequestException(`Acção não suportada: ${dto.action}`);
    }

    // Log da acção agentic
    await this.prisma.aiMessage.create({
      data: {
        sessionId: dto.sessionId,
        role:      'ASSISTANT',
        content:   `✅ Acção executada: ${description}`,
        agentAction: dto.action,
      },
    });

    return { action: dto.action, description, result };
  }

  // ─── GERAR CONTEÚDO ───────────────────────────────────────────────────────

  async generateContent(userId: number, dto: GenerateContentDto) {
    let contextText = '';

    if (dto.courseId) {
      const course = await this.prisma.course.findUnique({
        where:   { id: dto.courseId },
        include: { modules: { include: { lessons: { select: { title: true, content: true } } }, take: 3 } },
      });
      if (course) {
        const lessons = (course as any).modules.flatMap((m: any) => m.lessons ?? []);
        contextText = `Curso: "${course.title}". Conteúdo: ${lessons.map((l: any) => l.title).join(', ')}.`;
        if (dto.lessonId) {
          const lesson = lessons.find((l: any) => l.id === dto.lessonId);
          if (lesson?.content) contextText += ` Lição actual: ${lesson.content.slice(0, 800)}`;
        }
      }
    } else if (dto.topic) {
      contextText = `Tema: ${dto.topic}`;
    }

    const prompts: Record<string, string> = {
      QUIZ: `Com base no seguinte conteúdo, gera ${dto.count ?? 5} questões de múltipla escolha (A/B/C/D) com a resposta correcta indicada. Formato JSON: [{"question":"...","options":["A)...","B)...","C)...","D)..."],"correct":"A","explanation":"..."}]. Conteúdo: ${contextText}`,
      FLASHCARDS: `Cria ${dto.count ?? 8} flashcards do seguinte conteúdo. Formato JSON: [{"front":"...","back":"..."}]. Conteúdo: ${contextText}`,
      SUMMARY: `Faz um resumo estruturado e didáctico do seguinte conteúdo, com pontos principais e takeaways. Máximo 400 palavras. Conteúdo: ${contextText}`,
      STUDY_PLAN: `Cria um plano de estudo semanal de 4 semanas para dominar o seguinte tema. Formato JSON: [{"week":1,"title":"...","objectives":["..."],"activities":["..."]}]. Tema: ${contextText}`,
    };

    const systemPrompt = `És um especialista em design instrucional e pedagogia corporativa. Responde SEMPRE em português e em formato JSON válido quando pedido.`;

    const response = await this.aiProviders.chat(
      systemPrompt,
      [{ role: 'user', content: prompts[dto.type] }],
      2048,
    );

    // Tentar fazer parse do JSON
    let parsed: any = null;
    try {
      const clean = response.text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = response.text; // retorna texto se não for JSON válido
    }

    return {
      type:     dto.type,
      content:  parsed,
      raw:      response.text,
      provider: response.provider,
    };
  }

  // ─── GERAÇÃO DE RECOMENDAÇÕES ─────────────────────────────────────────────

  async getRecommendations(userId: number) {
    const [user, enrollments, competencies, activePDI] = await Promise.all([
      this.prisma.user.findUnique({
        where:   { id: userId },
        include: { position: { select: { name: true, level: true } }, department: { select: { name: true } } },
      }),
      this.prisma.enrollment.findMany({
        where:   { userId, status: 'COMPLETED' },
        include: { course: { select: { category: true, title: true } } },
        orderBy: { completedAt: 'desc' },
        take:    5,
      }),
      this.prisma.userCompetency.findMany({
        where:   { userId, targetLevel: { not: null } },
        include: { competency: { select: { name: true } } },
      }),
      this.prisma.developmentPlan.findFirst({
        where: { userId, status: 'ACTIVE' },
      }),
    ]);

    const completedCategories = [...new Set(enrollments.map(e => (e.course as any)?.category).filter(Boolean))];
    const competencyGaps = competencies.filter(c => c.currentLevel < (c.targetLevel ?? 0)).map(c => (c.competency as any).name);

    // Cursos não concluídos relacionados com gaps
    const recommended = await this.prisma.course.findMany({
      where:  { status: 'PUBLISHED', category: { in: completedCategories.length > 0 ? completedCategories : undefined } },
      select: { id: true, title: true, category: true, level: true, workloadHours: true },
      take:   5,
    });

    const systemPrompt = `És um conselheiro de aprendizagem corporativa. Responde em português de forma concisa.`;
    const userPrompt   = `Utilizador: ${(user as any)?.fullName}, Cargo: ${(user as any)?.position?.name ?? 'N/A'}, Departamento: ${(user as any)?.department?.name ?? 'N/A'}.
Cursos concluídos (categorias): ${completedCategories.join(', ') || 'nenhum'}.
Gaps de competência: ${competencyGaps.join(', ') || 'nenhum identificado'}.
${activePDI ? `PDI activo: "${(activePDI as any).name}"` : ''}
Sugere 3 próximas acções de aprendizagem personalizadas, explicando brevemente o porquê de cada uma.`;

    const aiInsight = await this.aiProviders.chat(systemPrompt, [{ role: 'user', content: userPrompt }], 512);

    return {
      courses:    recommended,
      competencyGaps,
      aiInsight:  aiInsight.text,
      provider:   aiInsight.provider,
    };
  }

  // ─── SESSÃO / HISTÓRICO ───────────────────────────────────────────────────

  async endSession(userId: number, sessionId: number) {
    const session = await this.prisma.aiTutorSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return this.prisma.aiTutorSession.update({ where: { id: sessionId }, data: { endedAt: new Date() } });
  }

  async getSession(userId: number, sessionId: number) {
    const session = await this.prisma.aiTutorSession.findFirst({
      where:   { id: sessionId, userId },
      include: {
        messages: { where: { role: { not: 'SYSTEM' } }, orderBy: { createdAt: 'asc' } },
        course:   { select: { id: true, title: true } },
      },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return session;
  }

  async getMySessions(userId: number, filters: AiSessionFilterDto) {
    const { page = 1, limit = 20, courseId, activeOnly } = filters;
    const skip  = (page - 1) * limit;
    const where: any = { userId };
    if (courseId)   where.courseId = courseId;
    if (activeOnly) where.endedAt  = null;

    const [data, total] = await Promise.all([
      this.prisma.aiTutorSession.findMany({
        where, skip, take: limit,
        include: {
          course:  { select: { id: true, title: true } },
          _count:  { select: { messages: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.aiTutorSession.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── MEMÓRIA PERSISTENTE ──────────────────────────────────────────────────

  private async updateMemory(userId: number, messages: any[]) {
    const userMsgs = messages.filter(m => m.role === 'USER').slice(-6).map(m => m.content).join('\n');
    const prompt   = `Resume em 2-3 frases o que este utilizador tem perguntado e aprendido: "${userMsgs}"`;

    const res = await this.aiProviders.chat(
      'És um assistente de memória. Responde em português de forma muito concisa.',
      [{ role: 'user', content: prompt }],
      256,
    );

    await this.prisma.aiTutorMemory.upsert({
      where:  { userId },
      create: { userId, summary: res.text, updatedAt: new Date() },
      update: { summary: res.text, updatedAt: new Date() },
    });
  }

  // ─── STATS ────────────────────────────────────────────────────────────────

  async getUsageStats() {
    const [totalSessions, activeSessions, totalMessages, tokensUsed, avgRating, byProvider] = await Promise.all([
      this.prisma.aiTutorSession.count(),
      this.prisma.aiTutorSession.count({ where: { endedAt: null } }),
      this.prisma.aiMessage.count({ where: { role: 'USER' } }),
      this.prisma.aiMessage.aggregate({ _sum: { tokensUsed: true } }),
      this.prisma.aiMessage.aggregate({ where: { rating: { not: null } }, _avg: { rating: true } }),
      this.prisma.aiMessage.groupBy({ by: ['provider'], where: { provider: { not: null } }, _count: true }),
    ]);

    return {
      totalSessions, activeSessions, totalMessages,
      totalTokensUsed: tokensUsed._sum.tokensUsed ?? 0,
      avgRating:       Math.round((avgRating._avg.rating ?? 0) * 10) / 10,
      byProvider:      byProvider.map(p => ({ provider: p.provider, count: p._count })),
      currentProvider: this.aiProviders.getProviderInfo(),
      cost:            'GRATUITO — sem custo de API',
    };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private getQuickActions(hasCourse: boolean, hasPlan: boolean): Array<{ label: string; value: string }> {
    const base = [
      { label: '❓ Explicar novamente',    value: 'Podes explicar isso de outra forma, com um exemplo prático?' },
      { label: '📝 Fazer um resumo',       value: 'Faz um resumo dos pontos mais importantes até agora' },
      { label: '🎯 Próximo passo',         value: 'O que devo estudar/fazer a seguir?' },
      { label: '💡 Dar um exemplo',        value: 'Podes dar um exemplo prático e real desta matéria?' },
    ];
    if (hasCourse) base.push({ label: '📊 Gerar quiz',   value: 'Cria um quiz de 5 perguntas sobre esta matéria' });
    if (hasPlan)   base.push({ label: '🗂 Ver PDI',       value: 'Como está o progresso do meu PDI?' });
    return base;
  }

  private buildSystemPrompt(ctx: {
    user: any; courseContext: string; pdiContext: string;
    memory: string; personality: TutorPersonality; recentCourses: string[];
  }): string {
    const personas: Record<TutorPersonality, string> = {
      PROFESSIONAL: 'Tens um estilo profissional e preciso. Respostas estruturadas e formais.',
      FRIENDLY:     'Tens um estilo amigável e motivador. Usas emojis com moderação e encoraja sempre.',
      COACH:        'Tens um estilo de coaching. Fazes perguntas reflexivas e guias o utilizador a encontrar as respostas.',
      TECHNICAL:    'Tens um estilo técnico e detalhado. Vais ao fundo das questões com precisão.',
      GAMIFIED:     'Tens um estilo gamificado. Celebras conquistas, usas analogias de jogos e manténs o utilizador motivado.',
    };

    return `És o NOVA, o Tutor de IA da plataforma INNOVA — especializado em aprendizagem corporativa e desenvolvimento profissional no contexto angolano.

PERFIL DO UTILIZADOR:
- Nome: ${ctx.user?.fullName ?? 'Colaborador'}
- Cargo: ${ctx.user?.position?.name ?? 'N/A'} (Nível: ${ctx.user?.position?.level ?? 'N/A'})
- Departamento: ${ctx.user?.department?.name ?? 'N/A'}
- XP acumulado: ${ctx.user?.points?.points ?? 0} pontos
- Competências top: ${ctx.user?.userCompetencies?.map((c: any) => `${c.competency?.name} (${c.currentLevel}/5)`).join(', ') || 'nenhuma registada'}
- Cursos recentes: ${ctx.recentCourses.join(', ') || 'nenhum'}

${ctx.courseContext ? `CONTEXTO DO CURSO:\n${ctx.courseContext}\n` : ''}
${ctx.pdiContext    ? `CONTEXTO DO PDI:\n${ctx.pdiContext}\n`     : ''}
${ctx.memory        ? `MEMÓRIA (interações anteriores):\n${ctx.memory}\n` : ''}

PERSONALIDADE: ${personas[ctx.personality]}

REGRAS:
- Responde SEMPRE em português europeu/angolano, de forma clara e didáctica
- Adapta a linguagem e complexidade ao cargo e nível do utilizador
- Dá exemplos práticos do contexto bancário/empresarial angolano quando relevante
- Se não souberes, diz honestamente e sugere onde procurar
- Respostas concisas mas completas (máximo 3-4 parágrafos)
- NUNCA acedas a dados de outros utilizadores
- NUNCA executes acções sem confirmação explícita do utilizador
- Ao recomendar acções na plataforma, usa o formato: [ACÇÃO: tipo_da_acção | params]`;
  }

  private buildFallbackPrompt(): string {
    return `És o NOVA, o Tutor de IA da plataforma INNOVA. Responde em português, de forma clara e didáctica.`;
  }
}