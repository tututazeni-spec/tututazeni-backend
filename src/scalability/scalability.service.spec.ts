import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ScalabilityService } from './scalability.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const tenantMock = {
  findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0),
};
const integrationMock = {
  findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0),
};
const automationMock = {
  findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(), update: jest.fn(),
};

const mockPrisma = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'tenantConfig') return tenantMock;
    if (prop === 'integrationConfig') return integrationMock;
    if (prop === 'automationRule') return automationMock;
    return { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0), findUnique: jest.fn() };
  },
});

const baseTenant = { id: 'tenant-1', name: 'INNOVA', domain: 'innova.com', active: true };

describe('ScalabilityService', () => {
  let service: ScalabilityService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScalabilityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: { send: jest.fn().mockResolvedValue({}) } },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue({}) } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get<ScalabilityService>(ScalabilityService);
  });

  describe('createTenant', () => {
    it('deve criar tenant', async () => {
      tenantMock.create.mockResolvedValue(baseTenant);
      const result = await service.createTenant({ name: 'INNOVA', domain: 'innova.com' } as any, 'admin');
      expect(result).toBeDefined();
    });
  });

  describe('listTenants', () => {
    it('deve listar tenants', async () => {
      tenantMock.findMany.mockResolvedValue([baseTenant]);
      tenantMock.count.mockResolvedValue(1);
      const result = await service.listTenants({});
      expect(result).toBeDefined();
    });
  });

  describe('findTenantOrFail', () => {
    it('deve lançar NotFoundException se não encontrado', async () => {
      tenantMock.findUnique.mockResolvedValue(null);
      await expect(service.findTenantOrFail('invalid')).rejects.toThrow(NotFoundException);
    });
  });
});
