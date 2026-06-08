// src/performance/performance.service.progress.spec.ts
// Cobre métodos não testados: update, remove, submitReview, updateGoalProgress,
// calibrateReview, createDispute, getUserHistory, getTeamPerformance,
// getDepartmentStats, update9Box, get9Box, getPerformanceAnalytics, getPeriods

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PrismaService } from '../prisma/prisma.service';

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest
      .fn()
      .mockResolvedValue({ _avg: { score: null }, _min: { score: null }, _max: { score: null } }),
    upsert: jest.fn().mockResolvedValue({}),
  });

  const mock = {
    performanceCycle: crud(),
    performanceReview: crud(),
    performanceGoal: crud(),
    goalEvaluation: crud(),
    competencyEvaluation: crud(),
    calibrationLog: crud(),
    nineBoxPlacement: crud(),
    performanceDispute: crud(),
    user: crud(),
    notificationLog: crud(),
    continuousFeedback: crud(),
  };

  // continuousFeedback is accessed via (this.prisma as any).continuousFeedback
  return mock;
}

const baseCycle = {
  id: 1,
  name: 'Ciclo 2026-Q1',
  status: 'ACTIVE',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-12-31'),
  goalsWeight: 40,
  competenciesWeight: 40,
  behaviorsWeight: 20,
  selfBeforeManager: true,
  scoreScale: 5,
  _count: { reviews: 0 },
};

const baseReview = {
  id: 1,
  userId: 2,
  reviewerId: 1,
  cycleId: 1,
  type: 'MANAGER',
  status: 'DRAFT',
  score: null,
  category: null,
  feedback: null,
  createdAt: new Date(),
  cycle: baseCycle,
  goals: [],
  competencyEvals: [],
  calibrationLogs: [],
  disputes: [],
  user: { id: 2, fullName: 'Teste User', email: 't@t.com', position: null },
  reviewer: { id: 1, fullName: 'Manager' },
};

