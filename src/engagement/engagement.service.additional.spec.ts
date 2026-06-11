import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  engagementSurvey: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  surveyQuestion: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  surveyResponse: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: 4.0 } }),
    count: jest.fn().mockResolvedValue(0),
  },
  enpsResponse: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  moodLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  employeeFeedback: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  recognition: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  oneOnOneMeeting: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  engagementActionPlan: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  userPoints: { upsert: jest.fn().mockResolvedValue({}) },
  user: {
    count: jest.fn().mockResolvedValue(600),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue({ id: 2, fullName: 'Destinatário' }),
  },
  feedback: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
  engagementAction: { count: jest.fn().mockResolvedValue(0) },
};

const baseSurvey = {
  id: 1,
  title: 'Pulso de Agosto',
  type: 'PULSE',
  status: 'DRAFT',
  questions: [{ id: 1, text: 'Como se sente?', type: 'SCALE', scale: 10 }],
  _count: { responses: 0, questions: 1 },
};

describe('EngagementService (additional)', () => {
  let service: EngagementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [EngagementService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<EngagementService>(EngagementService);
  });

  // ─── getSurveys ───────────────────────────────────────────────

  describe('getSurveys', () => {
    it('deve retornar inquéritos paginados com taxa de participação', async () => {
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([baseSurvey]);
      mockPrisma.engagementSurvey.count.mockResolvedValue(1);
      mockPrisma.user.count.mockResolvedValue(600);
      const result = await service.getSurveys({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('participationRate');
    });

    it('deve filtrar por type e status', async () => {
      mockPrisma.engagementSurvey.findMany.mockResolvedValue([]);
      mockPrisma.engagementSurvey.count.mockResolvedValue(0);
      await service.getSurveys({ type: 'PULSE' as any, status: 'ACTIVE' as any });
      expect(mockPrisma.engagementSurvey.findMany).toHaveBeenCalled();
    });
  });

  // ─── createSurvey ─────────────────────────────────────────────

  describe('createSurvey', () => {
    it('deve criar inquérito com questões', async () => {
      mockPrisma.engagementSurvey.create.mockResolvedValue(baseSurvey);
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue(baseSurvey);
      const result = await service.createSurvey(
        {
          title: 'Pulso de Agosto',
          type: 'PULSE' as any,
          questions: [{ text: 'Como se sente?', type: 'SCALE' as any, scale: 10 }],
        } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── activateSurvey ───────────────────────────────────────────

  describe('activateSurvey', () => {
    it('deve activar inquérito com questões', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue(baseSurvey);
      mockPrisma.engagementSurvey.update.mockResolvedValue({ ...baseSurvey, status: 'ACTIVE' });
      const result = await service.activateSurvey(1);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se inquérito já está activo', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        status: 'ACTIVE',
      });
      await expect(service.activateSurvey(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── submitSurvey ─────────────────────────────────────────────

  describe('submitSurvey', () => {
    it('deve submeter resposta a inquérito activo', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({
        ...baseSurvey,
        status: 'ACTIVE',
        anonymous: false,
      });
      mockPrisma.surveyResponse.findFirst.mockResolvedValue(null);
      mockPrisma.surveyResponse.create.mockResolvedValue({ id: 1 });
      const result = await service.submitSurvey(2, {
        surveyId: 1,
        answers: [{ questionId: 1, score: 8 }],
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se inquérito não está activo', async () => {
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue({ ...baseSurvey, status: 'DRAFT' });
      await expect(service.submitSurvey(2, { surveyId: 1, answers: [] } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── submitENPS ───────────────────────────────────────────────

  describe('submitENPS', () => {
    it('deve submeter resposta eNPS', async () => {
      mockPrisma.enpsResponse.findFirst.mockResolvedValue(null);
      mockPrisma.enpsResponse.create.mockResolvedValue({ id: 1, score: 9 });
      const enpsQuestion = { id: 1, type: 'ENPS' };
      const enpsSurvey = { id: 99, status: 'ACTIVE', questions: [enpsQuestion] };
      mockPrisma.engagementSurvey.findFirst.mockResolvedValue(enpsSurvey);
      mockPrisma.engagementSurvey.findUnique.mockResolvedValue(enpsSurvey);
      const result = await service.submitENPS(2, { score: 9, reason: 'Boa empresa' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── submitMood ───────────────────────────────────────────────

  describe('submitMood', () => {
    it('deve submeter registo de humor', async () => {
      mockPrisma.moodLog.create.mockResolvedValue({ id: 1, mood: 'HAPPY', userId: 2 });
      const result = await service.submitMood(2, {
        mood: 'HAPPY' as any,
        notes: 'Boa semana!',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── createFeedback ───────────────────────────────────────────

  describe('createFeedback', () => {
    it('deve criar feedback de colaborador', async () => {
      mockPrisma.employeeFeedback.create.mockResolvedValue({
        id: 1,
        fromId: 1,
        type: 'SUGGESTION',
      });
      const result = await service.createFeedback(1, {
        type: 'SUGGESTION' as any,
        title: 'Melhoria',
        content: 'Sugestão...',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── giveRecognition ──────────────────────────────────────────

  describe('giveRecognition', () => {
    it('deve criar reconhecimento entre colaboradores', async () => {
      mockPrisma.recognition.create.mockResolvedValue({
        id: 1,
        fromId: 1,
        toId: 2,
        type: 'SHOUTOUT',
      });
      const result = await service.giveRecognition(1, {
        toUserId: 2,
        type: 'SHOUTOUT' as any,
        message: 'Excelente trabalho!',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getDashboard ─────────────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar dashboard de engagement', async () => {
      mockPrisma.engagementSurvey.findFirst.mockResolvedValue({
        id: 99,
        status: 'ACTIVE',
        questions: [{ id: 1, type: 'ENPS' }],
        responses: [{ answers: [{ question: { type: 'ENPS' }, value: 8 }] }],
      });
      mockPrisma.enpsResponse.findMany.mockResolvedValue([
        { score: 9 },
        { score: 7 },
        { score: 5 },
      ]);
      mockPrisma.moodLog.findMany.mockResolvedValue([]);
      mockPrisma.surveyResponse.count.mockResolvedValue(100);
      mockPrisma.recognition.count.mockResolvedValue(50);
      const result = await service.getDashboard({});
      expect(result).toBeDefined();
    });
  });
});
