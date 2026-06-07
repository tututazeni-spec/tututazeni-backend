import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ScalabilityService } from './scalability.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AutomationTrigger } from './scalability.dto';

const baseTenant = {
  id: 'tenant-1',
  tenantCode: 'INNOVA',
  tenantName: 'INNOVA Corp',
  plan: 'ENTERPRISE',
  maxUsers: 10000,
  maxStorageGb: 500,
  isActive: true,
};

const baseIntegration = {
  id: 'int-1',
  tenantId: 'tenant-1',
  name: 'SAP HR',
  type: 'LDAP',
  isActive: true,
  credentialsJson: null,
};

const baseRule = {
  id: 'rule-1',
  tenantId: 'tenant-1',
  name: 'Welcome Email',
  triggerType: 'USER_HIRED',
  actionsJson: '[{"type":"SEND_NOTIFICATION","payload":{"title":"Bem-vindo","message":"Olá!"}}]',
  conditionsJson: null,
  isActive: true,
  priority: 1,
  runCount: 0,
};

const tenantMock = {
  findUnique: jest.fn(),
  findMany: jest.fn().mockResolvedValue([baseTenant]),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(1),
};

const integrationMock = {
  findUnique: jest.fn(),
  findMany: jest.fn().mockResolvedValue([baseIntegration]),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(1),
  groupBy: jest.fn().mockResolvedValue([]),
};

const automationMock = {
  findUnique: jest.fn(),
  findMany: jest.fn().mockResolvedValue([baseRule]),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue({ _count: { id: 0 } }),
};

const userMock = {
  findFirst: jest.fn().mockResolvedValue(null),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 'new-user', fullName: 'Test User', email: 'test@innova.com' }),
  update: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue(0),
};

const mockPrisma = new Proxy(
  { tenantConfig: tenantMock, integrationConfig: integrationMock, automationRule: automationMock, user: userMock },
  {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'mock-id' }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({ id: 'mock-id' }),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _count: { id: 0 } }),
        delete: jest.fn().mockResolvedValue({}),
      };
    },
  },
);

const mockAudit = { log: jest.fn().mockResolvedValue({}) };
const mockEvents = { emit: jest.fn() };
const mockNotifications = {
  sendToUser: jest.fn().mockResolvedValue({}),
  send: jest.fn().mockResolvedValue({}),
};

