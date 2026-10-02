// Voz, legendas e custos (docs/Avatar_Training.md §5, §15, §16): a sessão funciona
// sempre por texto, a síntese respeita limites por tentativa e por mês, falhas
// do fornecedor devolvem 503 com alternativa por texto e a voz nunca lê texto arbitrário.
import {
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AvatarTrainingProvidersService } from './avatar-training-providers.service';

const OWNER = { id: 1, role: { name: 'COLABORADOR' } } as any;
const STRANGER = { id: 2, role: { name: 'COLABORADOR' } } as any;
const ADMIN = { id: 3, role: { name: 'ADMIN' } } as any;

const STEPS = [
  { key: 'a', title: 'Boas-vindas', content: 'Olá. Bem-vindo à sessão.', type: 'CONTENT' },
];

function attemptFixture(over: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: 1,
    status: 'IN_PROGRESS',
    textOnly: false,
    currentStep: 0,
    assignment: {
      session: {
        title: 'Sessão X',
        contentConfig: JSON.stringify({ steps: STEPS }),
        avatar: {
          language: 'pt',
          avatarType: 'IMAGE',
          voiceConfig: JSON.stringify({ voiceId: 'voice_12345' }),
        },
      },
    },
    ...over,
  };
}

describe('AvatarTrainingProvidersService', () => {
  const prisma: any = {
    avatarTrainingProviderConfig: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    avatarTrainingAttempt: { findUnique: jest.fn(), update: jest.fn() },
    avatarTrainingInteraction: { aggregate: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    avatarTrainingUsage: { aggregate: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    aiMessage: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const audit = { log: jest.fn() };
  const realFetch = global.fetch;
  const savedEnv = { ...process.env };
  let svc: AvatarTrainingProvidersService;

  const load = (a: unknown) => prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(a);
  const usageSoFar = (units: number) =>
    prisma.avatarTrainingUsage.aggregate.mockResolvedValue({ _sum: { units, estimatedCost: 0 } });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-key';
    delete process.env.ELEVENLABS_VOICE_ID;
    prisma.avatarTrainingProviderConfig.findUnique.mockResolvedValue(null);
    prisma.avatarTrainingProviderConfig.findMany.mockResolvedValue([]);
    prisma.avatarTrainingInteraction.aggregate.mockResolvedValue({ _max: { sequence: 0 } });
    prisma.avatarTrainingUsage.create.mockResolvedValue({});
    prisma.avatarTrainingUsage.findFirst.mockResolvedValue(null);
    usageSoFar(0);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }) as any;
    svc = new AvatarTrainingProvidersService(prisma, audit as any);
  });

  afterAll(() => {
    global.fetch = realFetch;
    process.env = savedEnv;
  });

  describe('health', () => {
    it('texto está sempre disponível e não expõe segredos', async () => {
      const h = await svc.health();
      expect(h.textMode.available).toBe(true);
      expect(JSON.stringify(h)).not.toContain('test-key');
    });

    it('sem chave o ElevenLabs fica NOT_CONFIGURED', async () => {
      delete process.env.ELEVENLABS_API_KEY;
      const h = await svc.health();
      expect(h.providers.find(p => p.provider === 'ELEVENLABS')?.status).toBe('NOT_CONFIGURED');
    });

    it('configuração DISABLED desliga o ElevenLabs', async () => {
      prisma.avatarTrainingProviderConfig.findMany.mockResolvedValue([
        { provider: 'ELEVENLABS', serviceType: 'TTS', status: 'DISABLED' },
      ]);
      const h = await svc.health();
      expect(h.providers.find(p => p.provider === 'ELEVENLABS')?.status).toBe('DISABLED');
    });
  });

  describe('upsertConfig', () => {
    it('normaliza o fornecedor, só grava campos enviados e audita', async () => {
      prisma.avatarTrainingProviderConfig.upsert.mockResolvedValue({ configuration: null });
      await svc.upsertConfig(3, 'elevenlabs', 'TTS', { monthlyCostLimit: 50 } as any);
      const arg = prisma.avatarTrainingProviderConfig.upsert.mock.calls[0][0];
      expect(arg.where.provider_serviceType).toEqual({
        provider: 'ELEVENLABS',
        serviceType: 'TTS',
      });
      expect(arg.update).toEqual({ monthlyCostLimit: 50 });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ userId: 3 }));
    });
  });

  describe('setMedia', () => {
    it('outro formando recebe 404', async () => {
      load(attemptFixture());
      await expect(
        svc.setMedia(STRANGER, 10, { voiceEnabled: false } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('activar a voz exige confirmar o aviso de IA', async () => {
      load(attemptFixture());
      await expect(
        svc.setMedia(OWNER, 10, { voiceEnabled: true, acknowledgedNotice: false } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.avatarTrainingAttempt.update).not.toHaveBeenCalled();
    });

    it('desactivar a voz põe a tentativa em modo só texto', async () => {
      load(attemptFixture());
      const out = await svc.setMedia(OWNER, 10, { voiceEnabled: false } as any);
      expect(out.textOnly).toBe(true);
      expect(prisma.avatarTrainingAttempt.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { textOnly: true },
      });
    });

    it('tentativa terminada não aceita alterações', async () => {
      load(attemptFixture({ status: 'COMPLETED' }));
      await expect(svc.setMedia(OWNER, 10, { voiceEnabled: false } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('captions', () => {
    it('devolve legendas com tempos crescentes', async () => {
      load(attemptFixture());
      const out = await svc.captions(OWNER, 10, {} as any);
      expect(out.cues.length).toBeGreaterThanOrEqual(2);
      expect(out.cues[1].startMs).toBe(out.cues[0].endMs);
    });

    it('outro formando recebe 404', async () => {
      load(attemptFixture());
      await expect(svc.captions(STRANGER, 10, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ADMIN também não lê as legendas de outro (só o dono)', async () => {
      load(attemptFixture());
      await expect(svc.captions(ADMIN, 10, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resposta do AI-Tutor que não pertence à tentativa → 404', async () => {
      load(attemptFixture());
      prisma.avatarTrainingInteraction.findFirst.mockResolvedValue(null);
      await expect(svc.captions(OWNER, 10, { aiMessageId: 99 } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.aiMessage.findFirst).not.toHaveBeenCalled();
    });

    it('stepKey desconhecido → 404', async () => {
      load(attemptFixture());
      await expect(svc.captions(OWNER, 10, { stepKey: 'nope' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('synthesize', () => {
    const call = (u = OWNER) => svc.synthesize(u, 10, { stepKey: 'a' } as any);

    it('outro formando recebe 404 e não há chamada ao fornecedor', async () => {
      load(attemptFixture());
      await expect(call(STRANGER)).rejects.toBeInstanceOf(NotFoundException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('em pausa exige retomar', async () => {
      load(attemptFixture({ status: 'PAUSED' }));
      await expect(call()).rejects.toThrow(/retome/);
    });

    it('modo só texto não sintetiza', async () => {
      load(attemptFixture({ textOnly: true }));
      await expect(call()).rejects.toBeInstanceOf(ConflictException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sem chave → 503 com alternativa por texto', async () => {
      delete process.env.ELEVENLABS_API_KEY;
      load(attemptFixture());
      const err: any = await call().catch(e => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.getResponse()).toMatchObject({ code: 'VOICE_UNAVAILABLE', fallback: 'TEXT' });
    });

    it('fornecedor DISABLED → 503', async () => {
      load(attemptFixture());
      prisma.avatarTrainingProviderConfig.findUnique.mockResolvedValue({ status: 'DISABLED' });
      await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('voiceId inválido sem voz por omissão → 503', async () => {
      load(
        attemptFixture({
          assignment: {
            session: {
              contentConfig: JSON.stringify({ steps: STEPS }),
              avatar: { language: 'pt', avatarType: 'IMAGE', voiceConfig: '{"voiceId":"../x"}' },
            },
          },
        }),
      );
      await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('limite de caracteres por tentativa → 429 com fallback TEXT', async () => {
      load(attemptFixture());
      usageSoFar(15_000);
      const err: any = await call().catch(e => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(err.getResponse()).toMatchObject({ code: 'VOICE_LIMIT_REACHED', fallback: 'TEXT' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('respeita unitLimitPerAttempt configurado', async () => {
      load(attemptFixture());
      prisma.avatarTrainingProviderConfig.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        unitLimitPerAttempt: 10,
        monthlyCostLimit: null,
        costPerUnit: 0,
        configuration: null,
      });
      usageSoFar(0);
      await expect(call()).rejects.toMatchObject({ status: 429 });
    });

    it('orçamento mensal esgotado → 429', async () => {
      load(attemptFixture());
      prisma.avatarTrainingProviderConfig.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        unitLimitPerAttempt: 100_000,
        monthlyCostLimit: 1,
        costPerUnit: 0.01,
        configuration: null,
      });
      prisma.avatarTrainingUsage.aggregate
        .mockResolvedValueOnce({ _sum: { units: 0 } })
        .mockResolvedValueOnce({ _sum: { estimatedCost: 1 } });
      const err: any = await call().catch(e => e);
      expect(err.getStatus()).toBe(429);
      expect(err.getResponse().message).toMatch(/mensal/);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sucesso devolve áudio e regista o consumo e o custo estimado', async () => {
      load(attemptFixture());
      prisma.avatarTrainingProviderConfig.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        unitLimitPerAttempt: 100_000,
        monthlyCostLimit: null,
        costPerUnit: 0.5,
        configuration: null,
      });
      const audio = await call();
      expect(Buffer.isBuffer(audio)).toBe(true);
      const usage = prisma.avatarTrainingUsage.create.mock.calls[0][0].data;
      expect(usage).toMatchObject({ attemptId: 10, success: true, provider: 'ELEVENLABS' });
      expect(usage.estimatedCost).toBe(usage.units * 0.5);
    });

    it('falha do fornecedor → 503 com fallback TEXT e incidente registado sem custo', async () => {
      load(attemptFixture());
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
      const err: any = await call().catch(e => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.getResponse()).toMatchObject({ code: 'VOICE_FAILED', fallback: 'TEXT' });
      expect(prisma.avatarTrainingUsage.create.mock.calls[0][0].data).toMatchObject({
        success: false,
        errorCode: 'PROVIDER_ERROR',
        units: 0,
        estimatedCost: 0,
      });
    });

    it('falhar a registar consumo nunca bloqueia a sessão', async () => {
      load(attemptFixture());
      prisma.avatarTrainingUsage.create.mockRejectedValue(new Error('db'));
      await expect(call()).resolves.toBeDefined();
    });
  });

  describe('usageSummary', () => {
    it('agrega custo total e custo por sessão com voz', async () => {
      prisma.avatarTrainingUsage.groupBy = jest
        .fn()
        .mockResolvedValueOnce([
          {
            provider: 'ELEVENLABS',
            serviceType: 'TTS',
            _sum: { units: 100, estimatedCost: 4 },
            _count: { _all: 2 },
            _avg: { latencyMs: 120.4 },
          },
        ])
        .mockResolvedValueOnce([
          { provider: 'ELEVENLABS', serviceType: 'TTS', errorCode: 'TIMEOUT', _count: { _all: 1 } },
        ]);
      prisma.avatarTrainingUsage.findMany = jest
        .fn()
        .mockResolvedValue([{ attemptId: 1 }, { attemptId: 2 }]);
      const s = await svc.usageSummary();
      expect(s.totalEstimatedCost).toBe(4);
      expect(s.sessionsWithVoice).toBe(2);
      expect(s.costPerSession).toBe(2);
      expect(s.byProvider[0].avgLatencyMs).toBe(120);
      expect(s.incidents[0]).toMatchObject({ errorCode: 'TIMEOUT', count: 1 });
    });

    it('sem sessões com voz o custo por sessão é null', async () => {
      prisma.avatarTrainingUsage.groupBy = jest.fn().mockResolvedValue([]);
      prisma.avatarTrainingUsage.findMany = jest.fn().mockResolvedValue([]);
      const s = await svc.usageSummary();
      expect(s.costPerSession).toBeNull();
    });
  });
});
