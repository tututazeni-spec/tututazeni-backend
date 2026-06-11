import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AiTutorService } from './ai-tutor.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProvidersService } from './ai-providers.service';

const mockAiProviders = {
  chat: jest.fn().mockResolvedValue({
    text: 'Resposta do tutor IA',
    tokensUsed: 150,
    provider: 'groq',
    model: 'llama3',
  }),
  getProviderInfo: jest
    .fn()
    .mockReturnValue({ provider: 'Groq', model: 'llama3', free: true, docs: '' }),
};

const mockPrisma: any = {
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: 1,
      fullName: 'João Silva',
      position: null,
      department: null,
      userCompetencies: [],
      points: null,
    }),
  },
  course: { findUnique: jest.fn().mockResolvedValue(null) },
  developmentPlan: { findFirst: jest.fn().mockResolvedValue(null) },
  aiTutorMemory: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
  enrollment: { findMany: jest.fn().mockResolvedValue([]) },
  aiTutorSession: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  aiMessage: {
    create: jest.fn().mockResolvedValue({ id: 1, role: 'ASSISTANT', content: 'Olá!' }),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue({ id: 1, role: 'ASSISTANT', rating: null }),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: { tokensUsed: 0 }, _avg: { rating: null } }),
    update: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  userPoints: { upsert: jest.fn().mockResolvedValue({}) },
};

const baseSession = {
  id: 'session-1',
  userId: 1,
  courseId: null,
  endedAt: null,
  messages: [{ id: 1, role: 'SYSTEM', content: 'System prompt' }],
  _count: { messages: 1 },
};

describe('AiTutorService (additional)', () => {
  let service: AiTutorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiTutorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AiProvidersService, useValue: mockAiProviders },
      ],
    }).compile();
    service = module.get<AiTutorService>(AiTutorService);
  });

  // ─── startSession ─────────────────────────────────────────────

  describe('startSession', () => {
    it('deve iniciar sessão de tutoria para utilizador existente', async () => {
      mockPrisma.aiTutorSession.create.mockResolvedValue(baseSession);
      const result = await service.startSession(1, { personality: 'FRIENDLY' as any });
      expect(result).toBeDefined();
      expect(result).toHaveProperty('session');
      expect(result).toHaveProperty('greeting');
    });

    it('deve iniciar sessão contextualizada com curso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 1,
        title: 'TypeScript',
        description: 'TS básico',
        modules: [],
      });
      mockPrisma.aiTutorSession.create.mockResolvedValue({ ...baseSession, courseId: 1 });
      const result = await service.startSession(1, { courseId: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve iniciar sessão contextualizada com PDI', async () => {
      mockPrisma.developmentPlan.findFirst.mockResolvedValue({
        id: 1,
        name: 'Plano 2026',
        goal: 'Tornar-se Lead',
        actions: [{ title: 'Curso TS', status: 'PENDING', type: 'COURSE' }],
      });
      mockPrisma.aiTutorSession.create.mockResolvedValue(baseSession);
      const result = await service.startSession(1, { planId: 1 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── sendMessage ──────────────────────────────────────────────

  describe('sendMessage', () => {
    it('deve enviar mensagem e receber resposta da IA', async () => {
      mockPrisma.aiTutorSession.findFirst.mockResolvedValue({
        ...baseSession,
        messages: [{ id: 1, role: 'SYSTEM', content: 'Prompt' }],
      });
      const result = await service.sendMessage(1, {
        sessionId: 'session-1',
        message: 'O que é TypeScript?',
      } as any);
      expect(result).toBeDefined();
      expect(mockAiProviders.chat).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se sessão não existe', async () => {
      mockPrisma.aiTutorSession.findFirst.mockResolvedValue(null);
      await expect(
        service.sendMessage(1, { sessionId: 'invalid', message: 'Olá' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se sessão já encerrada', async () => {
      mockPrisma.aiTutorSession.findFirst.mockResolvedValue({
        ...baseSession,
        endedAt: new Date(),
      });
      await expect(
        service.sendMessage(1, { sessionId: 'session-1', message: 'Olá' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException para mensagem vazia', async () => {
      mockPrisma.aiTutorSession.findFirst.mockResolvedValue(baseSession);
      await expect(
        service.sendMessage(1, { sessionId: 'session-1', message: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── endSession ───────────────────────────────────────────────

  describe('endSession', () => {
    it('deve encerrar sessão activa', async () => {
      mockPrisma.aiTutorSession.findFirst.mockResolvedValue(baseSession);
      mockPrisma.aiTutorSession.update.mockResolvedValue({ ...baseSession, endedAt: new Date() });
      const result = await service.endSession(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getMySessions ────────────────────────────────────────────

  describe('getMySessions', () => {
    it('deve retornar sessões do utilizador', async () => {
      mockPrisma.aiTutorSession.findMany.mockResolvedValue([baseSession]);
      const result = await service.getMySessions(1, {});
      expect(result).toBeDefined();
    });
  });

  // ─── getSession ───────────────────────────────────────────────

  describe('getSession', () => {
    it('deve retornar sessão com mensagens', async () => {
      mockPrisma.aiTutorSession.findFirst.mockResolvedValue({
        ...baseSession,
        messages: [{ id: 1, role: 'USER', content: 'Olá' }],
      });
      const result = await service.getSession(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se sessão não existe', async () => {
      mockPrisma.aiTutorSession.findFirst.mockResolvedValue(null);
      await expect(service.getSession(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── rateMessage ──────────────────────────────────────────────

  describe('rateMessage', () => {
    it('deve registar avaliação de mensagem', async () => {
      mockPrisma.aiMessage.update.mockResolvedValue({ id: 1, rating: 5 });
      const result = await service.rateMessage(1, {
        messageId: 1,
        rating: 5,
        feedback: 'Óptimo!',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getUsageStats ────────────────────────────────────────────

  describe('getUsageStats', () => {
    it('deve retornar estatísticas de uso do tutor IA', async () => {
      mockPrisma.aiTutorSession.findMany.mockResolvedValue([]);
      mockPrisma.aiMessage.count.mockResolvedValue(0);
      const result = await service.getUsageStats();
      expect(result).toBeDefined();
    });
  });
});
