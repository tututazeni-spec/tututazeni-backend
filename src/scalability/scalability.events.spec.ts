import { Test, TestingModule } from '@nestjs/testing';
import { ScalabilityEventListeners } from './scalability.events';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityService } from './scalability.service';
import { AutomationTrigger } from './scalability.dto';

const integrationSyncLogMock = { update: jest.fn().mockResolvedValue({}) };
const integrationConfigMock = { update: jest.fn().mockResolvedValue({}) };

const mockPrisma = {};
const mockPrismaProxy = new Proxy(mockPrisma, {
  get(_target, prop) {
    if (prop === 'integrationSyncLog') return integrationSyncLogMock;
    if (prop === 'integrationConfig') return integrationConfigMock;
    return undefined;
  },
});

const mockService = {
  processAutomationEvent: jest.fn().mockResolvedValue({}),
};

describe('ScalabilityEventListeners', () => {
  let listeners: ScalabilityEventListeners;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrismaProxy, 'read', {
      get() {
        return mockPrismaProxy;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScalabilityEventListeners,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: ScalabilityService, useValue: mockService },
      ],
    }).compile();
    listeners = module.get<ScalabilityEventListeners>(ScalabilityEventListeners);
  });

  describe('onUserHired', () => {
    it('deve processar evento USER_HIRED', async () => {
      await listeners.onUserHired({ userId: '1', tenantId: 'tenant-1', departmentId: 'dept-1' });

      expect(mockService.processAutomationEvent).toHaveBeenCalledWith(
        'tenant-1',
        AutomationTrigger.USER_HIRED,
        expect.any(Object),
      );
    });
  });

  describe('onUserPromoted', () => {
    it('deve processar evento USER_PROMOTED', async () => {
      await listeners.onUserPromoted({ userId: '1', tenantId: 'tenant-1', newPositionId: 'pos-2' });

      expect(mockService.processAutomationEvent).toHaveBeenCalledWith(
        'tenant-1',
        AutomationTrigger.USER_PROMOTED,
        expect.any(Object),
      );
    });
  });

  describe('onCourseCompleted', () => {
    it('deve processar evento COURSE_COMPLETED', async () => {
      await listeners.onCourseCompleted({
        userId: '1',
        tenantId: 'tenant-1',
        courseId: 'course-1',
      });

      expect(mockService.processAutomationEvent).toHaveBeenCalledWith(
        'tenant-1',
        AutomationTrigger.COURSE_COMPLETED,
        expect.any(Object),
      );
    });
  });

  describe('onCertificateExpired', () => {
    it('deve processar evento CERTIFICATE_EXPIRED', async () => {
      await listeners.onCertificateExpired({
        userId: '1',
        tenantId: 'tenant-1',
        certificateId: 'cert-1',
      });

      expect(mockService.processAutomationEvent).toHaveBeenCalledWith(
        'tenant-1',
        AutomationTrigger.CERTIFICATE_EXPIRED,
        expect.any(Object),
      );
    });
  });

  describe('onSyncRequested', () => {
    it('deve processar sync com sucesso', async () => {
      await listeners.onSyncRequested({
        integrationId: 1,
        syncLogId: 'log-1',
        type: 'ERP_HR',
        actorId: 'user-1',
      });

      expect(integrationSyncLogMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'log-1' } }),
      );
    });

    it('deve lidar com erros de sync e actualizar log', async () => {
      // A única chamada a integrationSyncLog.update() dentro do bloco try é a
      // de sucesso — tem de ser essa a rejeitar para cair no catch (o bloco
      // try nunca chama integrationSyncLog.update() uma segunda vez).
      integrationSyncLogMock.update.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        listeners.onSyncRequested({
          integrationId: 1,
          syncLogId: 'log-1',
          type: 'ERP_HR',
          actorId: 'user-1',
        }),
      ).resolves.not.toThrow();

      // Bug de copy-paste corrigido: o bloco de catch gravava sempre
      // lastSyncStatus 'SUCCESS' — tem de reflectir a falha real.
      expect(integrationConfigMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ lastSyncStatus: 'FAILED', lastSyncError: 'DB error' }),
        }),
      );
    });
  });
});
