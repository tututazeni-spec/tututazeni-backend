import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TrainingService as TrainingsService } from './trainings.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const baseTraining = {
  id: 1,
  title: 'Formação Teste',
  status: 'PUBLISHED',
  type: 'ONLINE',
  _count: { participants: 0, sessions: 1, ratings: 0 },
};

const baseSession = {
  id: 1,
  trainingId: 1,
  maxParticipants: 10,
  waitlistEnabled: true,
  _count: { participants: 3 },
};

const mockPrisma = {
  training: {
    findUnique: makeFind(baseTraining),
    findFirst: makeFind(null),
    findMany: makeFindMany([]),
    create: makeFind(baseTraining),
    update: makeFind(baseTraining),
    count: makeCount(0),
    delete: makeFind({}),
  },
  trainingParticipant: {
    findFirst: makeFind(null),
    create: makeFind({ id: 1, userId: 1, sessionId: 1, status: 'CONFIRMED' }),
    findMany: makeFindMany([]),
    update: makeFind({}),
    count: makeCount(0),
    delete: makeFind({}),
    createMany: makeFind({ count: 0 }),
  },
  trainingSession: {
    findMany: makeFindMany([]),
    create: makeFind({ id: 1 }),
    count: makeCount(0),
    findUnique: makeFind(null),
    update: makeFind({}),
    delete: makeFind({}),
  },
  trainingRating: {
    upsert: makeFind({}),
    aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 } }),
  },
  certificate: { create: makeFind({}) },
  notificationLog: { create: makeFind({}) },
  userPoints: { update: makeFind({}) },
};

describe('TrainingsService — additional coverage', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar formação', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(baseTraining);
      mockPrisma.training.update.mockResolvedValue({ ...baseTraining, title: 'Updated' });

      const result = await service.update(1, { title: 'Updated' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── archive ──────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('deve arquivar formação', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(baseTraining);
      mockPrisma.training.update.mockResolvedValue({ ...baseTraining, status: 'ARCHIVED' });

      const result = await service.archive(1);
      expect(result).toBeDefined();
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deve eliminar formação sem participantes', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({
        ...baseTraining,
        _count: { participants: 0, sessions: 0, ratings: 0 },
      });
      mockPrisma.training.delete.mockResolvedValue({});

      const result = await service.remove(1);
      expect(result).toHaveProperty('message');
    });

    it('deve lançar ForbiddenException se publicada com participantes', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({
        ...baseTraining,
        status: 'PUBLISHED',
        _count: { participants: 5, sessions: 1, ratings: 0 },
      });

      await expect(service.remove(1)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── createSession ────────────────────────────────────────────────────────

  describe('createSession', () => {
    it('deve criar sessão de formação', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(baseTraining);
      mockPrisma.trainingSession.create.mockResolvedValue({ id: 1, trainingId: 1 });

      const result = await service.createSession({
        trainingId: 1,
        sessionDate: new Date().toISOString(),
        durationMinutes: 90,
        modality: 'ONLINE',
      } as any);

      expect(result).toBeDefined();
    });
  });

  // ─── registerParticipant ──────────────────────────────────────────────────

  describe('registerParticipant', () => {
    it('deve inscrever participante na sessão', async () => {
      mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        ...baseSession,
        maxParticipants: 20,
        _count: { participants: 5 },
      });
      mockPrisma.trainingParticipant.create.mockResolvedValue({ id: 1, status: 'CONFIRMED' });

      const result = await service.registerParticipant({
        sessionId: 1,
        userId: 1,
      } as any);

      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se já inscrito', async () => {
      mockPrisma.trainingParticipant.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.registerParticipant({ sessionId: 1, userId: 1 } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── rateTraining ─────────────────────────────────────────────────────────

  describe('rateTraining', () => {
    it('deve registar avaliação da formação', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(baseTraining);
      mockPrisma.trainingRating.upsert.mockResolvedValue({ id: 1, rating: 5 });

      const result = await service.rateTraining(1, {
        trainingId: 1,
        rating: 5,
        comment: 'Excelente',
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se formação não encontrada', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(null);

      await expect(service.rateTraining(1, { trainingId: 99, rating: 5 } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findAll with filters ─────────────────────────────────────────────────

  describe('findAll with filters', () => {
    it('deve filtrar por tipo, level e search', async () => {
      mockPrisma.training.findMany.mockResolvedValue([]);
      mockPrisma.training.count.mockResolvedValue(0);

      const result = await service.findAll({
        type: 'ONLINE' as any,
        level: 'BEGINNER' as any,
        search: 'NestJS',
        mandatory: true,
      });
      expect(result).toHaveProperty('data');
    });
  });
});
