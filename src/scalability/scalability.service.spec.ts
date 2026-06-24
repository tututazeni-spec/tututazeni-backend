import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ScalabilityService } from './scalability.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const tenantMock = {
  findUnique: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};
const integrationMock = {
  findUnique: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};
const automationMock = {
  findUnique: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};

const mockPrisma: any = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'db') return mockPrisma;
      if (prop === 'read') return mockPrisma;
      if (prop === 'tenantConfig') return tenantMock;
      if (prop === 'integrationConfig') return integrationMock;
      if (prop === 'automationRule') return automationMock;
      return {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      };
    },
  },
);

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
      const result = await service.createTenant(
        { name: 'INNOVA', domain: 'innova.com' } as any,
        'admin',
      );
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

    it('deve retornar tenant existente', async () => {
      tenantMock.findUnique.mockResolvedValue(baseTenant);
      const result = await service.findTenantOrFail('tenant-1');
      expect(result.id).toBe('tenant-1');
    });
  });

  // ─── updateTenant ─────────────────────────────────────────────────────────

  describe('updateTenant', () => {
    it('deve actualizar tenant', async () => {
      tenantMock.findUnique.mockResolvedValue(baseTenant);
      tenantMock.update.mockResolvedValue({ ...baseTenant, name: 'Updated' });
      const result = await service.updateTenant('tenant-1', { name: 'Updated' } as any, 'admin');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      tenantMock.findUnique.mockResolvedValue(null);
      await expect(service.updateTenant('bad-id', { name: 'X' } as any, 'admin')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── createIntegration ────────────────────────────────────────────────────

  describe('createIntegration', () => {
    it('deve criar integração', async () => {
      tenantMock.findUnique.mockResolvedValue(baseTenant);
      integrationMock.create.mockResolvedValue({ id: 'int-1', name: 'SAP', active: true });
      const result = await service.createIntegration(
        { tenantId: 'tenant-1', name: 'SAP', type: 'LDAP' } as any,
        'admin',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── listIntegrations ─────────────────────────────────────────────────────

  describe('listIntegrations', () => {
    it('deve listar integrações', async () => {
      tenantMock.findUnique.mockResolvedValue(baseTenant);
      integrationMock.findMany.mockResolvedValue([]);
      integrationMock.count.mockResolvedValue(0);
      const result = await service.listIntegrations('tenant-1', {});
      expect(result).toBeDefined();
    });
  });

  // ─── createAutomationRule ─────────────────────────────────────────────────

  describe('createAutomationRule', () => {
    it('deve criar regra de automação', async () => {
      tenantMock.findUnique.mockResolvedValue(baseTenant);
      automationMock.create.mockResolvedValue({
        id: 'rule-1',
        name: 'Welcome Email',
        active: true,
      });
      const result = await service.createAutomationRule(
        {
          tenantId: 'tenant-1',
          name: 'Welcome Email',
          triggerType: 'USER_CREATED',
          triggerConfigJson: '{}',
          actionsJson: '[]',
          conditionsJson: '{}',
        } as any,
        'admin',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── listAutomationRules ──────────────────────────────────────────────────

  describe('listAutomationRules', () => {
    it('deve listar regras de automação', async () => {
      tenantMock.findUnique.mockResolvedValue(baseTenant);
      automationMock.findMany.mockResolvedValue([]);
      const result = await service.listAutomationRules('tenant-1', {});
      expect(result).toBeDefined();
    });
  });

  // ─── getMetrics ───────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('deve retornar métricas do sistema', async () => {
      const result = await service.getMetrics({ tenantId: 'tenant-1' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getRealtimeMetrics ───────────────────────────────────────────────────

  describe('getRealtimeMetrics', () => {
    it('deve retornar métricas em tempo real', async () => {
      const result = await service.getRealtimeMetrics('tenant-1');
      expect(result).toBeDefined();
    });
  });

  // ─── createAlert ──────────────────────────────────────────────────────────

  describe('createAlert', () => {
    it('deve criar alerta', async () => {
      const result = await service.createAlert(
        {
          tenantId: 'tenant-1',
          title: 'High Load',
          severity: 'CRITICAL',
          message: 'CPU > 90%',
        } as any,
        'admin',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── listAlerts ───────────────────────────────────────────────────────────

  describe('listAlerts', () => {
    it('deve listar alertas', async () => {
      const result = await service.listAlerts({ page: 1, limit: 20 } as any);
      expect(result).toBeDefined();
    });
  });
});
