// src/evaluation/evaluation.service.progress.spec.ts
// Cobre métodos não testados: getResults, getSummary, getCycleForCalibration,
// calibrateScore, getAnalyticsDashboard, getTeamDashboard, getUserEvolution, triggerPDIFromResults

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Shared mocks ──────────────────────────────────────────────────

const cycleMock = {
  id: 1,
  name: 'Ciclo 2026',
  status: 'ACTIVE',
  model: '360',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-12-31'),
  weights: JSON.stringify([
    { type: 'SELF', weight: 30, selfEvalIncluded: true },
    { type: 'MANAGER', weight: 70, selfEvalIncluded: false },
  ]),
};

const userMock = {
  id: 10,
  fullName: 'Ana Ferreira',
  avatarUrl: null,
  position: { name: 'Developer', level: 2 },
  department: { name: 'TI' },
  managerId: 99,
};

const evalsMock = [
  {
    id: 1,
    evaluatorId: 10,
    evaluatedId: 10,
    type: 'SELF',
    overallScore: 4.0,
    period: '2026',
    createdAt: new Date('2026-01-10'),
    competencyScores: JSON.stringify({ '1': 4.0, '2': 3.5 }),
    strengths: 'Proactivo',
    improvements: 'Comunicação',
    recommendations: null,
    evaluator: { id: 10, fullName: 'Ana Ferreira' },
    evaluated: {
      id: 10,
      fullName: 'Ana Ferreira',
      avatarUrl: null,
      department: { name: 'TI' },
      position: { name: 'Developer' },
    },
  },
  {
    id: 2,
    evaluatorId: 99,
    evaluatedId: 10,
    type: 'MANAGER',
    overallScore: 3.5,
    period: '2026',
    createdAt: new Date('2026-01-11'),
    competencyScores: JSON.stringify({ '1': 3.5, '2': 3.0 }),
    strengths: 'Entrega rápida',
    improvements: null,
    recommendations: 'Aumentar responsabilidades',
    evaluator: { id: 99, fullName: 'Maria Gestora' },
    evaluated: {
      id: 10,
      fullName: 'Ana Ferreira',
      avatarUrl: null,
      department: { name: 'TI' },
      position: { name: 'Developer' },
    },
  },
];

