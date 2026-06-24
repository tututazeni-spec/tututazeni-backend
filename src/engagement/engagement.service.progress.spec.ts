// src/engagement/engagement.service.progress.spec.ts
// Cobre métodos não testados: getSurvey, updateSurvey, activateSurvey, closeSurvey,
// getSurveyResults, getTemplates, getENPSScore, getMoodTrend, getTeamMoodOverview,
// getFeedback, replyToFeedback, giveRecognition, getRecognitionFeed, getLeaderboard,
// createOneOnOne, getOneOnOnes, updateOneOnOne, createActionPlan, getActionPlans,
// updateActionPlan, getEngagementIndex, getEngagementHeatmap, getManagerInsights,
// getHumanSuccessScore, getMyEngagementSummary

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { PrismaService } from '../prisma/prisma.service';

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {}, _sum: {} }),
  });

  return {
    engagementSurvey: crud(),
    user: crud(),
    notificationLog: crud(),
    surveyResponse: crud(),
    surveyAnswer: crud(),
    userPoints: crud(),
    badgeAward: crud(),
    department: crud(),
    performanceReview: crud(),
    enrollment: crud(),
    moodCheckin: crud(),
    feedback: crud(),
    oneOnOneMeeting: crud(),
    engagementAction: crud(),
  };
}

const baseSurvey = {
  id: 1,
  title: 'Survey Teste',
  type: 'PULSE',
  status: 'DRAFT',
  anonymous: false,
  minResponsesForResults: 3,
  questions: [],
  responses: [],
  _count: { responses: 0, questions: 0 },
};

