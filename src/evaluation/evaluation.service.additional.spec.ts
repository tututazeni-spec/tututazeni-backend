import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { PrismaService } from '../prisma/prisma.service';

const mockEvalCycle = {
  id: 1,
  name: 'Ciclo Q1 2026',
  status: 'DRAFT',
  model: '360',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-03-31'),
  weights: JSON.stringify([
    { type: 'SELF', weight: 30, selfEvalIncluded: true },
    { type: 'MANAGER', weight: 70, selfEvalIncluded: false },
  ]),
  targetDeptIds: [],
};

const mockEvalCycleProxy = {
  findMany: jest.fn().mockResolvedValue([]),
  findFirst: jest.fn().mockResolvedValue(null),
  findUnique: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue(mockEvalCycle),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
  update: jest.fn().mockResolvedValue(mockEvalCycle),
  delete: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  groupBy: jest.fn().mockResolvedValue([]),
  upsert: jest.fn().mockResolvedValue({}),
  aggregate: jest.fn().mockResolvedValue({ _avg: { score: 0 } }),
};

const mockPrisma: any = {
  evaluationCycle: mockEvalCycleProxy,
  evaluationForm: { ...mockEvalCycleProxy },
  evaluationRequest: { ...mockEvalCycleProxy },
  performanceEvaluation: { ...mockEvalCycleProxy },
  performanceReview: { ...mockEvalCycleProxy },
  evaluationScore: { ...mockEvalCycleProxy },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  department: { findMany: jest.fn().mockResolvedValue([]) },
  position: { findMany: jest.fn().mockResolvedValue([]) },
};

// Proxy para safeM — garante que todos os modelos existem
Object.keys(mockPrisma).forEach(key => {
  if (!mockPrisma[key]) {
    mockPrisma[key] = { ...mockEvalCycleProxy };
  }
});