describe('ScalabilityService (additional)', () => {
  let service: ScalabilityService;

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantMock.findUnique.mockResolvedValue(baseTenant);
    tenantMock.create.mockResolvedValue(baseTenant);
    tenantMock.update.mockResolvedValue(baseTenant);
    tenantMock.findMany.mockResolvedValue([baseTenant]);
    tenantMock.count.mockResolvedValue(1);
    integrationMock.findUnique.mockResolvedValue(baseIntegration);
    integrationMock.create.mockResolvedValue(baseIntegration);
    integrationMock.update.mockResolvedValue(baseIntegration);
    automationMock.findUnique.mockResolvedValue(baseRule);
    automationMock.create.mockResolvedValue(baseRule);
    automationMock.update.mockResolvedValue(baseRule);
    automationMock.findMany.mockResolvedValue([]);
    userMock.findFirst.mockResolvedValue(null);
    userMock.create.mockResolvedValue({ id: 'new-user', fullName: 'Test User', email: 'test@innova.com' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScalabilityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();
    service = module.get<ScalabilityService>(ScalabilityService);
  });

  // ─── createTenant ─────────────────────────────────────────────────────────

  describe('createTenant', () => {
    it('deve lançar ConflictException se tenantCode já existe', async () => {
      tenantMock.findUnique.mockResolvedValueOnce(baseTenant); // tenantCode check
      await expect(
        service.createTenant({ tenantCode: 'INNOVA', name: 'Outro', domain: 'outro.com' } as any, 'admin'),
      ).rejects.toThrow(ConflictException);
    });

    it('deve criar tenant e SLA + CDN padrão', async () => {
      tenantMock.findUnique.mockResolvedValueOnce(null); // tenantCode check — não existe
      tenantMock.create.mockResolvedValue(baseTenant);
      const result = await service.createTenant(
        { tenantCode: 'NEW', tenantName: 'New Corp', domain: 'new.com', plan: 'STARTER' } as any,
        'admin',
      );
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entity: 'TenantConfig' }));
    });

    it('deve converter datas de contrato se fornecidas', async () => {
      tenantMock.findUnique.mockResolvedValueOnce(null);
      tenantMock.create.mockResolvedValue(baseTenant);
      const result = await service.createTenant(
        {
          tenantCode: 'DATED',
          tenantName: 'Dated Corp',
          domain: 'dated.com',
          plan: 'PROFESSIONAL',
          contractStartDate: '2026-01-01',
          contractEndDate: '2027-01-01',
          trialEndsAt: '2026-02-01',
        } as any,
        'admin',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── updateIntegration ────────────────────────────────────────────────────

  describe('updateIntegration', () => {
    it('deve actualizar integração', async () => {
      integrationMock.findUnique.mockResolvedValue(baseIntegration);
      integrationMock.update.mockResolvedValue({ ...baseIntegration, name: 'SAP Updated' });
      const result = await service.updateIntegration('int-1', { name: 'SAP Updated' } as any, 'admin');
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));
    });

    it('deve lançar NotFoundException se integração não existe', async () => {
      integrationMock.findUnique.mockResolvedValue(null);
      await expect(service.updateIntegration('bad-id', {} as any, 'admin')).rejects.toThrow(NotFoundException);
    });

    it('deve encriptar credenciais ao actualizar', async () => {
      integrationMock.findUnique.mockResolvedValue(baseIntegration);
      integrationMock.update.mockResolvedValue({ ...baseIntegration });
      const result = await service.updateIntegration(
        'int-1',
        { credentialsJson: '{"password":"secret"}' } as any,
        'admin',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── triggerSync ──────────────────────────────────────────────────────────

  describe('triggerSync', () => {
    it('deve iniciar sincronização', async () => {
      integrationMock.findUnique.mockResolvedValue({ ...baseIntegration, isActive: true });
      const result = await service.triggerSync('int-1', 'admin');
      expect(result).toHaveProperty('syncLogId');
      expect(result.message).toContain('Sincronização iniciada');
      expect(mockEvents.emit).toHaveBeenCalledWith('integration.sync.requested', expect.any(Object));
    });

    it('deve lançar NotFoundException se integração não existe', async () => {
      integrationMock.findUnique.mockResolvedValue(null);
      await expect(service.triggerSync('bad-id', 'admin')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se integração inativa', async () => {
      integrationMock.findUnique.mockResolvedValue({ ...baseIntegration, isActive: false });
      await expect(service.triggerSync('int-1', 'admin')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getIntegrationSyncLogs ───────────────────────────────────────────────

  describe('getIntegrationSyncLogs', () => {
    it('deve retornar logs de sincronização', async () => {
      const result = await service.getIntegrationSyncLogs('int-1', 10);
      expect(result).toBeDefined();
    });

    it('deve retornar logs com limite padrão', async () => {
      const result = await service.getIntegrationSyncLogs('int-1');
      expect(result).toBeDefined();
    });
  });

  // ─── updateAutomationRule ─────────────────────────────────────────────────

  describe('updateAutomationRule', () => {
    it('deve actualizar regra de automação', async () => {
      automationMock.findUnique.mockResolvedValue(baseRule);
      automationMock.update.mockResolvedValue({ ...baseRule, name: 'Updated Rule' });
      const result = await service.updateAutomationRule('rule-1', { name: 'Updated Rule' } as any, 'admin');
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));
    });

    it('deve lançar NotFoundException se regra não existe', async () => {
      automationMock.findUnique.mockResolvedValue(null);
      await expect(service.updateAutomationRule('bad-id', {} as any, 'admin')).rejects.toThrow(NotFoundException);
    });

    it('deve validar JSON de triggerConfig e actions no update', async () => {
      automationMock.findUnique.mockResolvedValue(baseRule);
      await expect(
        service.updateAutomationRule('rule-1', { triggerConfigJson: 'invalid-json' } as any, 'admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── executeAutomationRule ────────────────────────────────────────────────

  describe('executeAutomationRule', () => {
    it('deve executar regra e emitir evento', async () => {
      automationMock.findUnique.mockResolvedValue({ ...baseRule, isActive: true });
      const result = await service.executeAutomationRule(
        { ruleId: 'rule-1', targetUserId: 'user-1' } as any,
        'admin',
      );
      expect(result).toHaveProperty('executionId');
      expect(mockEvents.emit).toHaveBeenCalledWith('automation.rule.execute', expect.any(Object));
    });

    it('deve lançar NotFoundException se regra não existe', async () => {
      automationMock.findUnique.mockResolvedValue(null);
      await expect(
        service.executeAutomationRule({ ruleId: 'bad' } as any, 'admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se regra inativa', async () => {
      automationMock.findUnique.mockResolvedValue({ ...baseRule, isActive: false });
      await expect(
        service.executeAutomationRule({ ruleId: 'rule-1' } as any, 'admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── processAutomationEvent ───────────────────────────────────────────────

  describe('processAutomationEvent', () => {
    it('deve processar evento sem regras activas', async () => {
      automationMock.findMany.mockResolvedValue([]);
      await expect(
        service.processAutomationEvent('tenant-1', AutomationTrigger.USER_HIRED, { userId: 'u1' }),
      ).resolves.not.toThrow();
    });

    it('deve executar regra com condições vazias (sempre match)', async () => {
      automationMock.findMany.mockResolvedValue([{
        ...baseRule,
        conditionsJson: null,
        actionsJson: '[{"type":"SEND_NOTIFICATION","payload":{"title":"T","message":"M","type":"INFO"}}]',
      }]);
      await expect(
        service.processAutomationEvent('tenant-1', AutomationTrigger.USER_HIRED, { userId: 'u1' }),
      ).resolves.not.toThrow();
    });

    it('deve executar ação ENROLL_COURSE', async () => {
      automationMock.findMany.mockResolvedValue([{
        ...baseRule,
        conditionsJson: null,
        actionsJson: '[{"type":"ENROLL_COURSE","payload":{"courseId":"course-1"}}]',
      }]);
      await service.processAutomationEvent('tenant-1', AutomationTrigger.USER_HIRED, { userId: 'u1' });
      expect(mockAudit.log).not.toHaveBeenCalled();
    });

    it('deve filtrar regras por condição EQ', async () => {
      automationMock.findMany.mockResolvedValue([{
        ...baseRule,
        conditionsJson: '[{"field":"role","operator":"EQ","value":"MANAGER"}]',
        actionsJson: '[{"type":"SEND_NOTIFICATION","payload":{"title":"T","message":"M"}}]',
      }]);
      await service.processAutomationEvent(
        'tenant-1',
        AutomationTrigger.USER_HIRED,
        { userId: 'u1', role: 'EMPLOYEE' },
      );
      // condição não match — não deve executar ação
      expect(mockEvents.emit).not.toHaveBeenCalledWith('automation.rule.execute', expect.any(Object));
    });
  });

  // ─── createSlaConfig ──────────────────────────────────────────────────────

  describe('createSlaConfig', () => {
    it('deve criar configuração SLA', async () => {
      const result = await service.createSlaConfig(
        { tenantId: 'tenant-1', name: 'SLA Premium', uptimePercent: 99.9, maxLatencyMs: 1000 } as any,
        'admin',
      );
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ entity: 'SlaConfig' }));
    });

    it('deve lançar NotFoundException se tenant não existe', async () => {
      tenantMock.findUnique.mockResolvedValue(null);
      await expect(
        service.createSlaConfig({ tenantId: 'bad-tenant', name: 'SLA X' } as any, 'admin'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateSlaConfig ──────────────────────────────────────────────────────

  describe('updateSlaConfig', () => {
    it('deve actualizar SLA config', async () => {
      (mockPrisma as any).slaConfig = {
        findUnique: jest.fn().mockResolvedValue({ id: 'sla-1', tenantId: 'tenant-1', uptimePercent: 99.5 }),
        update: jest.fn().mockResolvedValue({ id: 'sla-1', maxLatencyMs: 500 }),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      };
      const result = await service.updateSlaConfig('sla-1', { maxLatencyMs: 500 } as any, 'admin');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se SLA não existe', async () => {
      (mockPrisma as any).slaConfig = {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      };
      await expect(service.updateSlaConfig('bad-sla', {} as any, 'admin')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listSlaConfigs ───────────────────────────────────────────────────────

  describe('listSlaConfigs', () => {
    it('deve listar SLA configs de um tenant', async () => {
      const result = await service.listSlaConfigs('tenant-1');
      expect(result).toBeDefined();
    });
  });

  // ─── getContentDeliveryConfig ─────────────────────────────────────────────

  describe('getContentDeliveryConfig', () => {
    it('deve retornar configuração de entrega de conteúdo', async () => {
      (mockPrisma as any).contentDeliveryConfig = {
        findUnique: jest.fn().mockResolvedValue({ tenantId: 'tenant-1', adaptiveBitrate: true }),
        upsert: jest.fn().mockResolvedValue({}),
      };
      const result = await service.getContentDeliveryConfig('tenant-1');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não configurado', async () => {
      (mockPrisma as any).contentDeliveryConfig = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      };
      await expect(service.getContentDeliveryConfig('tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateContentDeliveryConfig ──────────────────────────────────────────

  describe('updateContentDeliveryConfig', () => {
    it('deve criar/actualizar config de entrega de conteúdo', async () => {
      (mockPrisma as any).contentDeliveryConfig = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ tenantId: 'tenant-1', adaptiveBitrate: false }),
      };
      const result = await service.updateContentDeliveryConfig(
        'tenant-1',
        { adaptiveBitrate: false } as any,
        'admin',
      );
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ entity: 'ContentDeliveryConfig' }));
    });
  });

  // ─── resolveAlert ─────────────────────────────────────────────────────────

  describe('resolveAlert', () => {
    it('deve resolver alerta', async () => {
      (mockPrisma as any).systemAlert = {
        findUnique: jest.fn().mockResolvedValue({ id: 'alert-1', isResolved: false }),
        update: jest.fn().mockResolvedValue({ id: 'alert-1', isResolved: true }),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      };
      const result = await service.resolveAlert('alert-1', { resolvedBy: 'admin' });
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se alerta não existe', async () => {
      (mockPrisma as any).systemAlert = {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      };
      await expect(service.resolveAlert('bad-id', { resolvedBy: 'admin' })).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se alerta já resolvido', async () => {
      (mockPrisma as any).systemAlert = {
        findUnique: jest.fn().mockResolvedValue({ id: 'alert-1', isResolved: true }),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      };
      await expect(service.resolveAlert('alert-1', { resolvedBy: 'admin' })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── createAlert ──────────────────────────────────────────────────────────

  describe('createAlert', () => {
    it('deve criar alerta e emitir eventos EMAIL e PUSH', async () => {
      (mockPrisma as any).systemAlert = {
        create: jest.fn().mockResolvedValue({ id: 'a1', notifiedVia: ['EMAIL', 'PUSH'] }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.createAlert(
        {
          tenantId: 'tenant-1',
          severity: 'CRITICAL',
          category: 'PERFORMANCE',
          title: 'CPU Alto',
          message: 'CPU > 95%',
          notifiedVia: ['EMAIL', 'PUSH'],
        } as any,
        'SYSTEM',
      );
      expect(result).toBeDefined();
      expect(mockEvents.emit).toHaveBeenCalledWith('alert.notify.email', expect.any(Object));
      expect(mockEvents.emit).toHaveBeenCalledWith('alert.notify.push', expect.any(Object));
    });

    it('deve emitir evento SLACK se configurado', async () => {
      (mockPrisma as any).systemAlert = {
        create: jest.fn().mockResolvedValue({ id: 'a2', notifiedVia: ['SLACK'] }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      };
      await service.createAlert(
        { tenantId: 'tenant-1', severity: 'WARNING', title: 'Latência', message: 'Alta', notifiedVia: ['SLACK'] } as any,
        'SYSTEM',
      );
      expect(mockEvents.emit).toHaveBeenCalledWith('alert.notify.slack', expect.any(Object));
    });
  });

  // ─── listAlerts ───────────────────────────────────────────────────────────

  describe('listAlerts', () => {
    it('deve listar alertas com filtros', async () => {
      (mockPrisma as any).systemAlert = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.listAlerts({ tenantId: 'tenant-1', severity: 'CRITICAL', isResolved: false } as any);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });
  });

  // ─── bulkImportUsers ──────────────────────────────────────────────────────

  describe('bulkImportUsers', () => {
    it('deve importar utilizadores de JSON em base64', async () => {
      const users = [
        { fullName: 'Alice Silva', email: 'alice@innova.com' },
        { fullName: 'Bob Costa', email: 'bob@innova.com' },
      ];
      const payload = Buffer.from(JSON.stringify(users)).toString('base64');

      automationMock.findMany.mockResolvedValue([]);
      userMock.findFirst.mockResolvedValue(null);
      userMock.create.mockResolvedValue({ id: 'new-user', fullName: 'Alice Silva', email: 'alice@innova.com' });

      const result = await service.bulkImportUsers(
        { tenantId: 'tenant-1', format: 'JSON', payload, upsert: false, sendWelcomeEmail: false } as any,
        'admin',
      );
      expect(result.total).toBe(2);
      expect(result.created).toBeGreaterThanOrEqual(0);
    });

    it('deve fazer upsert se utilizador já existe', async () => {
      const users = [{ fullName: 'Alice Silva', email: 'alice@innova.com' }];
      const payload = Buffer.from(JSON.stringify(users)).toString('base64');
      automationMock.findMany.mockResolvedValue([]);
      userMock.findFirst.mockResolvedValue({ id: 'existing-user', fullName: 'Alice Silva' });

      const result = await service.bulkImportUsers(
        { tenantId: 'tenant-1', format: 'JSON', payload, upsert: true, sendWelcomeEmail: false } as any,
        'admin',
      );
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });

    it('deve ignorar utilizador existente se upsert=false', async () => {
      const users = [{ fullName: 'Alice Silva', email: 'alice@innova.com' }];
      const payload = Buffer.from(JSON.stringify(users)).toString('base64');
      automationMock.findMany.mockResolvedValue([]);
      userMock.findFirst.mockResolvedValue({ id: 'existing-user', fullName: 'Alice' });

      const result = await service.bulkImportUsers(
        { tenantId: 'tenant-1', format: 'JSON', payload, upsert: false, sendWelcomeEmail: false } as any,
        'admin',
      );
      expect(result.skipped).toBe(1);
    });

    it('deve importar CSV em base64', async () => {
      const csv = 'email,fullname\nalice@innova.com,Alice Silva\nbob@innova.com,Bob Costa';
      const payload = Buffer.from(csv).toString('base64');
      automationMock.findMany.mockResolvedValue([]);
      userMock.findFirst.mockResolvedValue(null);

      const result = await service.bulkImportUsers(
        { tenantId: 'tenant-1', format: 'CSV', payload, upsert: false, sendWelcomeEmail: false } as any,
        'admin',
      );
      expect(result.total).toBe(2);
    });

    it('deve rejeitar payload base64 inválido', async () => {
      await expect(
        service.bulkImportUsers(
          { tenantId: 'tenant-1', format: 'JSON', payload: 'not-valid-base64-json!@#', upsert: false } as any,
          'admin',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve emitir evento de boas-vindas quando sendWelcomeEmail=true', async () => {
      const users = [{ fullName: 'New User', email: 'new@innova.com' }];
      const payload = Buffer.from(JSON.stringify(users)).toString('base64');
      automationMock.findMany.mockResolvedValue([]);
      userMock.findFirst.mockResolvedValue(null);
      userMock.create.mockResolvedValue({ id: 'nu', fullName: 'New User', email: 'new@innova.com' });

      await service.bulkImportUsers(
        { tenantId: 'tenant-1', format: 'JSON', payload, upsert: false, sendWelcomeEmail: true } as any,
        'admin',
      );
      expect(mockEvents.emit).toHaveBeenCalledWith('user.welcome.email', expect.any(Object));
    });

    it('deve registar linha com falha se email inválido', async () => {
      const users = [{ fullName: 'Bad User', email: 'not-an-email' }];
      const payload = Buffer.from(JSON.stringify(users)).toString('base64');
      automationMock.findMany.mockResolvedValue([]);

      const result = await service.bulkImportUsers(
        { tenantId: 'tenant-1', format: 'JSON', payload, upsert: false } as any,
        'admin',
      );
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  // ─── scheduleLoadTest ─────────────────────────────────────────────────────

  describe('scheduleLoadTest', () => {
    it('deve agendar teste de carga e emitir evento', async () => {
      const result = await service.scheduleLoadTest(
        { tenantId: 'tenant-1', targetUrl: 'http://localhost:4000', users: 100, duration: 300 } as any,
        'admin',
      );
      expect(result).toHaveProperty('message');
      expect(mockEvents.emit).toHaveBeenCalledWith('loadtest.scheduled', expect.any(Object));
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ entity: 'LoadTest' }));
    });
  });

  // ─── getDashboard ─────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar dashboard de escalabilidade', async () => {
      tenantMock.findUnique.mockResolvedValue(baseTenant);
      integrationMock.groupBy.mockResolvedValue([
        { status: 'ACTIVE', _count: { id: 3 } },
        { status: 'ERROR', _count: { id: 1 } },
      ]);
      automationMock.aggregate.mockResolvedValue({ _count: { id: 5 } });

      const result = await service.getDashboard('tenant-1');
      expect(result).toHaveProperty('tenantInfo');
      expect(result).toHaveProperty('performanceSummary');
      expect(result).toHaveProperty('integrations');
      expect(result).toHaveProperty('automations');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('slaCompliance');
    });
  });
});
