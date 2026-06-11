import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvalType, EvalModel } from './evaluation.dto';

const mockPrisma = {
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  performanceEvaluation: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn().mockResolvedValue({ id: 1, overallScore: 4.0, status: 'COMPLETED' }),
  },
  evaluationRequest: {
    findFirst: jest.fn(),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  evaluationForm: {
    findUnique: jest
      .fn()
      .mockResolvedValue({ id: 1, name: 'Formulário 2024', sections: [], questions: [] }),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Formulário 2024' }),
  },
  evaluationCycle: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Ciclo 2024' }),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
};

describe('EvaluationService', () => {
  let service: EvaluationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 1, fullName: 'Test User', managerId: 2 });
    mockPrisma.user.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [EvaluationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<EvaluationService>(EvaluationService);
  });

  describe('createCycle', () => {
    it('deve criar ciclo de avaliação', async () => {
      const result = await service.createCycle(
        {
          name: 'Ciclo 2024',
          model: EvalModel.DEG_360,
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          weights: [
            { type: EvalType.SELF, weight: 30 },
            { type: EvalType.MANAGER, weight: 70 },
          ],
        },
        1,
      );
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se pesos não somam 100', async () => {
      await expect(
        service.createCycle(
          {
            name: 'Ciclo Inválido',
            model: EvalModel.DEG_360,
            startDate: '2024-01-01',
            endDate: '2024-12-31',
            weights: [
              { type: EvalType.SELF, weight: 40 },
              { type: EvalType.MANAGER, weight: 40 },
            ],
          },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCycles', () => {
    it('deve retornar lista de ciclos', async () => {
      const result = await service.getCycles({});
      expect(result).toBeDefined();
    });
  });

  describe('getCycle', () => {
    it('deve lançar NotFoundException se ciclo não encontrado', async () => {
      await expect(service.getCycle(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyProgress', () => {
    it('deve retornar progresso do avaliador', async () => {
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([]);
      const result = await service.getMyProgress(1);
      expect(result).toBeDefined();
    });
  });

  describe('create', () => {
    it('deve criar avaliação com sucesso', async () => {
      mockPrisma.evaluationRequest.findFirst.mockResolvedValue(null);
      mockPrisma.performanceEvaluation.create.mockResolvedValue({
        id: 1,
        evaluatorId: 1,
        evaluatedId: 2,
        type: EvalType.MANAGER,
        status: 'DRAFT',
      });

      const result = await service.create(1, {
        evaluatedId: 2,
        type: EvalType.MANAGER,
        period: '2024-Q1',
        criteria: [{ name: 'Comunicação', score: 4 }],
      });

      expect(result).toBeDefined();
    });
  });

  // ─── updateCycle ──────────────────────────────────────────────────────────

  describe('updateCycle', () => {
    it('deve actualizar ciclo', async () => {
      const result = await service.updateCycle(1, { name: 'Ciclo Actualizado' });
      expect(result).toBeDefined();
    });
  });

  // ─── publishCycle ─────────────────────────────────────────────────────────

  describe('publishCycle', () => {
    it('deve publicar ciclo', async () => {
      const result = await service.publishCycle(1);
      expect(result).toBeDefined();
    });
  });

  // ─── activateCycle ────────────────────────────────────────────────────────

  describe('activateCycle', () => {
    it('deve activar ciclo', async () => {
      const fakeCycle = {
        id: 1,
        name: 'Ciclo 2024',
        status: 'PUBLISHED',
        endDate: new Date(),
        model: '360',
        targetDeptIds: [],
        weights: JSON.stringify([]),
      };
      mockPrisma.evaluationCycle.findUnique.mockResolvedValue(fakeCycle);
      mockPrisma.evaluationCycle.update.mockResolvedValue({ ...fakeCycle, status: 'ACTIVE' });
      const result = await service.activateCycle(1);
      expect(result).toBeDefined();
    });
  });

  // ─── createForm ───────────────────────────────────────────────────────────

  describe('createForm', () => {
    it('deve criar formulário de avaliação', async () => {
      mockPrisma.evaluationForm.create.mockResolvedValue({
        id: 1,
        title: 'Formulário 2024',
        questions: [],
      });
      const result = await service.createForm(
        { title: 'Formulário 2024', questions: [] } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getForms ─────────────────────────────────────────────────────────────

  describe('getForms', () => {
    it('deve retornar lista de formulários', async () => {
      const result = await service.getForms();
      expect(result).toBeDefined();
    });
  });

  // ─── getForm ──────────────────────────────────────────────────────────────

  describe('getForm', () => {
    it('deve retornar formulário por id', async () => {
      const result = await service.getForm(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.evaluationForm.findUnique.mockResolvedValueOnce(null);
      await expect(service.getForm(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignEvaluator ──────────────────────────────────────────────────────

  describe('assignEvaluator', () => {
    it('deve atribuir avaliador', async () => {
      mockPrisma.evaluationRequest.findFirst.mockResolvedValue(null);
      mockPrisma.evaluationRequest.create.mockResolvedValue({
        id: 1,
        evaluatorId: 2,
        evaluatedId: 1,
        type: EvalType.MANAGER,
      });
      const result = await service.assignEvaluator({
        evaluatorId: 2,
        evaluatedId: 1,
        cycleId: 1,
        type: EvalType.MANAGER,
      });
      expect(result).toBeDefined();
    });
  });

  // ─── bulkAssign ───────────────────────────────────────────────────────────

  describe('bulkAssign', () => {
    it('deve atribuir avaliadores em massa', async () => {
      const result = await service.bulkAssign({
        cycleId: 1,
        assignments: [{ evaluatorId: 2, evaluatedId: 1, type: EvalType.MANAGER }],
      });
      expect(result).toBeDefined();
    });
  });

  // ─── submitEvaluation ─────────────────────────────────────────────────────

  describe('submitEvaluation', () => {
    it('deve submeter avaliação', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue({
        id: 1,
        evaluatorId: 1,
        evaluatedId: 2,
        status: 'PENDING',
        cycle: {
          weights: JSON.stringify([
            { type: EvalType.MANAGER, weight: 100, selfEvalIncluded: true },
          ]),
          model: EvalModel.DEG_360,
          id: 1,
        },
      });
      mockPrisma.evaluationRequest.findFirst.mockResolvedValue(null);
      mockPrisma.performanceEvaluation.findFirst.mockResolvedValue(null);
      mockPrisma.performanceEvaluation.create.mockResolvedValue({ id: 1, score: 4.0 });
      mockPrisma.evaluationRequest.update.mockResolvedValue({});

      const result = await service.submitEvaluation(1, {
        requestId: 1,
        answers: [{ criterionId: 1, score: 4, comment: 'Bom' }],
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getAnalytics ─────────────────────────────────────────────────────────

  describe('findByUser', () => {
    it('deve retornar avaliações do utilizador', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      mockPrisma.performanceEvaluation.count.mockResolvedValue(0);
      const result = await service.findByUser(1);
      expect(result).toBeDefined();
    });
  });
});