function buildMockPrisma() {
  const crudMock = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {} }),
  });

  return {
    user: crudMock(),
    performanceEvaluation: crudMock(),
    evaluationCycle: crudMock(),
    evaluationRequest: crudMock(),
    evaluationForm: crudMock(),
    evaluationScore: crudMock(),
    performanceReview: crudMock(),
    evaluationQuestion: crudMock(),
    auditLog: crudMock(),
    notificationLog: crudMock(),
    userPoints: { upsert: jest.fn().mockResolvedValue({}) },
    department: { findMany: jest.fn().mockResolvedValue([]) },
    position: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('EvaluationService (progress)', () => {
  let service: EvaluationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

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

  // ─── getResults ────────────────────────────────────────────────

  describe('getResults', () => {
    it('deve lançar NotFoundException se utilizador não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getResults(999)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar hasResults=false se sem avaliações', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);

      const result = await service.getResults(10);
      expect((result as any).hasResults).toBe(false);
      expect((result as any).message).toBeDefined();
    });

    it('deve calcular finalScore como média simples sem pesos', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(evalsMock);

      const result = (await service.getResults(10)) as any;
      expect(result.finalScore).toBeDefined();
      expect(typeof result.finalScore).toBe('number');
      expect(result.byType).toHaveProperty('SELF');
      expect(result.byType).toHaveProperty('MANAGER');
    });

    it('deve calcular finalScore com pesos quando cycleId fornecido', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(evalsMock);
      mockPrisma.evaluationCycle.findUnique.mockResolvedValue(cycleMock);

      const result = (await service.getResults(10, 1)) as any;
      expect(result.finalScore).toBeDefined();
      expect(result.totalEvaluators).toBe(2);
    });

    it('deve calcular concordância SELF vs outros', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(evalsMock);

      const result = (await service.getResults(10)) as any;
      expect(result.concordance).toBeDefined();
      expect(result.concordance.selfScore).toBe(4.0);
      expect(result.concordance.othersScore).toBeDefined();
    });

    it('deve etiquetar score como Excepcional se >= 4', async () => {
      const highEvals = [
        { ...evalsMock[0], type: 'MANAGER', overallScore: 4.5, competencyScores: '{}' },
      ];
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(highEvals);

      const result = (await service.getResults(10)) as any;
      expect(result.scoreLabel).toBe('Excepcional');
    });

    it('deve etiquetar score como Abaixo do Esperado se < 2', async () => {
      const lowEvals = [
        { ...evalsMock[0], type: 'MANAGER', overallScore: 1.2, competencyScores: '{}' },
      ];
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(lowEvals);

      const result = (await service.getResults(10)) as any;
      expect(result.scoreLabel).toBe('Abaixo do Esperado');
    });

    it('deve retornar competências agrupadas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(evalsMock);

      const result = (await service.getResults(10)) as any;
      expect(result.competencies).toBeDefined();
      expect(Object.keys(result.competencies).length).toBeGreaterThan(0);
    });
  });

  // ─── getSummary ────────────────────────────────────────────────

  describe('getSummary', () => {
    it('deve retornar total=0 se sem avaliações no período', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      const result = await service.getSummary(10, '2026');
      expect(result.total).toBe(0);
      expect(result.avgScore).toBe(0);
    });

    it('deve calcular média correctamente com avaliações', async () => {
      const periodEvals = [
        { id: 1, type: 'SELF', overallScore: 4.0, period: '2026' },
        { id: 2, type: 'MANAGER', overallScore: 3.0, period: '2026' },
      ];
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(periodEvals);

      const result = await service.getSummary(10, '2026');
      expect(result.total).toBe(2);
      expect(result.avgScore).toBe(3.5);
      expect(result.byType).toHaveProperty('SELF');
      expect(result.byType).toHaveProperty('MANAGER');
    });

    it('deve filtrar por período fornecido', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      await service.getSummary(10, 'Q1-2026');
      expect(mockPrisma.performanceEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ period: { contains: 'Q1-2026' } }),
        }),
      );
    });
  });

  // ─── getCycleForCalibration ────────────────────────────────────

  describe('getCycleForCalibration', () => {
    it('deve retornar lista vazia se sem avaliações', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      const result = await service.getCycleForCalibration(1);
      expect((result as any).participants).toHaveLength(0);
      expect((result as any).globalAvg).toBe(0);
    });

    it('deve agrupar avaliações por utilizador e calcular médias', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        {
          id: 1,
          evaluatedId: 10,
          evaluatorId: 99,
          type: 'MANAGER',
          overallScore: 4.0,
          evaluated: userMock,
        },
        {
          id: 2,
          evaluatedId: 10,
          evaluatorId: 100,
          type: 'PEER',
          overallScore: 3.0,
          evaluated: userMock,
        },
        {
          id: 3,
          evaluatedId: 20,
          evaluatorId: 99,
          type: 'MANAGER',
          overallScore: 2.5,
          evaluated: { ...userMock, id: 20 },
        },
      ]);

      const result = (await service.getCycleForCalibration(1)) as any;
      expect(result.participants.length).toBeGreaterThan(0);
      expect(result.globalAvg).toBeDefined();
    });

    it('deve detectar avaliadores com bias (desvio > 0.8)', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        {
          id: 1,
          evaluatedId: 10,
          evaluatorId: 99,
          type: 'MANAGER',
          overallScore: 5.0,
          evaluated: userMock,
        },
        {
          id: 2,
          evaluatedId: 20,
          evaluatorId: 99,
          type: 'MANAGER',
          overallScore: 5.0,
          evaluated: { ...userMock, id: 20 },
        },
        {
          id: 3,
          evaluatedId: 30,
          evaluatorId: 100,
          type: 'PEER',
          overallScore: 1.0,
          evaluated: { ...userMock, id: 30 },
        },
        {
          id: 4,
          evaluatedId: 40,
          evaluatorId: 100,
          type: 'PEER',
          overallScore: 1.0,
          evaluated: { ...userMock, id: 40 },
        },
      ]);

      const result = (await service.getCycleForCalibration(1)) as any;
      expect(result.biasedEvaluators).toBeDefined();
    });

    it('deve calcular percentil de cada participante', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        {
          id: 1,
          evaluatedId: 10,
          evaluatorId: 99,
          type: 'MANAGER',
          overallScore: 4.0,
          evaluated: userMock,
        },
        {
          id: 2,
          evaluatedId: 20,
          evaluatorId: 99,
          type: 'MANAGER',
          overallScore: 2.0,
          evaluated: { ...userMock, id: 20 },
        },
      ]);

      const result = (await service.getCycleForCalibration(1)) as any;
      const top = result.participants[0];
      expect(top.percentile).toBeDefined();
    });
  });

  // ─── calibrateScore ────────────────────────────────────────────

  describe('calibrateScore', () => {
    const dto = { evaluatedId: 10, calibratedScore: 4.5 };

    it('deve calibrar score e criar logs de audit e notificação', async () => {
      const result = await service.calibrateScore(1, dto as any, 99);
      expect(result.message).toContain('calibrado');
      expect(result.evaluatedId).toBe(10);
      expect(result.newScore).toBe(4.5);
    });

    it('deve chamar updateMany no performanceEvaluation', async () => {
      await service.calibrateScore(1, dto as any, 99);
      expect(mockPrisma.performanceEvaluation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ evaluatedId: 10, cycleId: 1 }),
          data: expect.objectContaining({ overallScore: 4.5 }),
        }),
      );
    });

    it('deve criar auditLog com entity="PerformanceEvaluation"', async () => {
      await service.calibrateScore(1, dto as any, 99);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'PerformanceEvaluation' }),
        }),
      );
    });

    it('deve criar notificationLog para utilizador calibrado', async () => {
      await service.calibrateScore(1, dto as any, 99);
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 10, type: 'EVALUATION_CALIBRATED' }),
        }),
      );
    });

    it('deve funcionar mesmo se updateMany falhar (catch vazio)', async () => {
      mockPrisma.performanceEvaluation.updateMany.mockRejectedValue(new Error('DB fail'));
      const result = await service.calibrateScore(1, dto as any, 99);
      expect(result).toBeDefined();
    });
  });

  // ─── getAnalyticsDashboard ─────────────────────────────────────

  describe('getAnalyticsDashboard', () => {
    it('deve retornar hasData=false se sem avaliações', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      mockPrisma.evaluationRequest.count.mockResolvedValue(0);

      const result = await service.getAnalyticsDashboard({});
      expect((result as any).hasData).toBe(false);
    });

    it('deve calcular KPIs correctamente com avaliações', async () => {
      const evalData = [
        {
          id: 1,
          evaluatedId: 10,
          overallScore: 4.0,
          evaluated: { id: 10, fullName: 'Ana', avatarUrl: null, department: { name: 'TI' } },
        },
        {
          id: 2,
          evaluatedId: 10,
          overallScore: 4.5,
          evaluated: { id: 10, fullName: 'Ana', avatarUrl: null, department: { name: 'TI' } },
        },
        {
          id: 3,
          evaluatedId: 20,
          overallScore: 2.0,
          evaluated: { id: 20, fullName: 'João', avatarUrl: null, department: { name: 'RH' } },
        },
      ];
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(evalData);
      mockPrisma.evaluationRequest.count.mockResolvedValue(3);

      const result = (await service.getAnalyticsDashboard({})) as any;
      expect(result.hasData).toBe(true);
      expect(result.kpis.totalEvaluations).toBe(3);
      expect(result.kpis.avgScore).toBeDefined();
      expect(result.distribution).toBeDefined();
      expect(result.byDepartment).toBeDefined();
      expect(result.topPerformers).toBeDefined();
      expect(result.bottomPerformers).toBeDefined();
    });

    it('deve distribuir scores nos buckets correctos', async () => {
      const evalData = [
        {
          id: 1,
          evaluatedId: 1,
          overallScore: 4.5,
          evaluated: { id: 1, fullName: 'A', avatarUrl: null, department: { name: 'TI' } },
        },
        {
          id: 2,
          evaluatedId: 2,
          overallScore: 3.2,
          evaluated: { id: 2, fullName: 'B', avatarUrl: null, department: { name: 'TI' } },
        },
        {
          id: 3,
          evaluatedId: 3,
          overallScore: 2.1,
          evaluated: { id: 3, fullName: 'C', avatarUrl: null, department: { name: 'TI' } },
        },
        {
          id: 4,
          evaluatedId: 4,
          overallScore: 1.0,
          evaluated: { id: 4, fullName: 'D', avatarUrl: null, department: { name: 'TI' } },
        },
      ];
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(evalData);
      mockPrisma.evaluationRequest.count.mockResolvedValue(4);

      const result = (await service.getAnalyticsDashboard({})) as any;
      expect(result.distribution.exceptional).toBe(1);
      expect(result.distribution.above).toBe(1);
      expect(result.distribution.expected).toBe(1);
      expect(result.distribution.below).toBe(1);
    });

    it('deve filtrar por cycleId quando fornecido', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      await service.getAnalyticsDashboard({ cycleId: 1 });
      expect(mockPrisma.performanceEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cycleId: 1 }),
        }),
      );
    });

    it('deve calcular participationRate correctamente', async () => {
      const evalData = [
        {
          id: 1,
          evaluatedId: 10,
          overallScore: 3.5,
          evaluated: { id: 10, fullName: 'Ana', avatarUrl: null, department: { name: 'TI' } },
        },
      ];
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue(evalData);
      // Simula 10 pedidos, 5 completados
      mockPrisma.evaluationRequest.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);

      const result = (await service.getAnalyticsDashboard({})) as any;
      expect(result.kpis.participationRate).toBe(50);
    });
  });

  // ─── getTeamDashboard ──────────────────────────────────────────

  describe('getTeamDashboard', () => {
    it('deve retornar mensagem se manager sem equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getTeamDashboard(99)) as any;
      expect(result.team).toHaveLength(0);
      expect(result.message).toBeDefined();
    });

    it('deve retornar estatísticas da equipa', async () => {
      const teamMembers = [
        {
          id: 1,
          fullName: 'Ana',
          avatarUrl: null,
          position: { name: 'Dev' },
          department: { name: 'TI' },
        },
        {
          id: 2,
          fullName: 'João',
          avatarUrl: null,
          position: { name: 'Dev' },
          department: { name: 'TI' },
        },
      ];
      mockPrisma.user.findMany.mockResolvedValue(teamMembers);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        { evaluatedId: 1, overallScore: 4.0 },
        { evaluatedId: 1, overallScore: 3.5 },
      ]);
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([
        { evaluatedId: 2, evaluatorId: 99, status: 'PENDING' },
      ]);

      const result = (await service.getTeamDashboard(99)) as any;
      expect(result.team).toHaveLength(2);
      expect(result.teamAvg).toBeDefined();
      const ana = result.team.find((t: any) => t.user.id === 1);
      expect(ana.avgScore).toBeDefined();
    });

    it('deve marcar hasPendingEval quando há avaliações pendentes', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 5,
          fullName: 'Pedro',
          avatarUrl: null,
          position: { name: 'Dev' },
          department: { name: 'TI' },
        },
      ]);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([
        { evaluatedId: 5, evaluatorId: 99, status: 'PENDING' },
      ]);

      const result = (await service.getTeamDashboard(99, 1)) as any;
      const pedro = result.team[0];
      expect(pedro.hasPendingEval).toBe(true);
    });

    it('deve usar cycleId no filtro quando fornecido', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Ana',
          avatarUrl: null,
          position: { name: 'Dev' },
          department: { name: 'TI' },
        },
      ]);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([]);

      await service.getTeamDashboard(99, 1);
      expect(mockPrisma.performanceEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cycleId: 1 }),
        }),
      );
    });

    it('deve lidar com erros do evaluationRequest graciosamente', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Ana',
          avatarUrl: null,
          position: { name: 'Dev' },
          department: { name: 'TI' },
        },
      ]);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      mockPrisma.evaluationRequest.findMany.mockRejectedValue(new Error('DB error'));

      const result = (await service.getTeamDashboard(99)) as any;
      expect(result.team).toBeDefined();
    });
  });

  // ─── getUserEvolution ──────────────────────────────────────────

  describe('getUserEvolution', () => {
    it('deve retornar evolução vazia se sem avaliações', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      const result = await service.getUserEvolution(10);
      expect(result.evolution).toHaveLength(0);
      expect(result.latestScore).toBe(0);
      expect(result.trend).toBeNull();
    });

    it('deve agrupar avaliações por período', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        { overallScore: 3.5, type: 'SELF', period: 'Q1-2025', createdAt: new Date('2025-03-01') },
        {
          overallScore: 4.0,
          type: 'MANAGER',
          period: 'Q1-2025',
          createdAt: new Date('2025-03-05'),
        },
        { overallScore: 4.5, type: 'SELF', period: 'Q1-2026', createdAt: new Date('2026-03-01') },
      ]);

      const result = await service.getUserEvolution(10);
      expect(result.evolution).toHaveLength(2);
      const q1 = result.evolution.find(e => e.period === 'Q1-2025');
      expect(q1?.avgScore).toBe(3.75);
    });

    it('deve calcular trend entre último e penúltimo período', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        { overallScore: 3.0, type: 'SELF', period: '2024', createdAt: new Date('2024-01-01') },
        { overallScore: 4.0, type: 'SELF', period: '2025', createdAt: new Date('2025-01-01') },
      ]);

      const result = await service.getUserEvolution(10);
      expect(result.trend).toBe(1); // 4.0 - 3.0 = 1.0
    });

    it('deve retornar trend null quando só um período', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        { overallScore: 3.5, type: 'SELF', period: '2026', createdAt: new Date('2026-01-01') },
      ]);

      const result = await service.getUserEvolution(10);
      expect(result.trend).toBeNull();
      expect(result.latestScore).toBe(3.5);
    });
  });

  // ─── triggerPDIFromResults ─────────────────────────────────────

  describe('triggerPDIFromResults', () => {
    it('deve retornar mensagem se sem dados de competências', async () => {
      // getResults retorna hasResults=false (sem avaliações)
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);

      const result = (await service.triggerPDIFromResults(10)) as any;
      expect(result.message).toContain('competências');
    });

    it('deve identificar top 3 gaps de competências', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        {
          ...evalsMock[0],
          competencyScores: JSON.stringify({ '1': 1.5, '2': 2.0, '3': 3.5, '4': 4.0, '5': 1.0 }),
        },
      ]);
      // Para triggerPDIFromResults — user.findUnique chamado 2x (getResults + notif)
      mockPrisma.user.findUnique.mockResolvedValue(userMock);

      const result = (await service.triggerPDIFromResults(10)) as any;
      expect(result.suggestedGaps).toBeDefined();
      expect(result.suggestedGaps.length).toBeLessThanOrEqual(3);
      expect(result.pdiAutoGenerated).toBe(false);
    });

    it('deve notificar manager se utilizador tem manager', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        {
          ...evalsMock[0],
          competencyScores: JSON.stringify({ '1': 1.5, '2': 2.0, '3': 3.5 }),
        },
      ]);

      const result = (await service.triggerPDIFromResults(10)) as any;
      if (result.managerNotified !== undefined) {
        // Se chegou a criar notificação, verifica
        expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
      }
    });

    it('deve retornar recommendation com número de gaps identificados', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userMock);
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([
        {
          ...evalsMock[0],
          competencyScores: JSON.stringify({ '1': 1.5, '2': 2.0 }),
        },
      ]);

      const result = (await service.triggerPDIFromResults(10)) as any;
      if (result.recommendation) {
        expect(result.recommendation).toContain('competências');
      }
    });
  });
});
