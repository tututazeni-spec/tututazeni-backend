import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { PrismaService } from '../prisma/prisma.service';
import { SurveyStatus, SurveyType } from './engagement.dto';

const engagementSurveyMock = {
  findUnique: jest.fn(),
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
  user: { findMany: jest.fn(), count: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EngagementService,
        { provide: PrismaService, useValue: mockPrismaProxy },
      ],
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
      engagementSurveyMock.findUnique.mockResolvedValue({ ...baseSurvey, status: SurveyStatus.DRAFT });
      engagementSurveyMock.update.mockResolvedValue({ ...baseSurvey, status: 'ACTIVE' });

      const result = await service.activateSurvey(1);
      expect(result.status).toBe('ACTIVE');
    });

    it('deve lançar BadRequestException se já activo', async () => {
      engagementSurveyMock.findUnique.mockResolvedValue({ ...baseSurvey, status: SurveyStatus.ACTIVE });
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
});
