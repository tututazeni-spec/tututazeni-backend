// src/evaluation/evaluation.service.remodel-p1.spec.ts
// Testes dos métodos novos da remodelação Parte 1 (docs/modulo_evaluation.md
// pontos 0-3): ciclo de vida do ciclo (pause/close/reopen/remind), lista
// agregada de "Avaliações" (EvaluationRequest agrupado por colaborador),
// acções de avaliação individual e o dashboard "Visão Geral".

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: { findMany: jest.fn().mockResolvedValue([]) },
  performanceEvaluation: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  evaluationRequest: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  evaluationCampaign: {
    findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ciclo 2026', allowCalibration: true }),
    update: jest
      .fn()
      .mockResolvedValue({ id: 1, name: 'Ciclo 2026', model: 'DEG_360', status: 'ACTIVE' }),
    count: jest.fn().mockResolvedValue(0),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

describe('EvaluationService (remodel Parte 1)', () => {
  let service: EvaluationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.evaluationCampaign.findFirst.mockResolvedValue({
      id: 1,
      name: 'Ciclo 2026',
      allowCalibration: true,
    });
    mockPrisma.evaluationCampaign.update.mockResolvedValue({
      id: 1,
      name: 'Ciclo 2026',
      model: 'DEG_360',
      status: 'ACTIVE',
    });

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

  describe('pauseCycle / closeCycle / reopenCycle', () => {
    it('pausa o ciclo', async () => {
      mockPrisma.evaluationCampaign.update.mockResolvedValueOnce({
        id: 1,
        name: 'Ciclo 2026',
        model: 'DEG_360',
        status: 'PAUSED',
      });
      const result = await service.pauseCycle(1);
      expect(result.status).toBe('PAUSED');
      expect(mockPrisma.evaluationCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PAUSED' } }),
      );
    });

    it('encerra o ciclo', async () => {
      mockPrisma.evaluationCampaign.update.mockResolvedValueOnce({
        id: 1,
        name: 'Ciclo 2026',
        model: 'DEG_360',
        status: 'COMPLETED',
      });
      const result = await service.closeCycle(1);
      expect(result.status).toBe('COMPLETED');
    });

    it('reabre o ciclo', async () => {
      const result = await service.reopenCycle(1);
      expect(result.status).toBe('ACTIVE');
    });

    it('lança NotFoundException para ciclo inexistente', async () => {
      mockPrisma.evaluationCampaign.findFirst.mockResolvedValueOnce(null);
      await expect(service.pauseCycle(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remindCycleParticipants', () => {
    it('notifica avaliadores com pedidos pendentes/em curso', async () => {
      mockPrisma.evaluationRequest.findMany.mockResolvedValueOnce([
        { evaluatorId: 10 },
        { evaluatorId: 11 },
        { evaluatorId: 10 },
      ]);
      const result = await service.remindCycleParticipants(1);
      expect(result).toEqual({ notified: 2 });
      expect(mockPrisma.notificationLog.createMany).toHaveBeenCalled();
    });

    it('não chama createMany quando não há participantes pendentes', async () => {
      mockPrisma.evaluationRequest.findMany.mockResolvedValueOnce([]);
      const result = await service.remindCycleParticipants(1);
      expect(result).toEqual({ notified: 0 });
      expect(mockPrisma.notificationLog.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getEvaluationRequestsList', () => {
    it('agrupa SELF+MANAGER do mesmo colaborador/ciclo numa única linha, priorizando MANAGER', async () => {
      const evaluated = { id: 100, fullName: 'Colaborador X', department: null, position: null };
      const cycle = {
        id: 1,
        name: 'Ciclo 2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      };
      mockPrisma.evaluationRequest.findMany.mockResolvedValueOnce([
        {
          id: 1,
          evaluatedId: 100,
          evaluatorId: 5,
          cycleId: 1,
          type: 'SELF',
          status: 'COMPLETED',
          dueDate: new Date('2026-03-01'),
          completedAt: new Date('2026-02-20'),
          purpose: 'PERFORMANCE',
          name: null,
          stage: 'DONE',
          evaluated,
          evaluator: { id: 100, fullName: 'Colaborador X' },
          cycle,
        },
        {
          id: 2,
          evaluatedId: 100,
          evaluatorId: 7,
          cycleId: 1,
          type: 'MANAGER',
          status: 'IN_PROGRESS',
          dueDate: new Date('2026-03-05'),
          completedAt: null,
          purpose: 'PERFORMANCE',
          name: null,
          stage: 'MANAGER_EVAL',
          evaluated,
          evaluator: { id: 7, fullName: 'Gestor Y' },
          cycle,
        },
      ]);

      const result = await service.getEvaluationRequestsList({});
      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      const row = result.data[0];
      expect(row.evaluator).toEqual({ id: 7, fullName: 'Gestor Y' });
      expect(row.status).toBe('IN_PROGRESS');
      expect(row.evaluatorsCount).toBe(2);
    });
  });

  describe('finishEvaluationRequest / reopenEvaluationRequest', () => {
    it('finaliza uma avaliação', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValueOnce({
        id: 1,
        evaluatorId: 5,
        evaluatedId: 100,
      });
      await service.finishEvaluationRequest(1);
      expect(mockPrisma.evaluationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', stage: 'DONE' }),
        }),
      );
    });

    it('reabre uma avaliação', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValueOnce({
        id: 1,
        evaluatorId: 5,
        evaluatedId: 100,
      });
      await service.reopenEvaluationRequest(1);
      expect(mockPrisma.evaluationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'IN_PROGRESS', completedAt: null }),
        }),
      );
    });

    it('lança NotFoundException quando o pedido não existe', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValueOnce(null);
      await expect(service.finishEvaluationRequest(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateEvaluationRequest', () => {
    it('rejeita edição de avaliação já concluída', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValueOnce({ id: 1, status: 'COMPLETED' });
      await expect(service.updateEvaluationRequest(1, { name: 'Novo nome' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('advanceStage', () => {
    it('avança de SELF_EVAL para MANAGER_EVAL quando existe pedido SELF', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValueOnce({
        id: 2,
        evaluatedId: 100,
        cycleId: 1,
        stage: 'SELF_EVAL',
        cycle: { allowCalibration: true },
      });
      mockPrisma.evaluationRequest.count.mockResolvedValueOnce(1);
      await service.advanceStage(2);
      expect(mockPrisma.evaluationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stage: 'MANAGER_EVAL' }) }),
      );
    });

    it('salta CALIBRATION quando o ciclo não permite calibração', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValueOnce({
        id: 2,
        evaluatedId: 100,
        cycleId: 1,
        stage: 'HR_REVIEW',
        cycle: { allowCalibration: false },
      });
      mockPrisma.evaluationRequest.count.mockResolvedValueOnce(0);
      await service.advanceStage(2);
      expect(mockPrisma.evaluationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stage: 'ONE_ON_ONE' }) }),
      );
    });

    it('marca a avaliação como concluída ao chegar a DONE', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValueOnce({
        id: 2,
        evaluatedId: 100,
        cycleId: 1,
        stage: 'APPROVAL',
        cycle: { allowCalibration: true },
      });
      mockPrisma.evaluationRequest.count.mockResolvedValueOnce(1);
      await service.advanceStage(2);
      expect(mockPrisma.evaluationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stage: 'DONE', status: 'COMPLETED' }),
        }),
      );
    });
  });

  describe('getOverviewDashboard', () => {
    it('devolve o âmbito pessoal para utilizador não privilegiado', async () => {
      const result = await service.getOverviewDashboard(1, false);
      expect(result.scope).toBe('personal');
    });

    it('devolve KPIs organizacionais para utilizador privilegiado', async () => {
      mockPrisma.evaluationRequest.groupBy.mockResolvedValueOnce([
        { status: 'PENDING', _count: { _all: 3 } },
        { status: 'IN_PROGRESS', _count: { _all: 2 } },
        { status: 'COMPLETED', _count: { _all: 5 } },
      ]);
      mockPrisma.evaluationCampaign.count.mockResolvedValueOnce(4);
      mockPrisma.performanceEvaluation.findMany
        .mockResolvedValueOnce([{ evaluatedId: 1 }, { evaluatedId: 2 }])
        .mockResolvedValueOnce([{ overallScore: 4 }, { overallScore: 3 }]);
      mockPrisma.evaluationRequest.findMany.mockResolvedValueOnce([]);
      mockPrisma.evaluationRequest.count.mockResolvedValueOnce(1);

      const result = await service.getOverviewDashboard(1, true);
      expect(result.scope).toBe('organization');
      if (result.scope === 'organization') {
        expect(result.kpis.pending).toBe(3);
        expect(result.kpis.inProgress).toBe(2);
        expect(result.kpis.completed).toBe(5);
        expect(result.activeCycles).toBe(4);
        expect(result.alerts).toEqual([{ type: 'OVERDUE', count: 1 }]);
      }
    });
  });
});
