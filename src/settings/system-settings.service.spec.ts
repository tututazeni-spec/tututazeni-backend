import { BadRequestException } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { DEFAULT_SYSTEM_SETTINGS } from './system-settings';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { getDatabaseSizeBytes } from '../common/helpers/db-size';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));
jest.mock('../common/helpers/db-size', () => ({ getDatabaseSizeBytes: jest.fn() }));

const audit = writeChainedAuditLog as jest.Mock;
const dbSize = getDatabaseSizeBytes as jest.Mock;

const makeQueue = () => ({
  getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, failed: 2 }),
  isPaused: jest.fn().mockResolvedValue(false),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  clean: jest.fn().mockResolvedValue([]),
  getFailed: jest.fn().mockResolvedValue([]),
});

describe('SystemSettingsService', () => {
  let prisma: any;
  let queues: Record<
    'audit' | 'email' | 'notifications' | 'webhooks',
    ReturnType<typeof makeQueue>
  >;
  let redis: Record<string, jest.Mock>;
  let service: SystemSettingsService;

  const build = (withRedis = true) => {
    service = new SystemSettingsService(
      prisma,
      queues.audit as never,
      queues.email as never,
      queues.notifications as never,
      queues.webhooks as never,
      (withRedis ? redis : undefined) as never,
    );
  };
  const stored = (json: object | null) =>
    prisma.tenantConfig.findUnique.mockResolvedValue({
      systemSettingsJson: json ? JSON.stringify(json) : null,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    queues = {
      audit: makeQueue(),
      email: makeQueue(),
      notifications: makeQueue(),
      webhooks: makeQueue(),
    };
    redis = {
      scan: jest.fn().mockResolvedValue(['0', []]),
      del: jest.fn().mockResolvedValue(0),
      info: jest.fn().mockResolvedValue('used_memory:10485760\r\n'),
      dbsize: jest.fn().mockResolvedValue(42),
      flushdb: jest.fn(),
      flushall: jest.fn(),
      keys: jest.fn(),
    };
    dbSize.mockResolvedValue(BigInt(52_428_800));
    build();
  });

  describe('load', () => {
    it('defaults quando nada está guardado', async () => {
      await expect(service.load()).resolves.toEqual(DEFAULT_SYSTEM_SETTINGS);
    });

    it('cache de 10s (é lido em cada pedido pelo interceptor)', async () => {
      await service.load();
      await service.load();
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(1);
      const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000);
      await service.load();
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });

    it('cache expirada + pedidos concorrentes → uma só leitura (sem stampede)', async () => {
      await Promise.all(Array.from({ length: 50 }, () => service.load()));
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(1);

      const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000);
      await Promise.all(Array.from({ length: 50 }, () => service.load()));
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });

    it('leitura que começa durante a gravação do update() não repõe valores antigos na cache', async () => {
      await service.load(); // cache preenchida (defaults)
      stored({ maintenance: { enabled: true } }); // o que a BD passa a devolver após o update
      const t0 = Date.now();
      const clock = jest.spyOn(Date, 'now');

      // update(): a gravação fica pendente até a libertarmos
      let finishWrite!: () => void;
      prisma.tenantConfig.update.mockReturnValueOnce(
        new Promise<object>(res => {
          finishWrite = () => res({});
        }),
      );
      const updating = service.update({ maintenance: { enabled: true } } as never);
      await Promise.resolve();

      // Cache já expirada: este load() lê o valor ANTIGO enquanto a gravação ainda não acabou
      clock.mockReturnValue(t0 + 11_000);
      let finishRead!: (v: { systemSettingsJson: string }) => void;
      prisma.tenantConfig.findUnique.mockReturnValueOnce(
        new Promise(res => {
          finishRead = res;
        }),
      );
      const stale = service.load();

      finishWrite();
      await updating; // cache invalidada e repreenchida com o valor novo
      // A leitura antiga termina DEPOIS: sem o contador de geração sobrescreveria a cache
      finishRead({ systemSettingsJson: JSON.stringify({ maintenance: { enabled: false } }) });
      await stale;

      const reads = prisma.tenantConfig.findUnique.mock.calls.length;
      expect((await service.load()).maintenance.enabled).toBe(true);
      expect(prisma.tenantConfig.findUnique.mock.calls.length).toBe(reads); // servido da cache
      clock.mockRestore();
    });
  });

  describe('update', () => {
    const savedJson = () =>
      JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.systemSettingsJson);

    it('faz merge por secção e invalida a cache', async () => {
      stored({ pagination: { maxPageSize: 50 } });
      await service.load();
      await service.update({ maintenance: { enabled: true } } as never, 3);
      expect(savedJson()).toMatchObject({
        maintenance: { enabled: true },
        pagination: { maxPageSize: 50 },
      });
      expect(prisma.tenantConfig.findUnique.mock.calls.length).toBeGreaterThan(1);
    });

    it('um campo undefined no DTO não apaga o valor guardado (mensagem de manutenção personalizada)', async () => {
      stored({ maintenance: { enabled: false, message: 'Voltamos às 18h' } });
      await service.update({ maintenance: { enabled: true, message: undefined } } as never);
      expect(savedJson().maintenance).toEqual({ enabled: true, message: 'Voltamos às 18h' });
    });

    it('audita antes e depois com severidade HIGH', async () => {
      await service.update({ jobs: { retentionDays: 30 } } as never, 3);
      expect(audit).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ userId: 3, action: 'SETTINGS_SYSTEM_UPDATE', severity: 'HIGH' }),
      );
      const meta = JSON.parse(audit.mock.calls[0][1].metadata);
      expect(meta.before.jobs.retentionDays).toBe(7);
      expect(meta.after.jobs.retentionDays).toBe(30);
    });

    it('falha a auditar não impede a gravação', async () => {
      audit.mockRejectedValueOnce(new Error('x'));
      await expect(service.update({ jobs: { retentionDays: 3 } } as never)).resolves.toBeDefined();
      expect(prisma.tenantConfig.update).toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('devolve as quatro filas com contagens e estado de pausa', async () => {
      queues.email.isPaused.mockResolvedValue(true);
      const s = await service.status();
      expect(s.queues.map(q => q.name)).toEqual(['audit', 'email', 'notifications', 'webhooks']);
      expect(s.queues.find(q => q.name === 'email')).toMatchObject({
        paused: true,
        counts: { waiting: 1, failed: 2 },
      });
    });

    it('uma fila que não responde não derruba o painel', async () => {
      queues.audit.getJobCounts.mockRejectedValue(new Error('redis'));
      queues.audit.isPaused.mockRejectedValue(new Error('redis'));
      const s = await service.status();
      expect(s.queues[0]).toEqual({ name: 'audit', paused: false, counts: null });
    });

    it('cache: lê memória e chaves; sem Redis → desligado', async () => {
      expect((await service.status()).cache).toMatchObject({
        connected: true,
        keys: 42,
        usedMemoryMb: 10,
      });
      build(false);
      expect((await service.status()).cache).toEqual({ connected: false });
    });

    it('cache: CACHE_ENABLED=false é reportado; erro do Redis → desligado', async () => {
      process.env.CACHE_ENABLED = 'false';
      expect((await service.status()).cache).toMatchObject({ enabled: false });
      delete process.env.CACHE_ENABLED;
      redis.info.mockRejectedValue(new Error('x'));
      expect((await service.status()).cache).toEqual({ connected: false });
    });

    it('base de dados: tamanho em MB e latência; falha → desligado', async () => {
      const ok = (await service.status()).db as {
        connected: boolean;
        sizeMb: number;
        latencyMs: number;
      };
      expect(ok).toMatchObject({ connected: true, sizeMb: 50 });
      expect(ok.latencyMs).toBeGreaterThanOrEqual(0);
      dbSize.mockRejectedValue(new Error('down'));
      expect((await service.status()).db).toEqual({ connected: false });
    });

    it('inclui dados do processo', async () => {
      const p = (await service.status()).process;
      expect(p).toMatchObject({ nodeVersion: process.version });
      expect(p.memoryMb).toBeGreaterThan(0);
    });
  });

  describe('flushCache', () => {
    it('namespace desconhecido → 400 e nunca toca no Redis', async () => {
      for (const ns of ['bull', '*', 'dashboard:*', '']) {
        await expect(service.flushCache(ns as never, 1)).rejects.toThrow(
          /Namespace de cache desconhecido/,
        );
      }
      expect(redis.scan).not.toHaveBeenCalled();
    });

    it('sem Redis → 400', async () => {
      build(false);
      await expect(service.flushCache('dashboard', 1)).rejects.toThrow(/indisponível/);
    });

    it('percorre o SCAN até o cursor voltar a 0 e apaga só chaves do namespace', async () => {
      redis.scan
        .mockResolvedValueOnce(['17', ['dashboard:a', 'dashboard:b']])
        .mockResolvedValueOnce(['0', ['dashboard:c']]);
      redis.del.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      await expect(service.flushCache('dashboard', 9)).resolves.toEqual({
        namespace: 'dashboard',
        removed: 3,
      });
      expect(redis.scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'dashboard:*', 'COUNT', 500);
      expect(redis.scan).toHaveBeenNthCalledWith(2, '17', 'MATCH', 'dashboard:*', 'COUNT', 500);
      expect(redis.del).toHaveBeenCalledWith('dashboard:a', 'dashboard:b');
    });

    it('lote vazio não chama DEL (DEL sem argumentos dá erro no Redis)', async () => {
      await service.flushCache('dashboard', 1);
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('nunca usa KEYS/FLUSHDB/FLUSHALL — o mesmo Redis guarda as filas Bull', async () => {
      await service.flushCache('dashboard', 1);
      expect(redis.keys).not.toHaveBeenCalled();
      expect(redis.flushdb).not.toHaveBeenCalled();
      expect(redis.flushall).not.toHaveBeenCalled();
    });

    it('audita o namespace e quantas chaves removeu', async () => {
      redis.scan.mockResolvedValue(['0', ['dashboard:x']]);
      redis.del.mockResolvedValue(1);
      await service.flushCache('dashboard', 9);
      const call = audit.mock.calls[0][1];
      expect(call).toMatchObject({
        userId: 9,
        action: 'SETTINGS_SYSTEM_CACHE_FLUSH',
        severity: 'MEDIUM',
      });
      expect(JSON.parse(call.metadata)).toEqual({ namespace: 'dashboard', removed: 1 });
    });
  });

  describe('filas — nome desconhecido', () => {
    // O nome vem do path do URL: `this.queues[name]` encontra propriedades herdadas de
    // Object.prototype ("constructor", "__proto__", "toString"…) e acabaria em TypeError (500).
    it.each(['nope', '', 'bull:audit', 'constructor', '__proto__', 'toString', 'hasOwnProperty'])(
      'fila %j → 400 em todas as acções',
      async name => {
        await expect(service.setQueuePaused(name, true, 1)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        await expect(service.cleanQueue(name, 1)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.retryFailed(name, 1)).rejects.toBeInstanceOf(BadRequestException);
      },
    );
  });

  describe('setQueuePaused', () => {
    it('pausa e audita como PAUSE', async () => {
      await service.setQueuePaused('email', true, 2);
      expect(queues.email.pause).toHaveBeenCalled();
      expect(queues.email.resume).not.toHaveBeenCalled();
      expect(audit.mock.calls[0][1]).toMatchObject({
        action: 'SETTINGS_SYSTEM_QUEUE_PAUSE',
        severity: 'HIGH',
      });
    });

    it('retoma e audita como RESUME; só mexe na fila indicada', async () => {
      await service.setQueuePaused('email', false, 2);
      expect(queues.email.resume).toHaveBeenCalled();
      expect(queues.audit.pause).not.toHaveBeenCalled();
      expect(audit.mock.calls[0][1].action).toBe('SETTINGS_SYSTEM_QUEUE_RESUME');
    });

    it('devolve o estado actualizado do painel', async () => {
      await expect(service.setQueuePaused('email', true, 2)).resolves.toHaveProperty('queues');
    });
  });

  describe('cleanQueue', () => {
    it('limpa concluídos e falhados mais antigos que a retenção configurada', async () => {
      stored({ jobs: { retentionDays: 3 } });
      queues.email.clean.mockResolvedValueOnce(['a', 'b']).mockResolvedValueOnce(['c']);
      const res = await service.cleanQueue('email', 1);
      const grace = 3 * 24 * 3_600_000;
      expect(queues.email.clean).toHaveBeenCalledWith(grace, 'completed');
      expect(queues.email.clean).toHaveBeenCalledWith(grace, 'failed');
      expect(res).toEqual({ queue: 'email', completed: 2, failed: 1 });
    });

    it('audita as contagens', async () => {
      await service.cleanQueue('email', 1);
      expect(audit.mock.calls[0][1].action).toBe('SETTINGS_SYSTEM_QUEUE_CLEAN');
    });
  });

  describe('retryFailed', () => {
    it('pede no máximo 100 jobs falhados e repete cada um', async () => {
      const jobs = [
        { retry: jest.fn().mockResolvedValue(undefined) },
        { retry: jest.fn().mockResolvedValue(undefined) },
      ];
      queues.email.getFailed.mockResolvedValue(jobs);
      await expect(service.retryFailed('email', 1)).resolves.toEqual({
        queue: 'email',
        retried: 2,
      });
      expect(queues.email.getFailed).toHaveBeenCalledWith(0, 99);
      jobs.forEach(j => expect(j.retry).toHaveBeenCalled());
    });

    it('um job que não pode ser repetido não impede os restantes', async () => {
      const ok = { retry: jest.fn().mockResolvedValue(undefined) };
      const bad = { retry: jest.fn().mockRejectedValue(new Error('gone')) };
      queues.email.getFailed.mockResolvedValue([bad, ok]);
      await expect(service.retryFailed('email', 1)).resolves.toMatchObject({ retried: 2 });
      expect(ok.retry).toHaveBeenCalled();
    });

    it('sem falhados → 0', async () => {
      await expect(service.retryFailed('email', 1)).resolves.toMatchObject({ retried: 0 });
    });
  });
});
