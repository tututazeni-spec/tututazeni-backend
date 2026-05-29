import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CourseModulesService } from './course-modules.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  courseModule: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  lesson: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  lessonProgress: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  moduleMaterial: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  },
  quiz: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  quizAttempt: { findFirst: jest.fn(), create: jest.fn() },
  enrollment: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  course: { findUnique: jest.fn() },
  courseAnalytics: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseMod = {
  id: 1,
  courseId: 1,
  title: 'Módulo 1',
  seq: 1,
  status: 'DRAFT',
  lessons: [],
  _count: { lessons: 3 },
};

describe('CourseModulesService', () => {
  let service: CourseModulesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CourseModulesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CourseModulesService>(CourseModulesService);
  });

  describe('createModule', () => {
    it('deve criar módulo', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: 1, title: 'Curso' });
      mockPrisma.courseModule.count.mockResolvedValue(0);
      mockPrisma.courseModule.create.mockResolvedValue(baseMod);
      const result = await service.createModule({ courseId: 1, title: 'Módulo 1' } as any);
      expect(result).toBeDefined();
    });
  });

  describe('findModuleOrFail', () => {
    it('deve lançar NotFoundException', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(null);
      await expect(service.findModuleOrFail(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('publishModule', () => {
    it('deve lançar BadRequestException se sem lições', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({ ...baseMod, _count: { lessons: 0 } });
      await expect(service.publishModule(1)).rejects.toThrow(BadRequestException);
    });
  });
});
