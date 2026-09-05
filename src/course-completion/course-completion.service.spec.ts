import { Test } from '@nestjs/testing';
import { CourseCompletionService } from './course-completion.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  enrollment: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  read: {
    courseModule: { findMany: jest.fn(), findUnique: jest.fn() },
    lesson: { count: jest.fn(), findUnique: jest.fn() },
    lessonProgress: { count: jest.fn() },
    quiz: { findFirst: jest.fn() },
    quizAttempt: { findFirst: jest.fn() },
  },
  lessonProgress: { upsert: jest.fn() },
  courseModule: { findUnique: jest.fn() },
  certificate: { findFirst: jest.fn(), create: jest.fn() },
  courseAnalytics: { updateMany: jest.fn() },
  userPoints: { upsert: jest.fn() },
  notificationLog: { create: jest.fn() },
};

describe('CourseCompletionService', () => {
  let service: CourseCompletionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CourseCompletionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(CourseCompletionService);
  });

  it('está definido', () => {
    expect(service).toBeDefined();
  });

  describe('isModuleCompleted', () => {
    it('ALL_LESSONS: true só quando todas as aulas estão concluídas', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 5,
        completionRule: 'ALL_LESSONS',
        minCompletionPercent: null,
        lessons: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2);
      expect(await service.isModuleCompleted(5, 10)).toBe(false);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(3);
      expect(await service.isModuleCompleted(5, 10)).toBe(true);
    });

    it('módulo sem aulas → true (nada a completar)', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 6,
        completionRule: 'ALL_LESSONS',
        lessons: [],
      });
      expect(await service.isModuleCompleted(6, 10)).toBe(true);
    });

    it('MIN_PERCENT: usa minCompletionPercent', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 7,
        completionRule: 'MIN_PERCENT',
        minCompletionPercent: 50,
        lessons: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2);
      expect(await service.isModuleCompleted(7, 10)).toBe(true);
    });

    it('módulo inexistente → false', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue(null);
      expect(await service.isModuleCompleted(999, 10)).toBe(false);
    });
  });

  describe('evaluateCompletion', () => {
    it('sem módulos PUBLISHED → fallback plano: 100% das aulas do curso', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        courseId: 20,
        status: 'IN_PROGRESS',
      });
      mockPrisma.read.courseModule.findMany.mockResolvedValue([]);
      mockPrisma.read.lesson.count.mockResolvedValue(4);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(3);
      expect(await service.evaluateCompletion(1)).toEqual({
        complete: false,
        reason: 'all-lessons',
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(4);
      expect(await service.evaluateCompletion(1)).toEqual({
        complete: true,
        reason: 'all-lessons',
      });
    });

    it('curso vazio (0 aulas, 0 módulos) → nunca completo', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        courseId: 20,
        status: 'IN_PROGRESS',
      });
      mockPrisma.read.courseModule.findMany.mockResolvedValue([]);
      mockPrisma.read.lesson.count.mockResolvedValue(0);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(0);
      expect(await service.evaluateCompletion(1)).toEqual({
        complete: false,
        reason: 'empty-course',
      });
    });

    it('com módulos mandatory → só conta os mandatory', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        courseId: 20,
        status: 'IN_PROGRESS',
      });
      mockPrisma.read.courseModule.findMany.mockResolvedValue([
        { id: 100, mandatory: true },
        { id: 101, mandatory: true },
        { id: 102, mandatory: false },
      ]);
      const spy = jest
        .spyOn(service, 'isModuleCompleted')
        .mockImplementation(async id => id === 100 || id === 101);
      expect(await service.evaluateCompletion(1)).toEqual({
        complete: true,
        reason: 'mandatory-modules',
      });
      expect(spy).toHaveBeenCalledWith(100, 10);
      expect(spy).toHaveBeenCalledWith(101, 10);
      expect(spy).not.toHaveBeenCalledWith(102, 10);
    });

    it('sem módulos mandatory → conta todos os PUBLISHED', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        courseId: 20,
        status: 'IN_PROGRESS',
      });
      mockPrisma.read.courseModule.findMany.mockResolvedValue([
        { id: 100, mandatory: false },
        { id: 101, mandatory: false },
      ]);
      jest.spyOn(service, 'isModuleCompleted').mockImplementation(async id => id === 100);
      expect(await service.evaluateCompletion(1)).toEqual({
        complete: false,
        reason: 'module-101-incomplete',
      });
    });

    it('matrícula inexistente → não completo', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      expect(await service.evaluateCompletion(999)).toEqual({
        complete: false,
        reason: 'no-enrollment',
      });
    });
  });
});
