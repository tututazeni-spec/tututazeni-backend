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

    it('deve publicar módulo com lições', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({ ...baseMod, _count: { lessons: 3 } });
      mockPrisma.courseModule.update.mockResolvedValue({ ...baseMod, status: 'PUBLISHED' });
      const result = await service.publishModule(1);
      expect(result).toBeDefined();
    });
  });

  // ─── updateModule ─────────────────────────────────────────────────────────

  describe('updateModule', () => {
    it('deve actualizar módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseMod);
      mockPrisma.courseModule.update.mockResolvedValue({ ...baseMod, title: 'Actualizado' });
      const result = await service.updateModule(1, { title: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── deleteModule ─────────────────────────────────────────────────────────

  describe('deleteModule', () => {
    it('deve eliminar módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseMod);
      mockPrisma.courseModule.update.mockResolvedValue({});
      const result = await service.deleteModule(1);
      expect(result).toBeDefined();
    });
  });

  // ─── reorderModules ───────────────────────────────────────────────────────

  describe('reorderModules', () => {
    it('deve reordenar módulos', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.courseModule.updateMany = jest.fn().mockResolvedValue({});
      const result = await service.reorderModules(1, {
        order: [{ id: 1, seq: 2 }, { id: 2, seq: 1 }],
      });
      expect(result).toBeDefined();
    });
  });

  // ─── createLesson ─────────────────────────────────────────────────────────

  describe('createLesson', () => {
    it('deve criar lição num módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseMod);
      mockPrisma.lesson.count.mockResolvedValue(2);
      mockPrisma.lesson.create.mockResolvedValue({
        id: 1,
        title: 'Lição 1',
        textContent: 'Conteúdo',
      });
      const result = await service.createLesson({
        moduleId: 1,
        title: 'Lição 1',
        textContent: 'Conteúdo',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── markLessonComplete ───────────────────────────────────────────────────

  describe('markLessonComplete', () => {
    it('deve marcar lição como completa', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 1,
        moduleId: 1,
        courseId: 1,
        module: { courseId: 1 },
      });
      const result = await service.markLessonComplete(1, { lessonId: 1, courseId: 1 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getLessonProgress ────────────────────────────────────────────────────

  describe('getLessonProgress', () => {
    it('deve retornar progresso por lição', async () => {
      mockPrisma.courseModule.findMany.mockResolvedValue([]);
      const result = await service.getLessonProgress(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getModuleAnalytics ───────────────────────────────────────────────────

  describe('getModuleAnalytics', () => {
    it('deve retornar analytics do módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        ...baseMod,
        lessons: [],
        _count: { lessons: 0 },
      });
      const result = await service.getModuleAnalytics(1);
      expect(result).toBeDefined();
    });
  });
});
