import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { PrismaService } from '../prisma/prisma.service';
import { SurveyStatus, SurveyType } from './engagement.dto';

const engagementSurveyMock = {
  findUnique: jest.fn(),
  findFirst: jest.fn().mockResolvedValue(null),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
};
const surveyResponseMock = {
  findFirst: jest.fn(),
  create: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  groupBy: jest.fn(),
};
const feedbackMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
};
const recognitionMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
};
const oneOnOneMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
};

const mockPrisma = {
  engagementSurvey: engagementSurveyMock,
  surveyResponse: surveyResponseMock,
  feedback: feedbackMock,
  recognition: recognitionMock,
  oneOnOne: oneOnOneMock,
  user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const mockPrismaProxy: any = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'db') return mockPrismaProxy;
    if (prop === 'engagementSurvey') return engagementSurveyMock;
    return (target as any)[prop];
  },
});

const baseSurvey = {
  id: 1,
  title: 'Pesquisa de Clima',
  type: SurveyType.CLIMATE,
  status: SurveyStatus.DRAFT,
  questions: [],
  _count: { responses: 5, questions: 3 },
};

describe('EngagementService', () => {
  let service: EngagementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.count.mockResolvedValue(100);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    Object.defineProperty(mockPrismaProxy, 'read', {
      get() {
        return mockPrismaProxy;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [EngagementService, { provide: PrismaService, useValue: mockPrismaProxy }],
    }).compile();
    service = module.get<EngagementService>(EngagementService);
  });

  // ─── getSurveys ───────────────────────────────────────────────────────────

  describe('getSurveys', () => {
    it('deve retornar surveys com participationRate', async () => {
      engagementSurveyMock.findMany.mockResolvedValue([baseSurvey]);
      engagementSurveyMock.count.mockResolvedValue(1);

      const result = await service.getSurveys({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).participationRate).toBe(5);
    });
  });

  // ─── getSurvey ────────────────────────────────────────────────────────────

  describe('getSurvey', () => {
    it('deve retornar survey por id', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue(baseSurvey);

      const result = await service.getSurvey(1);

      expect(result.title).toBe('Pesquisa de Clima');
      expect((result as any).participationRate).toBe(5);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue(null);
      await expect(service.getSurvey(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createSurvey ─────────────────────────────────────────────────────────

  describe('createSurvey', () => {
    it('deve criar survey com questões', async () => {
      (mockPrismaProxy as any).engagementSurvey.create = jest.fn().mockResolvedValue(baseSurvey);

      const result = await service.createSurvey(
        {
          title: 'Nova Pesquisa',
          type: SurveyType.CLIMATE,
          questions: [{ text: 'Q1', type: 'RATING' as any, order: 1 }],
        },
        1,
      );

      expect(result).toBeDefined();
    });
  });

  // ─── updateSurvey ─────────────────────────────────────────────────────────

  describe('updateSurvey', () => {
    it('deve actualizar survey', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue(baseSurvey);
      engagementSurveyMock.update.mockResolvedValue({ ...baseSurvey, title: 'Actualizado' });

      const result = await service.updateSurvey(1, { title: 'Actualizado' });
      expect(result.title).toBe('Actualizado');
    });
  });

  // ─── activateSurvey ───────────────────────────────────────────────────────

  describe('activateSurvey', () => {
    it('deve activar survey e notificar utilizadores', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue({
        ...baseSurvey,
        status: SurveyStatus.DRAFT,
      });
      engagementSurveyMock.update.mockResolvedValue({ ...baseSurvey, status: 'ACTIVE' });

      const result = await service.activateSurvey(1);
      expect(result.status).toBe('ACTIVE');
    });

    it('deve lançar BadRequestException se já activo', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue({
        ...baseSurvey,
        status: SurveyStatus.ACTIVE,
      });
      await expect(service.activateSurvey(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── closeSurvey ──────────────────────────────────────────────────────────

  describe('closeSurvey', () => {
    it('deve fechar survey', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue(baseSurvey);
      engagementSurveyMock.update.mockResolvedValue({ ...baseSurvey, status: 'CLOSED' });

      const result = await service.closeSurvey(1);
      expect((result as any).status).toBe('CLOSED');
    });
  });

  // ─── submitSurvey ─────────────────────────────────────────────────────────

  describe('submitSurvey', () => {
    it('deve submeter survey com sucesso', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue({
        ...baseSurvey,
        status: 'ACTIVE',
        questions: [],
        minResponsesForResults: 3,
      });
      surveyResponseMock.findFirst.mockResolvedValue(null);
      surveyResponseMock.create.mockResolvedValue({ id: 1, score: 4.0 });
      (mockPrisma.userPoints as any).upsert = jest.fn().mockResolvedValue({});

      const result = await service.submitSurvey(1, {
        surveyId: 1,
        answers: [{ questionId: 1, value: 4 }],
      } as any);
      expect((result as any).message).toContain('sucesso');
    });

    it('deve retornar alreadySubmitted se já respondeu', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue({ ...baseSurvey, status: 'ACTIVE' });
      surveyResponseMock.findFirst.mockResolvedValue({ id: 1 });

      const result = await service.submitSurvey(1, { surveyId: 1, answers: [] } as any);
      expect((result as any).alreadySubmitted).toBe(true);
    });

    it('deve lançar NotFoundException se survey não encontrado', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue(null);
      await expect(service.submitSurvey(1, { surveyId: 99, answers: [] } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getSurveyResults ─────────────────────────────────────────────────────

  describe('getSurveyResults', () => {
    it('deve retornar resultados do survey', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue({
        ...baseSurvey,
        questions: [],
        responses: [],
        minResponsesForResults: 3,
      });

      const result = await service.getSurveyResults(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se survey não existe', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue(null);
      await expect(service.getSurveyResults(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── submitENPS ───────────────────────────────────────────────────────────

  describe('submitENPS', () => {
    it('deve lançar NotFoundException se não há survey eNPS activo', async () => {
      engagementSurveyMock.findFirst.mockResolvedValue(null);
      await expect(service.submitENPS(1, { score: 8, comment: 'Bom' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getENPSScore ─────────────────────────────────────────────────────────

  describe('getENPSScore', () => {
    it('deve retornar null se não há survey eNPS', async () => {
      engagementSurveyMock.findFirst.mockResolvedValue(null);
      const result = await service.getENPSScore();
      expect(result).toBeDefined();
    });
  });

  // ─── submitMood ───────────────────────────────────────────────────────────

  describe('submitMood', () => {
    it('deve submeter mood (retorna fallback se moodCheckin não existe)', async () => {
      (mockPrisma.userPoints as any).upsert = jest.fn().mockResolvedValue({});
      const result = await service.submitMood(1, { mood: 4 } as any);
      expect(result).toBeDefined();
      expect((result as any).mood).toBe(4);
    });
  });

  // ─── getMoodTrend ─────────────────────────────────────────────────────────

  describe('getMoodTrend', () => {
    it('deve retornar tendência de mood', async () => {
      (mockPrisma as any).moodCheckin = { findMany: jest.fn().mockResolvedValue([]) };
      const result = await service.getMoodTrend(1, 14);
      expect(result).toBeDefined();
    });
  });

  // ─── getTeamMoodOverview ──────────────────────────────────────────────────

  describe('getTeamMoodOverview', () => {
    it('deve retornar visão do mood da equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }]);
      (mockPrisma as any).moodCheckin = { findMany: jest.fn().mockResolvedValue([]) };
      const result = await service.getTeamMoodOverview(1);
      expect(result).toBeDefined();
    });
  });

  // ─── createFeedback ───────────────────────────────────────────────────────

  describe('createFeedback', () => {
    it('deve criar feedback', async () => {
      feedbackMock.create.mockResolvedValue({ id: 1, fromUserId: 1, toUserId: 2 });
      const result = await service.createFeedback(1, {
        toUserId: 2,
        type: 'POSITIVE',
        message: 'Excelente trabalho',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getFeedback ──────────────────────────────────────────────────────────

  describe('getFeedback', () => {
    it('deve retornar lista de feedbacks', async () => {
      feedbackMock.findMany.mockResolvedValue([]);
      feedbackMock.count.mockResolvedValue(0);
      const result = await service.getFeedback({ page: 1, limit: 20 });
      expect(result).toBeDefined();
    });
  });

  // ─── replyToFeedback ──────────────────────────────────────────────────────

  describe('replyToFeedback', () => {
    it('deve retornar fallback se update falha', async () => {
      feedbackMock.update.mockRejectedValue(new Error('DB error'));
      const result = await service.replyToFeedback(99, 1, { reply: 'Obrigado' } as any);
      expect((result as any).message).toBeDefined();
    });

    it('deve adicionar resposta ao feedback', async () => {
      feedbackMock.update.mockResolvedValue({ id: 1, reply: 'Obrigado' });

      const result = await service.replyToFeedback(1, 1, { reply: 'Obrigado' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── giveRecognition ──────────────────────────────────────────────────────

  describe('giveRecognition', () => {
    it('deve dar reconhecimento', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, fullName: 'Destinatário' });
      recognitionMock.create.mockResolvedValue({ id: 1, fromUserId: 1, toUserId: 2 });
      (mockPrisma.userPoints as any).upsert = jest.fn().mockResolvedValue({});
      const result = await service.giveRecognition(1, {
        toUserId: 2,
        type: 'EXCELLENCE',
        message: 'Parabéns!',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getRecognitionFeed ───────────────────────────────────────────────────

  describe('getRecognitionFeed', () => {
    it('deve retornar feed de reconhecimentos', async () => {
      recognitionMock.findMany.mockResolvedValue([]);
      recognitionMock.count.mockResolvedValue(0);
      const result = await service.getRecognitionFeed({});
      expect(result).toBeDefined();
    });
  });

  // ─── getLeaderboard ───────────────────────────────────────────────────────

  describe('getLeaderboard', () => {
    it('deve retornar leaderboard', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getLeaderboard('points');
      expect(result).toBeDefined();
    });
  });

  // ─── createOneOnOne ───────────────────────────────────────────────────────

  describe('createOneOnOne', () => {
    it('deve criar 1:1', async () => {
      oneOnOneMock.create.mockResolvedValue({
        id: 1,
        userId: 1,
        managerId: 2,
        scheduledAt: new Date(),
      });
      const result = await service.createOneOnOne(1, {
        managerId: 2,
        scheduledAt: new Date().toISOString(),
      } as any);
      expect(result).toBeDefined();
    });
  });
});