describe('PerformanceService (progress)', () => {
  let service: PerformanceService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    // continuousFeedback accessed via (this.prisma as any)
    const module: TestingModule = await Test.createTestingModule({
      providers: [PerformanceService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PerformanceService>(PerformanceService);
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar avaliação não finalizada', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({ ...baseReview, status: 'DRAFT' });
      mockPrisma.performanceReview.update.mockResolvedValue({ ...baseReview, score: 3.5 });
      const result = await service.update(1, { score: 3.5 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se avaliação está FINALIZED', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'FINALIZED',
      });
      await expect(service.update(1, { score: 3.0 } as any)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException se avaliação não existe', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { score: 3.0 } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deve remover avaliação', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue(baseReview);
      mockPrisma.performanceReview.delete.mockResolvedValue({});
      const result = (await service.remove(1)) as any;
      expect(result.message).toContain('removida');
    });

    it('deve lançar NotFoundException se avaliação não existe', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── submitReview ─────────────────────────────────────────────────────────────

  describe('submitReview', () => {
    it('deve submeter avaliação MANAGER (score médio, sem goalEvals)', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'PENDING_MANAGER',
        type: 'MANAGER',
        userId: 2,
        cycle: {
          ...baseCycle,
          scoreScale: 5,
          goalsWeight: 40,
          competenciesWeight: 40,
          behaviorsWeight: 20,
        },
      });
      mockPrisma.performanceReview.update.mockResolvedValue({
        ...baseReview,
        status: 'CALIBRATION',
        score: 3.0,
      });
      const result = await service.submitReview(1, {
        reviewId: 1,
        score: 3.0,
        feedback: 'Bom trabalho',
      });
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se avaliação já finalizada', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'FINALIZED',
      });
      await expect(service.submitReview(1, { reviewId: 1, score: 3.0 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar BadRequestException se score extremo sem justificativa', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'PENDING_MANAGER',
        type: 'MANAGER',
        cycle: {
          ...baseCycle,
          scoreScale: 5,
          goalsWeight: 40,
          competenciesWeight: 40,
          behaviorsWeight: 20,
        },
      });
      // Score = 5 (max) = extremo → exige justificação
      await expect(service.submitReview(1, { reviewId: 1, score: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve enviar notificação ao gestor quando tipo é SELF', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'PENDING_SELF',
        type: 'SELF',
        userId: 2,
        cycle: {
          ...baseCycle,
          scoreScale: 5,
          goalsWeight: 40,
          competenciesWeight: 40,
          behaviorsWeight: 20,
        },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ managerId: 1, fullName: 'Employee' });
      mockPrisma.performanceReview.update.mockResolvedValue({
        ...baseReview,
        status: 'PENDING_MANAGER',
      });
      await service.submitReview(2, {
        reviewId: 1,
        score: 3.0,
        feedback: 'OK',
        justification: 'Médio',
      });
      expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
    });
  });

  // ─── updateGoalProgress ───────────────────────────────────────────────────────

  describe('updateGoalProgress', () => {
    it('deve actualizar progresso para COMPLETED quando 100%', async () => {
      mockPrisma.performanceGoal.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        targetValue: 100,
      });
      mockPrisma.performanceGoal.update.mockResolvedValue({
        id: 1,
        progress: 100,
        status: 'COMPLETED',
      });
      const result = await service.updateGoalProgress(1, 1, {
        currentValue: 100,
        notes: 'Concluído',
      });
      expect(result).toBeDefined();
      expect(mockPrisma.performanceGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', progress: 100 }),
        }),
      );
    });

    it('deve calcular status AT_RISK quando progresso entre 25% e 60%', async () => {
      mockPrisma.performanceGoal.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        targetValue: 100,
      });
      mockPrisma.performanceGoal.update.mockResolvedValue({
        id: 1,
        progress: 40,
        status: 'AT_RISK',
      });
      await service.updateGoalProgress(1, 1, { currentValue: 40, notes: 'Em risco' });
      expect(mockPrisma.performanceGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'AT_RISK' }) }),
      );
    });

    it('deve calcular status OFF_TRACK quando progresso < 25%', async () => {
      mockPrisma.performanceGoal.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        targetValue: 100,
      });
      mockPrisma.performanceGoal.update.mockResolvedValue({
        id: 1,
        progress: 10,
        status: 'OFF_TRACK',
      });
      await service.updateGoalProgress(1, 1, { currentValue: 10, notes: 'Atrasado' });
      expect(mockPrisma.performanceGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OFF_TRACK' }) }),
      );
    });

    it('deve lançar NotFoundException se goal não existe', async () => {
      mockPrisma.performanceGoal.findUnique.mockResolvedValue(null);
      await expect(service.updateGoalProgress(99, 1, { currentValue: 50 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar ForbiddenException se utilizador diferente', async () => {
      mockPrisma.performanceGoal.findUnique.mockResolvedValue({ id: 1, userId: 2 });
      await expect(service.updateGoalProgress(1, 1, { currentValue: 50 })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── calibrateReview ──────────────────────────────────────────────────────────

  describe('calibrateReview', () => {
    it('deve calibrar avaliação em CALIBRATION', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'CALIBRATION',
        score: 3.0,
        userId: 2,
      });
      mockPrisma.performanceReview.update.mockResolvedValue({
        ...baseReview,
        status: 'PUBLISHED',
        score: 3.5,
      });
      mockPrisma.calibrationLog.create.mockResolvedValue({});
      const result = (await service.calibrateReview(1, {
        reviewId: 1,
        calibratedScore: 3.5,
        reason: 'Ajustado',
      })) as any;
      expect(result.message).toContain('publicada');
    });

    it('deve lançar BadRequestException se avaliação não está em CALIBRATION', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({ ...baseReview, status: 'DRAFT' });
      await expect(
        service.calibrateReview(1, { reviewId: 1, calibratedScore: 3.0, reason: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se avaliação não existe', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue(null);
      await expect(
        service.calibrateReview(1, { reviewId: 99, calibratedScore: 3.0, reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createDispute ────────────────────────────────────────────────────────────

  describe('createDispute', () => {
    it('deve criar disputa para avaliação PUBLISHED do próprio utilizador', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'PUBLISHED',
        userId: 1,
      });
      mockPrisma.performanceDispute.create.mockResolvedValue({
        id: 1,
        reviewId: 1,
        userId: 1,
        status: 'OPEN',
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 10 }]); // RH users
      const result = (await service.createDispute(1, {
        reviewId: 1,
        reason: 'Score incorrecta',
        evidence: 'abc',
      })) as any;
      expect(result.id).toBe(1);
    });

    it('deve lançar ForbiddenException se utilizador diferente', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'PUBLISHED',
        userId: 2,
      });
      await expect(service.createDispute(1, { reviewId: 1, reason: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar BadRequestException se avaliação não está PUBLISHED', async () => {
      mockPrisma.performanceReview.findUnique.mockResolvedValue({
        ...baseReview,
        status: 'DRAFT',
        userId: 1,
      });
      await expect(service.createDispute(1, { reviewId: 1, reason: 'x' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── getUserHistory ───────────────────────────────────────────────────────────

  describe('getUserHistory', () => {
    it('deve retornar histórico vazio', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.performanceGoal.findMany.mockResolvedValue([]);
      mockPrisma.continuousFeedback.findMany.mockResolvedValue([]);
      const result = (await service.getUserHistory(1)) as any;
      expect(result.reviews).toHaveLength(0);
      expect(result.goals).toHaveLength(0);
      expect(result.avgScore).toBe(0);
    });

    it('deve calcular avgScore com avaliações', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([
        { ...baseReview, score: 4.0 },
        { ...baseReview, id: 2, score: 3.0 },
      ]);
      mockPrisma.performanceGoal.findMany.mockResolvedValue([]);
      mockPrisma.continuousFeedback.findMany.mockResolvedValue([]);
      const result = (await service.getUserHistory(1)) as any;
      expect(result.avgScore).toBe(3.5);
    });
  });

  // ─── getTeamPerformance ───────────────────────────────────────────────────────

  describe('getTeamPerformance', () => {
    it('deve retornar performance da equipa vazia', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getTeamPerformance(1)) as any;
      expect(result.team).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('deve retornar performance da equipa com membros', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 2, fullName: 'Ana', avatarUrl: null, position: null },
      ]);
      mockPrisma.performanceReview.findFirst.mockResolvedValue(null);
      mockPrisma.performanceGoal.findMany.mockResolvedValue([]);
      mockPrisma.continuousFeedback.count.mockResolvedValue(0);

      const result = (await service.getTeamPerformance(1)) as any;
      expect(result.team).toHaveLength(1);
      expect(result.team[0].status).toBe('NOT_STARTED');
    });
  });

  // ─── getDepartmentStats ───────────────────────────────────────────────────────

  describe('getDepartmentStats', () => {
    it('deve retornar stats do departamento sem dados', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({
        _avg: { score: null },
        _min: { score: null },
        _max: { score: null },
        _count: 0,
      });
      mockPrisma.performanceReview.groupBy.mockResolvedValue([]);
      mockPrisma.performanceGoal.aggregate.mockResolvedValue({ _avg: { progress: null } });
      const result = (await service.getDepartmentStats(1)) as any;
      expect(result.departmentId).toBe(1);
      expect(result.userCount).toBe(2);
      expect(result.avgScore).toBe(0);
    });
  });

  // ─── update9Box ───────────────────────────────────────────────────────────────

  describe('update9Box', () => {
    it('deve criar/actualizar placement no 9-box', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, fullName: 'Ana' });
      mockPrisma.nineBoxPlacement.upsert.mockResolvedValue({ id: 1, userId: 2, cycleId: 1 });
      const result = await service.update9Box(1, {
        userId: 2,
        cycleId: 1,
        performanceAxis: 2,
        potentialAxis: 3,
        justification: 'Alta potencial',
      });
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se utilizador não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.update9Box(1, {
          userId: 99,
          performanceAxis: 2,
          potentialAxis: 3,
          justification: 'x',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── get9Box ──────────────────────────────────────────────────────────────────

  describe('get9Box', () => {
    it('deve retornar grid 9-box vazio (sem placements)', async () => {
      mockPrisma.nineBoxPlacement.findMany.mockResolvedValue([]);
      const result = (await service.get9Box()) as any;
      expect(result.grid).toBeDefined();
      // Grid 3x3 deve ter 9 células
      expect(Object.keys(result.grid)).toHaveLength(9);
    });

    it('deve colocar utilizador na célula correta do 9-box', async () => {
      mockPrisma.nineBoxPlacement.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 2,
          cycleId: 1,
          performanceAxis: 2,
          potentialAxis: 3,
          user: { id: 2, fullName: 'Ana', avatarUrl: null, position: null, department: null },
        },
      ]);
      const result = (await service.get9Box(1)) as any;
      expect(result.grid['2-3']).toHaveLength(1);
      expect(result.grid['2-3'][0].user.fullName).toBe('Ana');
    });
  });

  // ─── getPerformanceAnalytics ──────────────────────────────────────────────────

  describe('getPerformanceAnalytics', () => {
    it('deve retornar analytics sem dados', async () => {
      mockPrisma.performanceReview.count.mockResolvedValue(0);
      mockPrisma.performanceReview.groupBy.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({
        _avg: { score: null },
        _min: { score: null },
        _max: { score: null },
      });
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      const result = (await service.getPerformanceAnalytics()) as any;
      expect(result.totalReviews).toBe(0);
      expect(result.avgScore).toBe(0);
      expect(result.highDivergences).toHaveLength(0);
    });

    it('deve detectar divergências entre autoavaliação e avaliação de gestor', async () => {
      mockPrisma.performanceReview.count.mockResolvedValue(2);
      mockPrisma.performanceReview.groupBy.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({
        _avg: { score: 3.5 },
        _min: { score: 2.0 },
        _max: { score: 5.0 },
      });
      mockPrisma.performanceReview.findMany
        .mockResolvedValueOnce([]) // topPerformers
        .mockResolvedValueOnce([{ userId: 1, score: 2.0 }]) // selfReviews
        .mockResolvedValueOnce([{ userId: 1, score: 4.5 }]); // mgReviews
      const result = (await service.getPerformanceAnalytics()) as any;
      expect(result.highDivergences).toHaveLength(1);
      expect(result.highDivergences[0].divergence).toBeCloseTo(2.5, 1);
    });
  });

  // ─── getPeriods ───────────────────────────────────────────────────────────────

  describe('getPeriods', () => {
    it('deve retornar todos os períodos', async () => {
      mockPrisma.performanceCycle.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Ciclo 2026',
          type: 'ANNUAL',
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: new Date(),
        },
      ]);
      const result = (await service.getPeriods()) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Ciclo 2026');
    });
  });
});
