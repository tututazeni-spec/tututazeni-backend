import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApiIntegrationService } from './api-integration.service';
import { PrismaService } from '../prisma/prisma.service';

const integrationMock = {
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};

const mockPrisma: any = new Proxy(
  {
    integrationConfig: integrationMock,
    apiIntegrationLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
  {
    get(target, prop) {
      if (prop === 'db') return mockPrisma;
      return (
        (target as any)[prop] ?? {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(0),
          findUnique: jest.fn(),
        }
      );
    },
  },
);

const baseIntegration = { id: 1, name: 'LDAP', type: 'LDAP', active: true, config: {} };

describe('ApiIntegrationService', () => {
  let service: ApiIntegrationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiIntegrationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ApiIntegrationService>(ApiIntegrationService);
  });

  describe('getIntegrations', () => {
    it('deve retornar integrações', async () => {
      integrationMock.findMany.mockResolvedValue([baseIntegration]);
      const result = await service.getIntegrations();
      expect(result).toBeDefined();
    });
  });

  describe('getIntegration', () => {
    it('deve retornar integração por id', async () => {
      integrationMock.findUnique.mockResolvedValue(baseIntegration);
      const result = await service.getIntegration(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      integrationMock.findUnique.mockResolvedValue(null);
      await expect(service.getIntegration(99)).rejects.toThrow(NotFoundException);
    });
  });
});
