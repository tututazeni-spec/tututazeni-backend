import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { LearningPathsService } from './learning-paths.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const baseLearningPath = {
  id: 1,
  title: 'Trilha Backend',
  status: 'PUBLISHED',
  courses: [],
  assignments: [],
  milestones: [],
  _count: { courses: 2, assignments: 0, enrollments: 0 },
};

const mockPrisma = {
  learningPath: {
    findUnique: makeFind(null),
    findFirst: makeFind(null),
    findMany: makeFindMany([]),
    create: makeFind(baseLearningPath),
    update: makeFind(baseLearningPath),
    count: makeCount(0),
    delete: makeFind({}),
  },
  learningPathCourse: {
    findMany: makeFindMany([]),
    findFirst: makeFind(null),
    create: makeFind({ id: 1 }),
    upsert: makeFind({ id: 1 }),
    update: makeFind({}),
    delete: makeFind({}),
    deleteMany: makeFind({ count: 0 }),
    aggregate: jest.fn().mockResolvedValue({ _sum: { durationMinutes: 120 } }),
    count: makeCount(0),
  },
  learningPathAssignment: {
    findFirst: makeFind(null),
    create: makeFind({}),
    findMany: makeFindMany([]),
    count: makeCount(0),
    createMany: makeFind({ count: 0 }),
  },
  learningPathEnrollment: {
    findFirst: makeFind(null),
    create: makeFind({ id: 1 }),
    upsert: makeFind({ id: 1 }),
    findMany: makeFindMany([]),
    update: makeFind({}),
    count: makeCount(0),
  },
  learningPathMilestone: { create: makeFind({}), findMany: makeFindMany([]) },
  course: { findUnique: makeFind(null) },
  user: { findMany: makeFindMany([]) },
  enrollment: { create: makeFind({}), findFirst: makeFind(null) },
  notificationLog: { create: makeFind({}), createMany: makeFind({ count: 0 }) },
  userPoints: { update: makeFind({}) },
};

describe('LearningPathsService — additional coverage', () => {
  let service: LearningPathsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.learningPathCourse.aggregate.mockResolvedValue({ _sum: { durationMinutes: 120 } });
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [LearningPathsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LearningPathsService>(LearningPathsService);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar trilha de aprendizagem', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(baseLearningPath);
      mockPrisma.learningPath.update.mockResolvedValue({ ...baseLearningPath, title: 'Updated' });
      mockPrisma.learningPathCourse.findMany.mockResolvedValue([]);

      const result = await service.update(1, { title: 'Updated' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar trilha com cursos', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue({
        ...baseLearningPath,
        status: 'DRAFT',
        _count: { courses: 2, assignments: 0, enrollments: 0 },
      });
      mockPrisma.learningPath.update.mockResolvedValue({
        ...baseLearningPath,
        status: 'PUBLISHED',
      });
      mockPrisma.learningPathCourse.findMany.mockResolvedValue([]);

      const result = await service.publish(1);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se sem cursos', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue({
        ...baseLearningPath,
        _count: { courses: 0, assignments: 0, enrollments: 0 },
      });

      await expect(service.publish(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── addStep ────────────────────────────────────────────────────────────

  describe('addStep', () => {
    it('deve adicionar curso à trilha', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(baseLearningPath);
      mockPrisma.course.findUnique.mockResolvedValue({ id: 5, title: 'Curso 5' });
      mockPrisma.learningPathCourse.findFirst.mockResolvedValue(null);
      mockPrisma.learningPathCourse.create.mockResolvedValue({ id: 1, courseId: 5 });
      mockPrisma.learningPathCourse.findMany.mockResolvedValue([]);

      const result = await service.addStep(1, { courseId: 5, seq: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(baseLearningPath);
      mockPrisma.course.findUnique.mockResolvedValue(null);

      await expect(service.addStep(1, { courseId: 99 } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── enroll (self-enroll) ─────────────────────────────────────────────────

  describe('enroll', () => {
    it('deve inscrever utilizador na trilha', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue({
        ...baseLearningPath,
        courses: [{ courseId: 1, course: { id: 1, title: 'Curso' } }],
      });
      mockPrisma.learningPathEnrollment.findFirst.mockResolvedValue(null);
      mockPrisma.learningPathEnrollment.create.mockResolvedValue({ id: 1, userId: 1, pathId: 1 });
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockResolvedValue({});

      const result = await service.selfEnroll(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se já inscrito', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(baseLearningPath);
      mockPrisma.learningPathEnrollment.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.selfEnroll(1, 1)).rejects.toThrow(ConflictException);
    });
  });

  // ─── findAll with filters ─────────────────────────────────────────────────

  describe('findAll with filters', () => {
    it('deve filtrar por status, level e search', async () => {
      mockPrisma.learningPath.findMany.mockResolvedValue([]);
      mockPrisma.learningPath.count.mockResolvedValue(0);

      const result = await service.findAll({
        status: 'PUBLISHED' as any,
        level: 'INTERMEDIATE' as any,
        search: 'Backend',
      });
      expect(result).toHaveProperty('data');
    });

    it('deve filtrar por mandatory e pathType', async () => {
      mockPrisma.learningPath.findMany.mockResolvedValue([]);
      mockPrisma.learningPath.count.mockResolvedValue(0);

      await service.findAll({ mandatory: true, pathType: 'ONBOARDING' as any });
      expect(mockPrisma.learningPath.findMany).toHaveBeenCalled();
    });
  });
});
