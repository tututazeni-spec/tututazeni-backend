import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AiTutorService } from './ai-tutor.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProvidersService } from './ai-providers.service';

const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);

const mockPrisma = {
  aiTutorSession: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: makeFind(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  aiMessage: { create: jest.fn(), findMany: makeFind(), count: jest.fn().mockResolvedValue(0) },
  aiTutorMemory: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  user: { findUnique: jest.fn() },
  userPoints: {
    upsert: jest.fn().mockResolvedValue({ points: 10 }),
    update: jest.fn().mockResolvedValue({}),
  },
  course: { findUnique: jest.fn() },
  enrollment: { findFirst: jest.fn(), findMany: makeFind() },
  userCompetency: { findMany: makeFind() },
  developmentPlan: { findFirst: jest.fn() },
  pdiAction: { findMany: makeFind() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseSession = {
  id: 1,
  userId: 1,
  type: 'GENERAL',
  status: 'ACTIVE',
  messages: [],
  _count: { messages: 0 },
};

describe('AiTutorService', () => {
  let service: AiTutorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiTutorService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: AiProvidersService,
          useValue: {
            complete: jest.fn().mockResolvedValue({ text: 'AI response', tokens: 10 }),
            getProviderInfo: jest.fn().mockReturnValue({ name: 'mock', model: 'mock-model' }),
          },
        },
      ],
    }).compile();
    service = module.get<AiTutorService>(AiTutorService);
  });

  describe('startSession', () => {
    it('deve iniciar sessão AI', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Test',
        userCompetencies: [],
      });
      mockPrisma.aiTutorSession.create.mockResolvedValue(baseSession);
      const result = await service.startSession(1, { type: 'GENERAL' } as any);
      expect(result).toBeDefined();
    });
  });

  describe('sendMessage', () => {
    it('deve lançar NotFoundException se sessão não encontrada', async () => {
      mockPrisma.aiTutorSession.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage(1, { sessionId: 99, message: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
