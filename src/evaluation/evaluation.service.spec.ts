import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CycleStatus, EvalType, EvalModel } from './evaluation.dto';

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
  },
  evaluationRequest: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn(),
    updateMany: jest.fn(),
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
});
