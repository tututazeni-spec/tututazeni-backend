// Adaptador do AI-Tutor (docs/Avatar_Training.md §8, §16): falhas do AI-Tutor
// nunca bloqueiam a sessão, só há respostas a partir de fontes autorizadas e o
// texto da conversa fica apenas no AI-Tutor (AiMessage).
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AvatarTrainingAiTutorService } from './avatar-training-ai-tutor.service';
import { TutorRequestMode } from './dto/avatar-training.dto';

const USER = { id: 1, role: { name: 'COLABORADOR' } } as any;
const STEP = {
  key: 's1',
  title: 'Prevenção de incêndios',
  type: 'CONTENT',
  content: 'O extintor de pó químico deve ser usado em incêndios eléctricos.',
};

function attempt(
  over: Record<string, unknown> = {},
  steps: unknown[] = [STEP],
  sources: unknown[] = [],
) {
  return {
    id: 10,
    userId: 1,
    status: 'IN_PROGRESS',
    currentStep: 0,
    assignment: {
      enrollmentId: 3,
      session: {
        id: 7,
        title: 'Segurança',
        objectives: ['Usar extintores'],
        contentConfig: JSON.stringify({ steps }),
        program: { id: 2, title: 'F', courseId: 5 },
        avatar: { language: 'pt' },
        knowledgeSources: sources,
      },
    },
    ...over,
  };
}