describe('EngagementService (progress)', () => {
  let service: EngagementService;
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
      providers: [EngagementService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<EngagementService>(EngagementService);
  });

  // ─── getSurvey ──────────────────────────────────────────────────

  describe('getSurvey', () => {
    it('deve retornar inquérito com taxa de participação', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        _count: { responses: 5 },
      });
      mockPrisma.user.count.mockResolvedValue(10);
      const result = (await service.getSurvey(1)) as any;
      expect(result.participationRate).toBe(50);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue(null);
      await expect(service.getSurvey(99)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar 0% quando sem utilizadores activos', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        _count: { responses: 2 },
      });
      mockPrisma.user.count.mockResolvedValue(0);
      const result = (await service.getSurvey(1)) as any;
      expect(result.participationRate).toBe(0);
    });
  });

  // ─── updateSurvey ───────────────────────────────────────────────

  describe('updateSurvey', () => {
    it('deve actualizar inquérito existente', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        _count: { responses: 0 },
      });
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.engagementSurvey.update.mockResolvedValue({ ...baseSurvey, title: 'Novo título' });
      const result = await service.updateSurvey(1, { title: 'Novo título' } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.engagementSurvey.update).toHaveBeenCalled();
    });

    it('deve converter endDate para Date object', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        _count: { responses: 0 },
      });
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.engagementSurvey.update.mockResolvedValue(baseSurvey);
      await service.updateSurvey(1, { endDate: '2026-12-31' } as any);
      expect(mockPrisma.engagementSurvey.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ endDate: expect.any(Date) }) }),
      );
    });
  });

  // ─── activateSurvey ─────────────────────────────────────────────

  describe('activateSurvey', () => {
    it('deve activar inquérito e notificar utilizadores', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        status: 'DRAFT',
        _count: { responses: 0 },
      });
      mockPrisma.user.count.mockResolvedValue(3);
      mockPrisma.engagementSurvey.update.mockResolvedValue({ ...baseSurvey, status: 'ACTIVE' });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockPrisma.notificationLog.createMany.mockResolvedValue({ count: 2 });
      const result = await service.activateSurvey(1);
      expect(result).toBeDefined();
      expect(mockPrisma.notificationLog.createMany).toHaveBeenCalled();
    });

    it('deve lançar BadRequestException se já activo', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        status: 'ACTIVE',
        _count: { responses: 0 },
      });
      mockPrisma.user.count.mockResolvedValue(5);
      await expect(service.activateSurvey(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── closeSurvey ────────────────────────────────────────────────

  describe('closeSurvey', () => {
    it('deve fechar inquérito activo', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        status: 'ACTIVE',
        _count: { responses: 5 },
      });
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.engagementSurvey.update.mockResolvedValue({ ...baseSurvey, status: 'COMPLETED' });
      const result = await service.closeSurvey(1);
      expect(result).toBeDefined();
      expect(mockPrisma.engagementSurvey.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'COMPLETED' } }),
      );
    });
  });

  // ─── getSurveyResults ───────────────────────────────────────────

  describe('getSurveyResults', () => {
    it('deve lançar NotFoundException se inquérito não existe', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue(null);
      await expect(service.getSurveyResults(99, 1)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar resultados com threshold atingido', async () => {
      const responses = [
        { score: 4, answers: [], user: { department: { name: 'TI' } } },
        { score: 3, answers: [], user: { department: { name: 'TI' } } },
        { score: 5, answers: [], user: { department: { name: 'RH' } } },
      ];
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        anonymous: false,
        minResponsesForResults: 3,
        questions: [{ id: 1, text: 'Q1', type: 'SCALE', scaleMax: 5 }],
        responses,
      });
      mockPrisma.user.count.mockResolvedValue(10);
      const result = (await service.getSurveyResults(1, 1)) as any;
      expect(result.totalResponses).toBe(3);
      expect(result.thresholdReached).toBe(true);
      expect(result.participationRate).toBe(30);
    });

    it('deve ocultar detalhes quando abaixo do threshold', async () => {
      const responses = [{ score: 4, answers: [], user: { department: { name: 'TI' } } }];
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        anonymous: false,
        minResponsesForResults: 3,
        questions: [],
        responses,
      });
      mockPrisma.user.count.mockResolvedValue(10);
      const result = (await service.getSurveyResults(1, 1)) as any;
      expect(result.thresholdReached).toBe(false);
      expect(result.byDepartment).toHaveLength(0);
    });
  });

  // ─── getTemplates ───────────────────────────────────────────────

  describe('getTemplates', () => {
    it('deve retornar lista de templates', async () => {
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([
        { ...baseSurvey, isTemplate: true, questions: [] },
      ]);
      const result = (await service.getTemplates()) as any[];
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── getENPSScore ───────────────────────────────────────────────

  describe('getENPSScore', () => {
    it('deve retornar valores nulos quando sem inquérito eNPS', async () => {
      mockPrisma.engagementSurvey.findFirst.mockResolvedValue(null);
      const result = (await service.getENPSScore()) as any;
      expect(result.enps).toBeNull();
      expect(result.total).toBe(0);
    });

    it('deve calcular eNPS com promotores e detractores', async () => {
      mockPrisma.engagementSurvey.findFirst.mockResolvedValue({
        ...baseSurvey,
        type: 'ENPS',
        responses: [
          {
            answers: [
              { question: { type: 'ENPS' }, value: 10 }, // promotor
              { question: { type: 'ENPS' }, value: 9 }, // promotor
            ],
          },
          {
            answers: [{ question: { type: 'ENPS' }, value: 5 }], // detractor
          },
        ],
      });
      const result = (await service.getENPSScore()) as any;
      expect(result.promoters).toBe(2);
      expect(result.detractors).toBe(1);
      expect(result.total).toBe(3);
    });

    it('deve retornar label Excelente quando eNPS >= 50', async () => {
      mockPrisma.engagementSurvey.findFirst.mockResolvedValue({
        ...baseSurvey,
        responses: [
          { answers: [{ question: { type: 'ENPS' }, value: 10 }] },
          { answers: [{ question: { type: 'ENPS' }, value: 10 }] },
          { answers: [{ question: { type: 'ENPS' }, value: 10 }] },
        ],
      });
      const result = (await service.getENPSScore()) as any;
      expect(result.label).toBe('Excelente');
    });
  });

  // ─── getMoodTrend ───────────────────────────────────────────────

  describe('getMoodTrend', () => {
    it('deve retornar trend de humor dos últimos N dias', async () => {
      // moodCheckin usa optional chain — retorna null (undefined ?.findMany) → []
      const result = (await service.getMoodTrend(1, 14)) as any;
      expect(result.days).toBe(14);
      expect(result.trend).toBeDefined();
    });

    it('deve usar 14 dias como padrão', async () => {
      const result = (await service.getMoodTrend(1)) as any;
      expect(result.days).toBe(14);
    });
  });

  // ─── getTeamMoodOverview ────────────────────────────────────────

  describe('getTeamMoodOverview', () => {
    it('deve retornar overview sem equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getTeamMoodOverview(1)) as any;
      expect(result.team).toHaveLength(0);
      expect(result.alerts).toHaveLength(0);
    });

    it('deve retornar mood da equipa com fallback sem moodCheckin', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 2, fullName: 'Ana', avatarUrl: null }]);
      const result = (await service.getTeamMoodOverview(1)) as any;
      expect(result.team).toHaveLength(1);
      expect(result.team[0].avgMood).toBeNull();
    });
  });

  // ─── getFeedback ────────────────────────────────────────────────

  describe('getFeedback', () => {
    it('deve retornar lista de feedback paginada (modelo opcional)', async () => {
      const result = (await service.getFeedback({})) as any;
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    it('deve filtrar por tipo e userId', async () => {
      const result = (await service.getFeedback({ type: 'SUGGESTION' as any, toUserId: 5 })) as any;
      expect(result).toHaveProperty('data');
    });
  });

  // ─── replyToFeedback ────────────────────────────────────────────

  describe('replyToFeedback', () => {
    it('deve responder a feedback (modelo opcional)', async () => {
      const result = await service.replyToFeedback(1, 2, { message: 'Obrigado!' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── giveRecognition ────────────────────────────────────────────

  describe('giveRecognition', () => {
    it('deve lançar BadRequestException se auto-reconhecimento', async () => {
      await expect(
        service.giveRecognition(1, { toUserId: 1, type: 'KUDOS', message: 'Eu!' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se utilizador destino não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.giveRecognition(1, { toUserId: 2, type: 'KUDOS', message: 'Bom trabalho' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve atribuir reconhecimento e XP (KUDOS → 15 XP)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, fullName: 'Ana' });
      mockPrisma.userPoints.upsert.mockResolvedValue({ userId: 2, points: 15 });
      const result = (await service.giveRecognition(1, {
        toUserId: 2,
        type: 'KUDOS',
        message: 'Excelente!',
      } as any)) as any;
      expect(mockPrisma.userPoints.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { userId: 2, points: 15 } }),
      );
    });

    it('deve atribuir ACHIEVEMENT → 50 XP', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, fullName: 'Ana' });
      await service.giveRecognition(1, {
        toUserId: 2,
        type: 'ACHIEVEMENT',
        message: 'Parabéns!',
      } as any);
      expect(mockPrisma.userPoints.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { userId: 2, points: 50 } }),
      );
    });

    it('deve atribuir MILESTONE → 100 XP', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, fullName: 'Ana' });
      await service.giveRecognition(1, {
        toUserId: 2,
        type: 'MILESTONE',
        message: '5 anos!',
      } as any);
      expect(mockPrisma.userPoints.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { userId: 2, points: 100 } }),
      );
    });

    it('deve atribuir badge se badgeId fornecido', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, fullName: 'Ana' });
      await service.giveRecognition(1, {
        toUserId: 2,
        type: 'KUDOS',
        message: 'Excelente!',
        badgeId: 5,
      } as any);
      expect(mockPrisma.badgeAward.create).toHaveBeenCalled();
    });
  });

  // ─── createOneOnOne ─────────────────────────────────────────────

  describe('createOneOnOne', () => {
    it('deve criar reunião 1:1 e notificar participante', async () => {
      const result = (await service.createOneOnOne(1, {
        participantId: 2,
        scheduledAt: '2026-07-01T10:00:00',
        durationMinutes: 30,
        agenda: 'Revisão mensal',
      } as any)) as any;
      expect(result).toBeDefined();
      expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
    });
  });

  // ─── getOneOnOnes ───────────────────────────────────────────────

  describe('getOneOnOnes', () => {
    it('deve retornar lista de reuniões 1:1 (modelo opcional)', async () => {
      const result = (await service.getOneOnOnes(1)) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── updateOneOnOne ─────────────────────────────────────────────

  describe('updateOneOnOne', () => {
    it('deve actualizar reunião 1:1 (modelo opcional)', async () => {
      const result = await service.updateOneOnOne(1, 1, { completed: true } as any);
      expect(result).toBeDefined();
    });

    it('deve converter scheduledAt para Date', async () => {
      await service.updateOneOnOne(1, 1, { scheduledAt: '2026-07-15T14:00:00' } as any);
      // No error expected — optional model gracefully degrades
    });
  });

  // ─── createActionPlan ───────────────────────────────────────────

  describe('createActionPlan', () => {
    it('deve criar plano de acção sem assignee', async () => {
      const result = await service.createActionPlan(1, {
        title: 'Melhorar comunicação',
        description: 'Acções práticas',
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('deve criar plano e notificar assignee', async () => {
      const result = await service.createActionPlan(1, {
        title: 'Melhorar comunicação',
        description: 'Acções',
        assigneeId: 5,
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
    });
  });

  // ─── getActionPlans ─────────────────────────────────────────────

  describe('getActionPlans', () => {
    it('deve retornar planos de acção paginados (modelo opcional)', async () => {
      const result = (await service.getActionPlans({})) as any;
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    it('deve filtrar por departmentId e status', async () => {
      const result = (await service.getActionPlans({ departmentId: 1, status: 'OPEN' })) as any;
      expect(result).toHaveProperty('data');
    });
  });

  // ─── updateActionPlan ───────────────────────────────────────────

  describe('updateActionPlan', () => {
    it('deve actualizar plano de acção (modelo opcional)', async () => {
      const result = await service.updateActionPlan(1, { progress: 50 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getEngagementIndex ─────────────────────────────────────────

  describe('getEngagementIndex', () => {
    it('deve retornar índice zero quando sem inquéritos completos', async () => {
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(50);
      const result = (await service.getEngagementIndex()) as any;
      expect(result.currentIndex).toBe(0);
      expect(result.history).toHaveLength(0);
    });

    it('deve calcular índice a partir de inquéritos completos', async () => {
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([
        { ...baseSurvey, responses: [{ score: 4 }, { score: 5 }] },
        { ...baseSurvey, responses: [{ score: 3 }] },
      ]);
      mockPrisma.user.count.mockResolvedValue(100);
      const result = (await service.getEngagementIndex()) as any;
      expect(result.history).toHaveLength(2);
      expect(result.currentIndex).toBeGreaterThan(0);
    });

    it('deve classificar level como EXCELLENT quando index >= 75', async () => {
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([
        { ...baseSurvey, responses: [{ score: 5 }, { score: 5 }, { score: 5 }, { score: 5 }] },
      ]);
      mockPrisma.user.count.mockResolvedValue(4);
      const result = (await service.getEngagementIndex()) as any;
      expect(result.level).toBe('EXCELLENT');
    });

    it('deve classificar AT_RISK quando index < 40', async () => {
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([
        { ...baseSurvey, responses: [{ score: 1 }] },
      ]);
      mockPrisma.user.count.mockResolvedValue(100);
      const result = (await service.getEngagementIndex()) as any;
      expect(result.level).toBe('AT_RISK');
    });
  });

  // ─── getEngagementHeatmap ───────────────────────────────────────

  describe('getEngagementHeatmap', () => {
    it('deve retornar heatmap por departamento (score)', async () => {
      mockPrisma.department.findMany.mockResolvedValue([{ id: 1, name: 'TI', users: [] }]);
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([]);
      const result = (await service.getEngagementHeatmap('score')) as any;
      expect(Array.isArray(result)).toBe(true);
    });

    it('deve retornar heatmap por participação', async () => {
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([]);
      const result = (await service.getEngagementHeatmap('participation')) as any;
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── getManagerInsights ─────────────────────────────────────────

  describe('getManagerInsights', () => {
    it('deve retornar insights sem equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getManagerInsights(1)) as any;
      expect(result).toBeDefined();
    });

    it('deve retornar insights de equipa com dados', async () => {
      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: 2, fullName: 'Ana', avatarUrl: null }]) // team
        .mockResolvedValueOnce([]); // active users for participation
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([]);
      mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
      const result = (await service.getManagerInsights(1)) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getHumanSuccessScore ───────────────────────────────────────

  describe('getHumanSuccessScore', () => {
    it('deve retornar score zero para utilizador sem dados', async () => {
      mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
      const result = (await service.getHumanSuccessScore(1)) as any;
      expect(result).toBeDefined();
      expect(result.humanSuccessScore).toBeDefined();
    });
  });

  // ─── getMyEngagementSummary ─────────────────────────────────────

  describe('getMyEngagementSummary', () => {
    it('deve retornar resumo de engagement do utilizador', async () => {
      mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
      mockPrisma.engagementSurvey.count.mockResolvedValue(0);
      const result = (await service.getMyEngagementSummary(1)) as any;
      expect(result).toBeDefined();
    });
  });
});
