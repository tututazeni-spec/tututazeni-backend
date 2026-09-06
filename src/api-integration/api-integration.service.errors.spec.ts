import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ApiIntegrationService } from './api-integration.service';
import { PrismaService } from '../prisma/prisma.service';

const mockWebhooksQueue = { add: jest.fn().mockResolvedValue(undefined) };

// Nota: ApiKey e Webhook NÃO existem no schema Prisma (nunca migrados). O
// serviço usa safeM() para degradar sem erro (create() devolve os dados sem
// persistir, findMany()/findFirst() devolvem vazio/null) em vez de rebentar
// com "Cannot read property 'create' of undefined". Estes testes cobrem
// explicitamente esse fallback — sem eles, uma migração futura que quebrasse
// o fallback (ou o corrigisse incorrectamente) passaria despercebida.

function makePrismaWithoutApiKeyAndWebhook() {
  return {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    // apiKey e webhook deliberadamente ausentes (undefined)
  } as any;
}

describe('ApiIntegrationService — modelo ApiKey/Webhook ausente (fallback seguro)', () => {
  let service: ApiIntegrationService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = makePrismaWithoutApiKeyAndWebhook();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiIntegrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('webhooks'), useValue: mockWebhooksQueue },
      ],
    }).compile();
    service = module.get<ApiIntegrationService>(ApiIntegrationService);
  });

  it('createApiKey sem modelo persistido: devolve a chave em claro mas sinaliza ausência de persistência', async () => {
    const result = await service.createApiKey({ name: 'Key sem BD', scopes: ['read'] } as any, 1);
    expect(result).toHaveProperty('key');
    expect((result as any).message).toMatch(/Guarda esta chave/);
  });

  it('getApiKeys sem modelo: devolve lista vazia em vez de rebentar', async () => {
    const result = await service.getApiKeys();
    expect(result).toEqual([]);
  });

  it('validateApiKey sem modelo: devolve null (chave nunca poderia ter sido persistida)', async () => {
    const result = await service.validateApiKey('qualquer-chave');
    expect(result).toBeNull();
  });

  it('createWebhook sem modelo persistido: devolve os dados fornecidos (create() do fallback nunca lança, por isso não passa pelo .catch com a mensagem "modelo ausente")', async () => {
    const result = await service.createWebhook(
      { name: 'Hook sem BD', url: 'https://x.test/hook', events: ['user.created'] } as any,
      1,
    );
    expect((result as any).name).toBe('Hook sem BD');
    expect((result as any).secret).toBeDefined();
  });

  it('getWebhooks sem modelo: devolve lista vazia', async () => {
    const result = await service.getWebhooks();
    expect(result).toEqual([]);
  });

  it('triggerWebhook sem modelo (sem webhooks activos): 0 despachados', async () => {
    const result = await service.triggerWebhook({ event: 'user.created', payload: {} } as any);
    expect(result.dispatched).toBe(0);
  });
});

describe('ApiIntegrationService — API Key com modelo presente', () => {
  let service: ApiIntegrationService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      apiKey: {
        create: jest.fn(d => Promise.resolve({ id: 1, ...d.data })),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiIntegrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('webhooks'), useValue: mockWebhooksQueue },
      ],
    }).compile();
    service = module.get<ApiIntegrationService>(ApiIntegrationService);
  });

  it('validateApiKey rejeita chave expirada mesmo que o hash corresponda', async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: 1,
      keyHash: 'x',
      active: true,
      expiresAt: new Date(Date.now() - 1000),
      scopes: ['read'],
      name: 'Expirada',
    });

    const result = await service.validateApiKey('chave-expirada');
    expect(result).toBeNull();
  });

  it('validateApiKey aceita chave activa e sem expiração, devolvendo scopes', async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: 1,
      keyHash: 'x',
      active: true,
      expiresAt: null,
      scopes: ['read', 'write'],
      name: 'Válida',
    });

    const result = await service.validateApiKey('chave-valida');
    expect(result).toEqual({ valid: true, scopes: ['read', 'write'], name: 'Válida' });
  });

  it('revokeApiKey desactiva a chave e regista auditoria', async () => {
    await service.revokeApiKey(5, 1);
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { active: false },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'API_KEY_REVOKED' }) }),
    );
  });

  it('rotateApiKey gera novo hash e devolve a nova chave em claro', async () => {
    const result = await service.rotateApiKey(5, 1);
    expect(result).toHaveProperty('key');
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 } }),
    );
  });
});

describe('ApiIntegrationService — Webhook com modelo presente', () => {
  let service: ApiIntegrationService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      webhook: {
        create: jest.fn(d => Promise.resolve({ id: 1, ...d.data })),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiIntegrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('webhooks'), useValue: mockWebhooksQueue },
      ],
    }).compile();
    service = module.get<ApiIntegrationService>(ApiIntegrationService);
  });

  it('createWebhook usa o segredo fornecido em vez de gerar um novo', async () => {
    const result = await service.createWebhook(
      { name: 'Hook', url: 'https://x.test', events: ['x'], secret: 'meu-segredo' } as any,
      1,
    );
    expect((result as any).secret).toBe('meu-segredo');
  });

  it('triggerWebhook só despacha para subscribers do evento (ou "*")', async () => {
    mockPrisma.webhook.findMany.mockResolvedValue([
      { id: 1, url: 'https://a.test', events: ['user.created'], secret: 's', active: true },
      { id: 2, url: 'https://b.test', events: ['other.event'], secret: 's', active: true },
      { id: 3, url: 'https://c.test', events: ['*'], secret: 's', active: true },
    ]);
    jest.spyOn(service as any, 'dispatchWebhook').mockResolvedValue(undefined);

    const result = await service.triggerWebhook({ event: 'user.created', payload: {} } as any);

    expect(result.dispatched).toBe(2);
    expect(result.webhooks.map((w: any) => w.webhookId)).toEqual([1, 3]);
  });

  it('triggerWebhook sem subscribers devolve dispatched:0', async () => {
    mockPrisma.webhook.findMany.mockResolvedValue([
      { id: 1, url: 'https://a.test', events: ['other'], active: true },
    ]);
    const result = await service.triggerWebhook({ event: 'user.created', payload: {} } as any);
    expect(result.dispatched).toBe(0);
    expect(result.message).toMatch(/Sem subscribers/);
  });

  it('triggerWebhook enfileira a entrega (job "deliver") em vez de fazer fetch síncrono', async () => {
    mockWebhooksQueue.add.mockClear();
    mockPrisma.webhook.findMany.mockResolvedValue([
      {
        id: 7,
        url: 'https://hook.test/in',
        events: ['user.created'],
        secret: 'segredo',
        active: true,
        retryMax: 5,
      },
    ]);

    await service.triggerWebhook({ event: 'user.created', payload: { a: 1 } } as any);

    expect(mockWebhooksQueue.add).toHaveBeenCalledTimes(1);
    const [jobName, jobData, jobOpts] = mockWebhooksQueue.add.mock.calls[0];
    expect(jobName).toBe('deliver');
    expect(jobData).toMatchObject({
      url: 'https://hook.test/in',
      event: 'user.created',
      webhookId: 7,
    });
    expect(typeof jobData.body).toBe('string');
    expect(jobData.signature).toMatch(/^sha256=/);
    expect(jobOpts).toMatchObject({
      attempts: 6,
      backoff: { type: 'exponential', delay: 2000 },
    });
  });

  it('deleteWebhook remove e devolve mensagem de sucesso', async () => {
    const result = await service.deleteWebhook(1);
    expect(mockPrisma.webhook.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result).toHaveProperty('message');
  });
});
