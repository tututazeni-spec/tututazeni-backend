import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TrainerService } from './trainers.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  trainingInstructorProfile: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  training: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  trainingSession: { count: jest.fn().mockResolvedValue(0) },
  trainingRating: { aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null } }) },
};

const baseTrainer = {
  id: 1,
  type: 'EXTERNAL',
  userId: null,
  name: 'João Formador',
  entity: 'Academia XPTO',
};

describe('TrainerService', () => {
  let service: TrainerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainerService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainerService>(TrainerService);
  });

  describe('findAll', () => {
    it('devolve formadores paginados', async () => {
      mockPrisma.trainingInstructorProfile.findMany.mockResolvedValue([baseTrainer]);
      mockPrisma.trainingInstructorProfile.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result.data).toEqual([baseTrainer]);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('lança NotFoundException quando não existe', async () => {
      mockPrisma.trainingInstructorProfile.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });

    it('calcula estatísticas a partir das Training ligadas (externo)', async () => {
      mockPrisma.trainingInstructorProfile.findUnique.mockResolvedValue(baseTrainer);
      mockPrisma.training.findMany.mockResolvedValue([
        {
          id: 10,
          title: 'Formação X',
          status: 'PUBLISHED',
          workloadHours: 4,
          _count: { sessions: 2 },
        },
      ]);
      mockPrisma.trainingSession.count.mockResolvedValue(2);
      mockPrisma.trainingRating.aggregate.mockResolvedValue({ _avg: { rating: 4.5 } });

      const result = await service.findOne(1);
      expect(result.stats).toEqual({
        trainingsAssigned: 1,
        sessionsAssigned: 2,
        hoursMinistered: 4,
        avgRating: 4.5,
      });
    });
  });

  describe('create', () => {
    it('cria um formador externo', async () => {
      mockPrisma.trainingInstructorProfile.create.mockResolvedValue(baseTrainer);
      const result = await service.create({ type: 'EXTERNAL', name: 'João Formador' } as any);
      expect(result).toEqual(baseTrainer);
      expect(mockPrisma.trainingInstructorProfile.create).toHaveBeenCalled();
    });

    it('rejeita userId já ligado a outro perfil', async () => {
      mockPrisma.trainingInstructorProfile.findUnique.mockResolvedValue({ id: 2, userId: 5 });
      await expect(
        service.create({ type: 'INTERNAL', name: 'X', userId: 5 } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('bloqueia eliminação com formações atribuídas', async () => {
      mockPrisma.trainingInstructorProfile.findUnique.mockResolvedValue(baseTrainer);
      mockPrisma.training.count.mockResolvedValue(2);
      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });

    it('elimina formador sem formações atribuídas', async () => {
      mockPrisma.trainingInstructorProfile.findUnique.mockResolvedValue(baseTrainer);
      mockPrisma.training.count.mockResolvedValue(0);
      const result = await service.remove(1);
      expect(result).toEqual({ message: 'Formador eliminado' });
      expect(mockPrisma.trainingInstructorProfile.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });
});
