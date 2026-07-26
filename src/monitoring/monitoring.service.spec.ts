import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringService } from './monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
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
  evaluationCycle: { create: jest.fn(), count: jest.fn() },
  userEvaluation: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockAudit = {
  logEntity: jest.fn((userId, action, entity, entityId, meta = {}) =>
    mockPrisma.auditLog.create({
      data: { userId, action, entity, metadata: JSON.stringify({ ...meta, entityId }) },
    }),
  ),
};

const ownerUser = { id: 1, email: 'owner@innova.com', role: { name: 'COLABORADOR' } };
const otherUser = { id: 2, email: 'other@innova.com', role: { name: 'COLABORADOR' } };
const adminUser = { id: 99, email: 'admin@innova.com', role: { name: 'ADMIN' } };

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

  // ─── OKRs ────────────────────────────────────────────

  describe('createOkrCycle', () => {
    it('deve criar ciclo OKR', async () => {
      mockPrisma.okrCycle.create.mockResolvedValue({
        id: 'cyc-1',
        name: 'Q2 2026',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createOkrCycle(
        { name: 'Q2 2026', startDate: '2026-04-01', endDate: '2026-06-30' },
        1,
      );
      expect(result.name).toBe('Q2 2026');
    });
  });

  describe('createObjective', () => {
    it('deve criar objectivo num ciclo existente', async () => {
      mockPrisma.okrCycle.findUnique.mockResolvedValue({ id: 'cyc-1' });
      mockPrisma.objective.create.mockResolvedValue({
        id: 'obj-1',
        title: 'Objectivo',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createObjective(
        { cycleId: 'cyc-1', ownerId: 1, title: 'Objectivo' },
        1,
      );
      expect(result.title).toBe('Objectivo');
    });

    it('deve lançar NotFoundException se ciclo não existe', async () => {
      mockPrisma.okrCycle.findUnique.mockResolvedValue(null);
      await expect(
        service.createObjective({ cycleId: 'x', ownerId: 1, title: 't' }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createKeyResult', () => {
    it('deve criar KR num objectivo existente', async () => {
      mockPrisma.objective.findUnique.mockResolvedValue({ id: 'obj-1' });
      mockPrisma.keyResult.create.mockResolvedValue({
        id: 'kr-1',
        title: 'KR',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createKeyResult(
        { objectiveId: 'obj-1', title: 'KR', targetValue: 80 },
        1,
      );
      expect(result.id).toBe('kr-1');
    });
  });

  describe('updateKeyResult', () => {
    it('deve calcular progresso e marcar COMPLETED', async () => {
      mockPrisma.keyResult.findUnique.mockResolvedValue({
        id: 'kr-1',
        objectiveId: 'obj-1',
        startValue: 0,
        targetValue: 100,
        currentValue: 0,
        objective: { ownerId: 1 },
      });
      mockPrisma.keyResultUpdate.create.mockResolvedValue({});
      mockPrisma.keyResult.update.mockResolvedValue({
        id: 'kr-1',
        progress: 100,
        status: 'COMPLETED',
      });
      mockPrisma.keyResult.findMany.mockResolvedValue([{ progress: 100 }]);
      mockPrisma.objective.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateKeyResult('kr-1', { newValue: 100 }, ownerUser as any);
      expect(result.progress).toBe(100);
      expect(result.status).toBe('COMPLETED');
    });

    it('deve marcar AT_RISK para progresso entre 40-70', async () => {
      mockPrisma.keyResult.findUnique.mockResolvedValue({
        id: 'kr-1',
        objectiveId: 'obj-1',
        startValue: 0,
        targetValue: 100,
        currentValue: 0,
        objective: { ownerId: 1 },
      });
      mockPrisma.keyResultUpdate.create.mockResolvedValue({});
      mockPrisma.keyResult.update.mockResolvedValue({
        id: 'kr-1',
        progress: 50,
        status: 'AT_RISK',
      });
      mockPrisma.keyResult.findMany.mockResolvedValue([{ progress: 50 }]);
      mockPrisma.objective.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateKeyResult('kr-1', { newValue: 50 }, ownerUser as any);
      expect(result.status).toBe('AT_RISK');
    });

    it('deve lançar NotFoundException se KR não existe', async () => {
      mockPrisma.keyResult.findUnique.mockResolvedValue(null);
      await expect(
        service.updateKeyResult('x', { newValue: 10 }, ownerUser as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('não permite utilizador B actualizar Key Result do Objectivo de A', async () => {
      mockPrisma.keyResult.findUnique.mockResolvedValue({
        id: 'kr-1',
        objectiveId: 'obj-1',
        startValue: 0,
        targetValue: 100,
        currentValue: 0,
        objective: { ownerId: 1 },
      });
      await expect(
        service.updateKeyResult('kr-1', { newValue: 50 }, otherUser as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.keyResult.update).not.toHaveBeenCalled();
    });

    it('permite ADMIN actualizar Key Result de qualquer Objectivo', async () => {
      mockPrisma.keyResult.findUnique.mockResolvedValue({
        id: 'kr-1',
        objectiveId: 'obj-1',
        startValue: 0,
        targetValue: 100,
        currentValue: 0,
        objective: { ownerId: 1 },
      });
      mockPrisma.keyResultUpdate.create.mockResolvedValue({});
      mockPrisma.keyResult.update.mockResolvedValue({
        id: 'kr-1',
        progress: 50,
        status: 'AT_RISK',
      });
      mockPrisma.keyResult.findMany.mockResolvedValue([{ progress: 50 }]);
      mockPrisma.objective.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateKeyResult('kr-1', { newValue: 50 }, adminUser as any);
      expect(result).toBeDefined();
    });
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
      const result = await service.findAllIndicators(1, 20);
      expect(result.total).toBe(1);
    });
  });

  // ─── AVALIAÇÃO ───────────────────────────────────────

  describe('assignEvaluation', () => {
    it('deve atribuir avaliação e notificar', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue(null);
      mockPrisma.userEvaluation.create.mockResolvedValue({ id: 'ev-1' });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.assignEvaluation('cyc-1', 2, 3, 'MANAGER', 1);
      expect(result.id).toBe('ev-1');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'EVALUATION_ASSIGNED' }),
        }),
      );
    });

    it('deve lançar ConflictException se já atribuída', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue({ id: 'ev-1' });
      await expect(service.assignEvaluation('cyc-1', 2, 3, 'MANAGER', 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('submitEvaluation', () => {
    it('deve permitir ao avaliador (evaluatorId) submeter avaliação MANAGER e fechar', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        type: 'MANAGER',
        userId: 2,
        evaluatorId: 3,
      });
      mockPrisma.userEvaluation.update.mockResolvedValue({
        id: 'ev-1',
        status: 'CLOSED',
        finalScore: 85,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const evaluatorUser = { id: 3, email: 'eval@innova.com', role: { name: 'GESTOR' } };
      const result = await service.submitEvaluation('ev-1', { score: 85 }, evaluatorUser as any);
      expect(result.status).toBe('CLOSED');
    });

    it('deve permitir ao próprio (userId) submeter avaliação SELF', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue({
        id: 'ev-2',
        type: 'SELF',
        userId: 2,
        evaluatorId: 3,
      });
      mockPrisma.userEvaluation.update.mockResolvedValue({
        id: 'ev-2',
        status: 'CLOSED',
        finalScore: 70,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const selfUser = { id: 2, email: 'self@innova.com', role: { name: 'COLABORADOR' } };
      const result = await service.submitEvaluation('ev-2', { score: 70 }, selfUser as any);
      expect(result.status).toBe('CLOSED');
    });

    it('deve lançar NotFoundException se avaliação não existe', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue(null);
      const evaluatorUser = { id: 3, email: 'eval@innova.com', role: { name: 'GESTOR' } };
      await expect(
        service.submitEvaluation('x', { score: 80 }, evaluatorUser as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('não permite utilizador B (nem avaliador nem avaliado) submeter avaliação de A', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        type: 'MANAGER',
        userId: 2,
        evaluatorId: 3,
      });
      const intruder = { id: 999, email: 'intruder@innova.com', role: { name: 'GESTOR' } };
      await expect(
        service.submitEvaluation('ev-1', { score: 10 }, intruder as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.userEvaluation.update).not.toHaveBeenCalled();
    });

    it('não permite o avaliado (userId) submeter avaliação do tipo MANAGER', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        type: 'MANAGER',
        userId: 2,
        evaluatorId: 3,
      });
      const evaluatedUser = { id: 2, email: 'evaluated@innova.com', role: { name: 'COLABORADOR' } };
      await expect(
        service.submitEvaluation('ev-1', { score: 10 }, evaluatedUser as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('permite ADMIN submeter avaliação de qualquer utilizador', async () => {
      mockPrisma.userEvaluation.findUnique.mockResolvedValue({
        id: 'ev-1',
        type: 'MANAGER',
        userId: 2,
        evaluatorId: 3,
      });
      mockPrisma.userEvaluation.update.mockResolvedValue({
        id: 'ev-1',
        status: 'CLOSED',
        finalScore: 85,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.submitEvaluation('ev-1', { score: 85 }, adminUser as any);
      expect(result.status).toBe('CLOSED');
    });
  });

  describe('getDashboard', () => {
    it('deve retornar OKRs, monitoring e evaluation', async () => {
      mockPrisma.okrCycle.count.mockResolvedValue(2);
      mockPrisma.objective.count.mockResolvedValueOnce(10).mockResolvedValueOnce(6);
      mockPrisma.monitoringIndicator.count.mockResolvedValue(5);
      mockPrisma.monitoringRecord.count.mockResolvedValue(20);
      mockPrisma.evaluationCycle.count.mockResolvedValue(1);
      mockPrisma.userEvaluation.count.mockResolvedValueOnce(3).mockResolvedValueOnce(7);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('okrs');
      expect(result).toHaveProperty('monitoring');
      expect(result).toHaveProperty('evaluation');
      expect(result.okrs.objectiveCompletionRate).toBe(60);
      expect(result.evaluation.evaluationCompletionRate).toBe(70);
    });
  });
});
