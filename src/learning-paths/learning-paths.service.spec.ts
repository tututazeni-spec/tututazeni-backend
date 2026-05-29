import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { LearningPathsService } from './learning-paths.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  learningPath: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  learningPathCourse: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
  },
  learningPathAssignment: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
  },
  learningPathEnrollment: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  learningPathMilestone: { create: jest.fn(), findMany: jest.fn() },
  course: { findUnique: jest.fn() },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  enrollment: { create: jest.fn(), findFirst: jest.fn() },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const baseLearningPath = {
  id: 1,
  title: 'Trilha Backend',
  description: 'Trilha de desenvolvimento backend',
  status: 'DRAFT',
  courses: [],
  assignments: [],
  milestones: [],
  _count: { assignments: 0, courses: 3 },
};

describe('LearningPathsService', () => {
  let service: LearningPathsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.learningPathCourse.aggregate.mockResolvedValue({ _sum: { durationMinutes: 0 } });
    mockPrisma.learningPathCourse.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [LearningPathsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LearningPathsService>(LearningPathsService);
  });

  describe('findAll', () => {
    it('deve retornar trilhas paginadas', async () => {
      mockPrisma.learningPath.findMany.mockResolvedValue([baseLearningPath]);
      mockPrisma.learningPath.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('deve retornar trilha por id', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(baseLearningPath);
      const result = await service.findOne(1);
      expect(result.title).toBe('Trilha Backend');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar trilha', async () => {
      mockPrisma.learningPath.create.mockResolvedValue(baseLearningPath);
      mockPrisma.learningPath.update.mockResolvedValue(baseLearningPath);
      mockPrisma.learningPath.findUnique.mockResolvedValue(baseLearningPath);
      mockPrisma.learningPathCourse.aggregate.mockResolvedValue({ _sum: { durationMinutes: 120 } });

      const result = await service.create({ title: 'Trilha Backend', description: 'Desc' } as any);
      expect(result.title).toBe('Trilha Backend');
    });
  });

  describe('publish', () => {
    it('deve lançar BadRequestException se sem cursos', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue({
        ...baseLearningPath,
        _count: { ...baseLearningPath._count, courses: 0 },
      });
      await expect(service.publish(1)).rejects.toThrow(BadRequestException);
    });
  });
});