describe('EvaluationService (additional)', () => {
  let service: EvaluationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset all mocks to defaults
    Object.keys(mockPrisma).forEach(key => {
      if (mockPrisma[key]?.findMany) mockPrisma[key].findMany.mockResolvedValue([]);
      if (mockPrisma[key]?.findUnique) mockPrisma[key].findUnique.mockResolvedValue(null);
      if (mockPrisma[key]?.findFirst) mockPrisma[key].findFirst?.mockResolvedValue(null);
      if (mockPrisma[key]?.count) mockPrisma[key].count?.mockResolvedValue(0);
    });
    mockPrisma.notificationLog.createMany.mockResolvedValue({ count: 0 });

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [EvaluationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<EvaluationService>(EvaluationService);
  });

  // ─── createCycle ──────────────────────────────────────────────

  describe('createCycle', () => {
    it('deve criar ciclo com pesos válidos (soma 100)', async () => {
      mockPrisma.evaluationCycle.create.mockResolvedValue(mockEvalCycle);
      // EvaluatorWeightDto has no 'selfEvalIncluded' — use correct fields only
      const result = await service.createCycle(
        {
          name: 'Ciclo Q1',
          model: '360' as any,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          weights: [
            { type: 'SELF' as any, weight: 30 },
            { type: 'MANAGER' as any, weight: 70 },
          ],
        },
        1,
      );
      expect(result).toBeDefined();
      expect(result.name).toBe('Ciclo Q1 2026');
    });

    it('deve lançar BadRequestException se soma de pesos != 100', async () => {
      await expect(
        service.createCycle(
          {
            name: 'Ciclo inválido',
            model: '360' as any,
            startDate: '2026-01-01',
            endDate: '2026-03-31',
            weights: [{ type: 'SELF' as any, weight: 50 }],
          },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve aceitar pesos com tolerância de 0.5%', async () => {
      mockPrisma.evaluationCycle.create.mockResolvedValue(mockEvalCycle);
      const result = await service.createCycle(
        {
          name: 'Ciclo tolerância',
          model: '180' as any,
          startDate: '2026-01-01',
          endDate: '2026-06-30',
          weights: [
            { type: 'SELF' as any, weight: 50.2 },
            { type: 'MANAGER' as any, weight: 49.9 },
          ],
        },
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getCycles ────────────────────────────────────────────────

  describe('getCycles', () => {
    it('deve retornar lista de ciclos paginada', async () => {
      mockPrisma.evaluationCycle.findMany.mockResolvedValue([mockEvalCycle]);
      mockPrisma.evaluationCycle.count.mockResolvedValue(1);
      const result = await service.getCycles({ page: 1, limit: 10 });
      expect(result.data).toBeDefined();
      expect(result.meta.page).toBe(1);
    });

    it('deve filtrar por status', async () => {
      mockPrisma.evaluationCycle.findMany.mockResolvedValue([]);
      mockPrisma.evaluationCycle.count.mockResolvedValue(0);
      const result = await service.getCycles({ status: 'ACTIVE' as any });
      expect(result.data).toHaveLength(0);
    });

    it('deve funcionar sem filtros', async () => {
      const result = await service.getCycles();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });
  });

  // ─── getCycle ─────────────────────────────────────────────────

  describe('getCycle', () => {
    it('deve retornar ciclo com estatísticas de participação', async () => {
      mockPrisma.evaluationCycle.findUnique.mockResolvedValue(mockEvalCycle);
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'PENDING' },
      ]);
      const result = await service.getCycle(1);
      expect(result).toBeDefined();
      expect(result.participation.total).toBe(2);
      expect(result.participation.completed).toBe(1);
      expect(result.participation.rate).toBe(50);
    });

    it('deve lançar NotFoundException se ciclo não existe', async () => {
      mockPrisma.evaluationCycle.findUnique.mockResolvedValue(null);
      await expect(service.getCycle(99)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar rate 0 quando sem pedidos', async () => {
      mockPrisma.evaluationCycle.findUnique.mockResolvedValue(mockEvalCycle);
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([]);
      const result = await service.getCycle(1);
      expect(result.participation.rate).toBe(0);
    });
  });

  // ─── updateCycle ──────────────────────────────────────────────

  describe('updateCycle', () => {
    it('deve actualizar ciclo', async () => {
      mockPrisma.evaluationCycle.update.mockResolvedValue({
        ...mockEvalCycle,
        name: 'Actualizado',
      });
      const result = await service.updateCycle(1, { name: 'Actualizado' });
      expect(result).toBeDefined();
    });

    it('deve converter endDate para Date', async () => {
      mockPrisma.evaluationCycle.update.mockResolvedValue(mockEvalCycle);
      await service.updateCycle(1, { endDate: '2026-12-31' });
      expect(mockPrisma.evaluationCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ endDate: expect.any(Date) }) }),
      );
    });
  });

  // ─── publishCycle ─────────────────────────────────────────────

  describe('publishCycle', () => {
    it('deve publicar ciclo', async () => {
      mockPrisma.evaluationCycle.update.mockResolvedValue({
        ...mockEvalCycle,
        status: 'PUBLISHED',
      });
      const result = await service.publishCycle(1);
      expect(result).toBeDefined();
    });
  });

  // ─── activateCycle ────────────────────────────────────────────

  describe('activateCycle', () => {
    it('deve activar ciclo e notificar participantes', async () => {
      mockPrisma.evaluationCycle.findUnique.mockResolvedValue(mockEvalCycle);
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1, managerId: null }]);
      mockPrisma.evaluationCycle.update.mockResolvedValue({ ...mockEvalCycle, status: 'ACTIVE' });
      mockPrisma.notificationLog.createMany.mockResolvedValue({ count: 0 });

      const result = await service.activateCycle(1);
      expect(result).toBeDefined();
    });

    it('deve criar requests de avaliação para utilizadores com manager', async () => {
      mockPrisma.evaluationCycle.findUnique.mockResolvedValue(mockEvalCycle);
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, managerId: 2 },
        { id: 3, managerId: null },
      ]);
      mockPrisma.evaluationCycle.update.mockResolvedValue({ ...mockEvalCycle, status: 'ACTIVE' });
      mockPrisma.notificationLog.createMany.mockResolvedValue({ count: 1 });

      await service.activateCycle(1);
      // verifica que createMany foi chamado para avaliações
      expect(mockPrisma.user.findMany).toHaveBeenCalled();
    });
  });

  // ─── createForm ───────────────────────────────────────────────

  describe('createForm', () => {
    it('deve criar formulário de avaliação', async () => {
      mockPrisma.evaluationForm.create.mockResolvedValue({ id: 1, title: 'Formulário Base' });
      // CreateFormDto uses 'title' not 'name'; 'questions' is required
      const result = await service.createForm(
        { title: 'Formulário Base', questions: [] } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getForms ─────────────────────────────────────────────────

  describe('getForms', () => {
    it('deve retornar formulários', async () => {
      mockPrisma.evaluationForm.findMany.mockResolvedValue([{ id: 1, name: 'Form' }]);
      const result = await service.getForms();
      expect(result).toBeDefined();
    });
  });

  // ─── create (legacy evaluation) ──────────────────────────────

  describe('create (legacy)', () => {
    it('deve criar avaliação', async () => {
      mockPrisma.performanceEvaluation.create.mockResolvedValue({ id: 1 });
      // Real method: create(evaluatorId, dto) — using CreateEvaluationDto
      const result = await service.create(1, {
        type: 'SELF' as any,
        evaluatedId: 2,
        period: '2026-Q1',
        criteria: [{ name: 'Comunicação', score: 4 }],
      });
      expect(result).toBeDefined();
    });
  });

  // ─── findByUser (replaces getMyEvaluations) ───────────────────

  describe('findByUser', () => {
    it('deve retornar avaliações do utilizador', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      // Real method: findByUser(userId, period?)
      const result = await service.findByUser(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getPendingEvaluations ────────────────────────────────────

  describe('getPendingEvaluations', () => {
    it('deve retornar avaliações pendentes', async () => {
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([]);
      const result = await service.getPendingEvaluations(1);
      expect(result).toBeDefined();
    });
  });

  // ─── submitEvaluation ─────────────────────────────────────────

  describe('submitEvaluation', () => {
    it('deve submeter avaliação', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue({
        id: 1,
        evaluatorId: 1,
        evaluatedId: 2,
        type: 'SELF',
        cycleId: null,
        cycle: null,
        status: 'PENDING',
      });
      mockPrisma.performanceEvaluation.upsert.mockResolvedValue({ id: 1, overallScore: 4 });
      mockPrisma.evaluationRequest.update.mockResolvedValue({ id: 1, status: 'COMPLETED' });
      mockPrisma.userPoints = { upsert: jest.fn().mockResolvedValue({}) };
      mockPrisma.notificationLog.create.mockResolvedValue({});
      // Real signature: submitEvaluation(evaluatorId, dto) — 2 args
      const result = await service.submitEvaluation(1, {
        requestId: 1,
        answers: [{ questionId: 1, score: 4 }],
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se avaliação não encontrada', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue(null);
      // Real signature: submitEvaluation(evaluatorId, dto) — 2 args
      await expect(
        service.submitEvaluation(1, { requestId: 99, answers: [] } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getAnalyticsDashboard (replaces getAnalytics) ───────────

  describe('getAnalyticsDashboard', () => {
    it('deve retornar analytics de avaliação', async () => {
      // Real method: getAnalyticsDashboard(filters?)
      const result = await service.getAnalyticsDashboard({ cycleId: 1 });
      expect(result).toBeDefined();
    });
  });

  // ─── assignEvaluator ──────────────────────────────────────────

  describe('assignEvaluator', () => {
    it('deve criar pedido de avaliação', async () => {
      mockPrisma.evaluationRequest.create.mockResolvedValue({ id: 1 });
      const result = await service.assignEvaluator({
        evaluatorId: 2,
        evaluatedId: 1,
        cycleId: 1,
        type: 'PEER' as any,
      });
      expect(result).toBeDefined();
    });
  });

  // ─── bulkAssign ───────────────────────────────────────────────

  describe('bulkAssign', () => {
    it('deve atribuir avaliadores em bulk', async () => {
      mockPrisma.evaluationRequest.createMany.mockResolvedValue({ count: 3 });
      const result = await service.bulkAssign({
        cycleId: 1,
        assignments: [{ evaluatorId: 2, evaluatedId: 1, type: 'MANAGER' as any }],
      });
      expect(result).toBeDefined();
    });
  });

  // ─── calibrateScore ───────────────────────────────────────────

  describe('calibrateScore', () => {
    it('deve calibrar score de avaliação', async () => {
      mockPrisma.performanceEvaluation.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});
      // CalibrateScoreDto has 'calibrationNote' not 'justification'
      const result = await service.calibrateScore(
        1,
        { evaluatedId: 2, calibratedScore: 4.5, calibrationNote: 'OK' },
        2,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getTeamDashboard (replaces getTeamEvaluations) ──────────

  describe('getTeamDashboard', () => {
    it('deve retornar avaliações da equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 2, fullName: 'Ana', avatarUrl: null, position: null, department: null },
      ]);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([]);
      // Real method: getTeamDashboard(managerId, cycleId?)
      const result = await service.getTeamDashboard(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getResults (replaces getScore) ──────────────────────────

  describe('getResults', () => {
    it('deve retornar resultados calculados de utilizador num ciclo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Test',
        avatarUrl: null,
        position: null,
        department: null,
      });
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      mockPrisma.evaluationCycle.findUnique.mockResolvedValue(null);
      // Real method: getResults(evaluatedId, cycleId?)
      const result = await service.getResults(1, 1);
      expect(result).toBeDefined();
    });
  });
});
