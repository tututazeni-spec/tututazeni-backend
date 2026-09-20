import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringService } from './monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { AuditService } from '../common/services/audit.service';

const mockPrisma = {
  okrCycle: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  objective: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  keyResult: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  keyResultUpdate: { create: jest.fn() },
  monitoringIndicator: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  monitoringRecord: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockAudit = {
  logEntity: jest.fn((userId, action, entity, entityId, meta = {}) =>
    mockPrisma.auditLog.create({
      data: { userId, action, entity, metadata: JSON.stringify({ ...meta, entityId }) },
    }),
  ),
};

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<MonitoringService>(MonitoringService);
    jest.clearAllMocks();
  });

  // ─── INDICADORES ─────────────────────────────────────

  describe('createIndicator', () => {
    it('deve criar indicador com código', async () => {
      mockPrisma.monitoringIndicator.findUnique.mockResolvedValue(null);
      mockPrisma.monitoringIndicator.create.mockResolvedValue({
        id: 'ind-1',
        code: 'IND-001',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createIndicator({ code: 'IND-001', name: 'Taxa Conclusão' }, 1);
      expect(result.code).toBe('IND-001');
    });

    it('deve lançar ConflictException se código existe', async () => {
      mockPrisma.monitoringIndicator.findUnique.mockResolvedValue({
        id: 'ind-1',
        deletedAt: null,
      });
      await expect(service.createIndicator({ code: 'IND-001', name: 'X' }, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('addRecord', () => {
    it('deve calcular variância vs target', async () => {
      mockPrisma.monitoringIndicator.findUnique.mockResolvedValue({
        id: 'ind-1',
        target: 80,
      });
      mockPrisma.monitoringRecord.create.mockResolvedValue({
        id: 'rec-1',
        value: 90,
        variance: 10,
        variancePct: 12.5,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.addRecord('ind-1', { value: 90, period: '2026-06' }, 1);
      expect(result.variance).toBe(10);
    });
  });

  describe('findAllIndicators', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.monitoringIndicator.findMany.mockResolvedValue([{ id: 'ind-1' }]);
      mockPrisma.monitoringIndicator.count.mockResolvedValue(1);
      const result = await service.findAllIndicators({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });
  });

  describe('getDashboard', () => {
    it('deve retornar monitoring', async () => {
      mockPrisma.monitoringIndicator.count.mockResolvedValue(5);
      mockPrisma.monitoringRecord.count.mockResolvedValue(20);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('monitoring');
      expect(result.monitoring.activeIndicators).toBe(5);
    });
  });
});
