import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiProvidersService } from './ai-providers.service';
import { StartAiSessionDto, SendAiMessageDto, AiSessionFilterDto } from './ai-tutor.dto';
 
@Injectable()
export class AiTutorService {
  constructor(
    private prisma: PrismaService,
    private aiProviders: AiProvidersService,
  ) {}
 
  async startSession(userId: number, dto: StartAiSessionDto) {
    let courseContext = '';
    let courseTitle = '';
    if (dto.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: dto.courseId },
        include: {
          modules: { include: { lessons: true }, orderBy: { seq: 'asc' } },
        },
      });
      if (course) {
        courseTitle = course.title;
        const mods = course.modules.map((m: any) => m.title).join(', ');
        courseContext = `Curso: "${course.title}". ${course.description ?? ''}. Módulos: ${mods}.`;
      }
    }
    const session = await this.prisma.aiTutorSession.create({
      data: { userId, courseId: dto.courseId, enrollmentId: dto.enrollmentId },
    });
    const systemPrompt = this.buildSystemPrompt(courseContext);
    await this.prisma.aiMessage.create({
      data: { sessionId: session.id, role: 'SYSTEM', content: systemPrompt },
    });
    const providerInfo = this.aiProviders.getProviderInfo();
    const greetCourse = courseTitle
      ? `Estou aqui para ajudar com "${courseTitle}".`
      : 'Como posso ajudar?';
    return {
      session,
      courseTitle,
      systemContext: courseContext,
      provider: providerInfo,
      greeting:
        `Olá! Sou o teu Tutor IA via ${providerInfo.provider} (gratuito). `
        + `${greetCourse} Faz a tua pergunta!`,
    };
  }
 
  async sendMessage(userId: number, dto: SendAiMessageDto) {
    const session = await this.prisma.aiTutorSession.findFirst({
      where: { id: dto.sessionId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.endedAt) throw new BadRequestException('Esta sessão já foi encerrada');
    if (!dto.message?.trim()) throw new BadRequestException('Mensagem não pode estar vazia');
    await this.prisma.aiMessage.create({
      data: { sessionId: dto.sessionId, role: 'USER', content: dto.message },
    });
    const systemMsg = session.messages.find((m: any) => m.role === 'SYSTEM');
    const history = session.messages
      .filter((m: any) => m.role !== 'SYSTEM')
      .map((m: any) => ({
        role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));
    history.push({ role: 'user', content: dto.message });
    const aiResponse = await this.aiProviders.chat(
      systemMsg?.content ?? this.buildSystemPrompt(''),
      history,
      dto.maxTokens ?? 1024,
    );
    const saved = await this.prisma.aiMessage.create({
      data: {
        sessionId: dto.sessionId,
        role: 'ASSISTANT',
        content: aiResponse.text,
        tokensUsed: aiResponse.tokensUsed ?? 0,
      },
    });
    return {
      message: saved,
      sessionId: dto.sessionId,
      provider: aiResponse.provider,
      model: aiResponse.model,
    };
  }
 
  async endSession(userId: number, sessionId: number) {
    const session = await this.prisma.aiTutorSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return this.prisma.aiTutorSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }
 
  async getSession(userId: number, sessionId: number) {
    const session = await this.prisma.aiTutorSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          where: { role: { not: 'SYSTEM' } },
          orderBy: { createdAt: 'asc' },
        },
        course: { select: { id: true, title: true } },
      },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return session;
  }
 
  async getMySessions(userId: number, filters: AiSessionFilterDto) {
    const { page = 1, limit = 20, courseId } = filters;
    const skip = (page - 1) * limit;
    const where: any = { userId };
    if (courseId) where.courseId = courseId;
    const [data, total] = await Promise.all([
      this.prisma.aiTutorSession.findMany({
        where, skip, take: limit,
        include: {
          course: { select: { id: true, title: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.aiTutorSession.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async getUsageStats() {
    const [totalSessions, totalMessages, tokensUsed] = await Promise.all([
      this.prisma.aiTutorSession.count(),
      this.prisma.aiMessage.count({ where: { role: 'USER' } }),
      this.prisma.aiMessage.aggregate({ _sum: { tokensUsed: true } }),
    ]);
    return {
      totalSessions,
      totalMessages,
      totalTokensUsed: tokensUsed._sum.tokensUsed ?? 0,
      currentProvider: this.aiProviders.getProviderInfo(),
      cost: 'GRATUITO — sem custo de API',
    };
  }
 
  private buildSystemPrompt(courseContext: string): string {
    const lines = [
      'És um Tutor de IA especializado em aprendizagem corporativa',
      'e desenvolvimento profissional no sector bancário angolano.',
      'O teu papel é ajudar os colaboradores a compreender os conteúdos',
      'dos cursos, esclarecer dúvidas e manter a motivação.',
    ];
    const instructions = [
      '- Responde SEMPRE em português, de forma clara, didáctica e motivadora',
      '- Adapta a complexidade da resposta ao nível da pergunta',
      '- Dá exemplos práticos do contexto bancário angolano quando relevante',
      '- Encoraja com reforço positivo',
      '- Se não souberes, diz honestamente e sugere onde procurar',
      '- Respostas concisas mas completas (máximo 3-4 parágrafos)',
    ];
    const ctx = courseContext ? `\nContexto do curso actual: ${courseContext}` : '';
    return `${lines.join(' ')}${ctx}\nInstruções:\n${instructions.join('\n')}`;
  }
}
 