describe('AvatarTrainingAiTutorService.ask', () => {
  const tx: any = {
    avatarTrainingInteraction: {
      aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 3 } }),
      createMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma: any = {
    avatarTrainingAttempt: { findUnique: jest.fn() },
    avatarTrainingInteraction: { count: jest.fn(), findFirst: jest.fn() },
    aiMessage: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    aiTutorSession: { create: jest.fn(), findFirst: jest.fn() },
    course: { findMany: jest.fn() },
    lesson: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
    libraryItem: { findMany: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const audit = { log: jest.fn() };
  const providers = { chat: jest.fn() };
  const aiTutor = {
    getSettings: jest.fn(),
  };
  const knowledge = {
    extractKeywords: jest.fn((q: string) =>
      q
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3),
    ),
    score: jest.fn(
      (text: string, kws: string[]) => kws.filter(k => text.toLowerCase().includes(k)).length,
    ),
    buildSnippet: jest.fn((text: string) => text.slice(0, 100)),
  };
  let svc: AvatarTrainingAiTutorService;

  const ask = (dto: Record<string, unknown> = { question: 'Como usar o extintor eléctricos?' }) =>
    svc.ask(USER, 10, dto as any);
  const statuses = () =>
    tx.avatarTrainingInteraction.createMany.mock.calls
      .flatMap((c: any[]) => c[0].data)
      .map((d: any) => JSON.parse(d.metadata ?? '{}').status)
      .filter(Boolean);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(attempt());
    prisma.avatarTrainingInteraction.count.mockResolvedValue(0);
    prisma.avatarTrainingInteraction.findFirst.mockResolvedValue(null);
    prisma.aiMessage.count.mockResolvedValue(0);
    prisma.aiMessage.findMany.mockResolvedValue([]);
    prisma.aiMessage.create.mockResolvedValue({ id: 99 });
    prisma.aiTutorSession.create.mockResolvedValue({ id: 500 });
    aiTutor.getSettings.mockResolvedValue({
      dailyMessageLimit: 0,
      temperature: 0.3,
      defaultLanguage: 'pt',
      customSystemPromptAddendum: null,
      showSources: true,
    });
    providers.chat.mockResolvedValue({
      text: 'Use o extintor de pó químico.',
      provider: 'groq',
      model: 'm',
      tokensUsed: 50,
    });
    svc = new AvatarTrainingAiTutorService(
      prisma,
      audit as any,
      providers as any,
      aiTutor as any,
      knowledge as any,
    );
  });

  describe('permissões e estado', () => {
    it('tentativa de outro formando → 404 e nada é enviado ao AI', async () => {
      prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(attempt({ userId: 99 }));
      await expect(ask()).rejects.toBeInstanceOf(NotFoundException);
      expect(providers.chat).not.toHaveBeenCalled();
    });

    it('sessão em pausa → conflito', async () => {
      prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(attempt({ status: 'PAUSED' }));
      await expect(ask()).rejects.toBeInstanceOf(ConflictException);
    });

    it('modo ASK sem pergunta → conflito', async () => {
      await expect(ask({ question: '   ' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('etapa inexistente → 404', async () => {
      await expect(ask({ question: 'olá extintor', stepKey: 'nope' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('falhas do AI-Tutor não bloqueiam a sessão', () => {
    it('erro do fornecedor → UNAVAILABLE com mensagem de fallback (sem excepção)', async () => {
      providers.chat.mockRejectedValue(new Error('503 upstream'));
      const r = await ask();
      expect(r.status).toBe('UNAVAILABLE');
      expect(r.message).toMatch(/indisponível/i);
      expect(statuses()).toContain('UNAVAILABLE');
      // Sem resposta do modelo, não se grava nenhuma mensagem de USER/ASSISTANT.
      const roles = prisma.aiMessage.create.mock.calls.map((c: any[]) => c[0].data.role);
      expect(roles).not.toContain('USER');
      expect(roles).not.toContain('ASSISTANT');
    });

    it('timeout → UNAVAILABLE', async () => {
      jest.useFakeTimers();
      try {
        providers.chat.mockReturnValue(new Promise(() => undefined));
        const p = ask();
        await jest.advanceTimersByTimeAsync(26_000);
        expect((await p).status).toBe('UNAVAILABLE');
      } finally {
        jest.useRealTimers();
      }
    });

    it('limite por minuto → LIMIT_REACHED sem chamar o fornecedor', async () => {
      prisma.avatarTrainingInteraction.count.mockResolvedValue(5);
      const r = await ask();
      expect(r.status).toBe('LIMIT_REACHED');
      expect(providers.chat).not.toHaveBeenCalled();
    });

    it('limite diário do AI-Tutor → LIMIT_REACHED', async () => {
      aiTutor.getSettings.mockResolvedValue({
        dailyMessageLimit: 10,
        temperature: 0.3,
        defaultLanguage: 'pt',
        customSystemPromptAddendum: null,
        showSources: true,
      });
      prisma.aiMessage.count.mockResolvedValue(10);
      const r = await ask();
      expect(r.status).toBe('LIMIT_REACHED');
      expect(r.message).toMatch(/10/);
    });
  });

  describe('fontes autorizadas', () => {
    it('sem fonte relevante → NO_SOURCE, encaminha para formador e não chama o AI', async () => {
      const r = await ask({ question: 'Qual é a capital da Mongólia?' });
      expect(r.status).toBe('NO_SOURCE');
      expect(providers.chat).not.toHaveBeenCalled();
      const created = tx.avatarTrainingInteraction.create.mock.calls[0][0].data;
      expect(created.interactionType).toBe('HELP_REQUEST');
      expect(JSON.parse(created.metadata)).toMatchObject({ channel: 'HUMAN_TRAINER' });
    });

    it('só consulta documentos autorizados (categoria, sensibilidade, não apagados)', async () => {
      prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(
        attempt({}, [STEP], [{ sourceType: 'DOCUMENT', sourceId: '12' }]),
      );
      prisma.document.findMany.mockResolvedValue([]);
      await ask();
      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ status: 'ACTIVE', deletedAt: null });
      expect(where.sensitivity.in).toEqual(['PUBLIC', 'INTERNAL']);
      expect(where.category.in.length).toBeGreaterThan(0);
    });

    it('só lições/cursos publicados e itens aprovados da biblioteca', async () => {
      prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(
        attempt(
          {},
          [STEP],
          [
            { sourceType: 'LESSON', sourceId: '3' },
            { sourceType: 'COURSE', sourceId: '4' },
            { sourceType: 'LIBRARY_ITEM', sourceId: 'abc' },
          ],
        ),
      );
      prisma.lesson.findMany.mockResolvedValue([]);
      prisma.course.findMany.mockResolvedValue([]);
      prisma.libraryItem.findMany.mockResolvedValue([]);
      await ask();
      expect(prisma.lesson.findMany.mock.calls[0][0].where.status).toBe('PUBLISHED');
      expect(prisma.course.findMany.mock.calls[0][0].where.status).toBe('PUBLISHED');
      expect(prisma.libraryItem.findMany.mock.calls[0][0].where).toMatchObject({
        isApproved: true,
        deletedAt: null,
      });
    });
  });

  describe('resposta e privacidade', () => {
    it('resposta OK: texto só em AiMessage; a interacção guarda apenas referências', async () => {
      const r = await ask();
      expect(r.status).toBe('OK');
      expect(r.message).toBe('Use o extintor de pó químico.');
      // Texto da conversa → AiMessage (SYSTEM da sessão + USER + ASSISTANT).
      expect(prisma.aiMessage.create.mock.calls.map((c: any[]) => c[0].data.role)).toEqual([
        'SYSTEM',
        'USER',
        'ASSISTANT',
      ]);
      // Eventos de referência no Avatar Training: sem a pergunta nem a resposta.
      const rows = tx.avatarTrainingInteraction.createMany.mock.calls[0][0].data;
      expect(rows.map((x: any) => x.content)).toEqual([
        'Pedido ao AI-Tutor',
        'Resposta do AI-Tutor',
      ]);
      expect(JSON.stringify(rows)).not.toContain('extintor de pó químico');
    });

    it('envia ao modelo só contexto mínimo (etapa + excertos), nunca dados pessoais', async () => {
      await ask();
      const [system, messages] = providers.chat.mock.calls[0];
      const sent = JSON.stringify([system, messages]);
      expect(sent).not.toMatch(/@|fullName|email/i);
      expect(sent).toContain('Segurança');
    });

    it('regista versão do prompt e auditoria', async () => {
      await ask();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AI_TUTOR_REQUEST',
          metadata: expect.objectContaining({ promptVersion: 'avatar-tutor-v1', status: 'OK' }),
        }),
      );
    });

    it('showSources=false esconde as fontes ao formando', async () => {
      aiTutor.getSettings.mockResolvedValue({
        dailyMessageLimit: 0,
        temperature: 0.3,
        defaultLanguage: 'pt',
        customSystemPromptAddendum: null,
        showSources: false,
      });
      expect((await ask()).sources).toEqual([]);
    });
  });

  describe('marcadores do modelo', () => {
    it('[[ENCAMINHAR]] → ESCALATED, pedido de ajuda e marcador removido do texto', async () => {
      providers.chat.mockResolvedValue({
        text: 'Não tenho certeza. [[ENCAMINHAR]]',
        provider: 'g',
        model: 'm',
      });
      const r = await ask();
      expect(r.status).toBe('ESCALATED');
      expect(r.message).not.toContain('[[');
      expect(tx.avatarTrainingInteraction.create).toHaveBeenCalled();
    });

    it('[[REFORCO:x]] sugere a etapa mas nunca altera nota ou progresso', async () => {
      prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(
        attempt({}, [
          STEP,
          { key: 's2', title: 'Revisão extintor', type: 'CONTENT', content: 'extintor' },
        ]),
      );
      providers.chat.mockResolvedValue({
        text: 'Reveja. [[REFORCO:s2]]',
        provider: 'g',
        model: 'm',
      });
      const r = await ask();
      expect(r.suggestedStepKey).toBe('s2');
      expect(r.message).not.toContain('[[');
      expect(prisma.avatarTrainingAttempt).not.toHaveProperty('update');
    });

    it('reforço para etapa inexistente ou a actual é ignorado', async () => {
      providers.chat.mockResolvedValue({
        text: 'Ok [[REFORCO:s1]] [[REFORCO:zzz]]',
        provider: 'g',
        model: 'm',
      });
      expect((await ask()).suggestedStepKey).toBeNull();
    });
  });

  it('modos EXPLAIN_DIFFERENTLY não exigem pergunta e usam a etapa actual', async () => {
    const r = await svc.ask(USER, 10, { mode: TutorRequestMode.EXPLAIN_DIFFERENTLY } as any);
    expect(r.status).toBe('OK');
    expect(providers.chat).toHaveBeenCalled();
  });
});
