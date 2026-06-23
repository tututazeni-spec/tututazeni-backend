import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApiIntegrationService } from './api-integration.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const baseIntegration = {
  id: 1,
  name: 'LDAP',
  type: 'LDAP',
  active: true,
  apiKey: null,
  config: {},
  baseUrl: 'https://api.example.com',
  endpoint: 'https://api.example.com',
};

const mockPrisma: any = new Proxy(
  {
    integrationConfig: {
      findMany: makeFindMany([baseIntegration]),
      findUnique: makeFind(baseIntegration),
      create: makeFind(baseIntegration),
      update: makeFind(baseIntegration),
      delete: makeFind({}),
      count: makeCount(0),
    },
    apiIntegrationLog: {
      create: makeFind({}),
      findMany: makeFindMany([]),
      findFirst: makeFind(null),
      count: makeCount(0),
    },
    auditLog: { create: makeFind({}) },
  },
  {
    get(target, prop) {
      if (prop === 'db') return mockPrisma;
      return (
        (target as any)[prop] ?? {
          findMany: makeFindMany([]),
          findFirst: makeFind(null),
          create: makeFind({}),
          update: makeFind({}),
          count: makeCount(0),
          findUnique: makeFind(null),
        }
      );
    },
  },
);

describe('ApiIntegrationService — additional coverage', () => {
  let service: ApiIntegrationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiIntegrationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ApiIntegrationService>(ApiIntegrationService);
  });

  // ─── createIntegration ────────────────────────────────────────────────────

  describe('createIntegration', () => {
    it('deve criar integração', async () => {
      (mockPrisma as any).integrationConfig.create.mockResolvedValue(baseIntegration);

      const result = await service.createIntegration({
        name: 'LDAP',
        type: 'LDAP',
        active: true,
      } as any);

      expect(result).toBeDefined();
    });
  });

  // ─── updateIntegration ────────────────────────────────────────────────────

  describe('updateIntegration', () => {
    it('deve actualizar integração', async () => {
      (mockPrisma as any).integrationConfig.findUnique.mockResolvedValue(baseIntegration);
      (mockPrisma as any).apiIntegrationLog.count.mockResolvedValue(0);
      (mockPrisma as any).integrationConfig.update.mockResolvedValue({
        ...baseIntegration,
        name: 'Updated',
      });

      const result = await service.updateIntegration(1, { name: 'Updated' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      (mockPrisma as any).integrationConfig.findUnique.mockResolvedValue(null);

      await expect(service.updateIntegration(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── toggleIntegration ────────────────────────────────────────────────────

  describe('toggleIntegration', () => {
    it('deve activar/desactivar integração', async () => {
      (mockPrisma as any).integrationConfig.findUnique.mockResolvedValue({
        ...baseIntegration,
        active: true,
      });
      (mockPrisma as any).integrationConfig.update.mockResolvedValue({
        ...baseIntegration,
        active: false,
      });

      const result = await service.toggleIntegration(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      (mockPrisma as any).integrationConfig.findUnique.mockResolvedValue(null);

      await expect(service.toggleIntegration(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteIntegration ────────────────────────────────────────────────────

  describe('deleteIntegration', () => {
    it('deve eliminar integração', async () => {
      (mockPrisma as any).integrationConfig.findUnique.mockResolvedValue(baseIntegration);
      (mockPrisma as any).apiIntegrationLog.count.mockResolvedValue(0);
      (mockPrisma as any).integrationConfig.delete.mockResolvedValue({});

      const result = await service.deleteIntegration(1);
      expect(result).toHaveProperty('message');
    });
  });

  // ─── getLogs ──────────────────────────────────────────────────────────────

  describe('getLogs', () => {
    it('deve retornar logs paginados por integração', async () => {
      (mockPrisma as any).apiIntegrationLog.findMany.mockResolvedValue([]);
      (mockPrisma as any).apiIntegrationLog.count.mockResolvedValue(0);

      const result = await service.getLogs(1, { page: 1, limit: 20 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    it('deve filtrar logs por status', async () => {
      (mockPrisma as any).apiIntegrationLog.findMany.mockResolvedValue([]);
      (mockPrisma as any).apiIntegrationLog.count.mockResolvedValue(0);

      await service.getLogs(1, { status: 'ERROR' });
      expect((mockPrisma as any).apiIntegrationLog.findMany).toHaveBeenCalled();
    });
  });

  // ─── getAllLogs ────────────────────────────────────────────────────────────

  describe('getAllLogs', () => {
    it('deve retornar todos os logs', async () => {
      (mockPrisma as any).apiIntegrationLog.findMany.mockResolvedValue([]);
      (mockPrisma as any).apiIntegrationLog.count.mockResolvedValue(0);

      const result = await service.getAllLogs();
      expect(result).toHaveProperty('data');
    });
  });

  // ─── createApiKey ─────────────────────────────────────────────────────────

  describe('createApiKey', () => {
    it('deve criar chave de API', async () => {
      const result = await service.createApiKey({ name: 'Key Teste', scopes: ['read'] } as any, 1);
      expect(result).toBeDefined();
      expect((result as any).key).toBeDefined();
    });
  });

  // ─── getWebhooks ──────────────────────────────────────────────────────────

  describe('getWebhooks', () => {
    it('deve retornar webhooks', async () => {
      const result = await service.getWebhooks();
      expect(result).toBeDefined();
    });
  });

  // ─── validateApiKey ───────────────────────────────────────────────────────

  describe('validateApiKey', () => {
    it('deve retornar null para chave inválida', async () => {
      const result = await service.validateApiKey('invalid_key');
      expect(result).toBeNull();
    });
  });
});
