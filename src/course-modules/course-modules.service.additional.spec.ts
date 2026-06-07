import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CourseModulesService } from './course-modules.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  course: { findUnique: jest.fn().mockResolvedValue(null) },
  courseModule: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  lesson: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  lessonProgress: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  courseMaterial: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
  },
  moduleMaterial: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
};

const baseCourse = { id: 1, title: 'Curso TypeScript', status: 'PUBLISHED' };

const baseModule = {
  id: 1, courseId: 1, title: 'Módulo 1 — Fundamentos', seq: 1, status: 'DRAFT',
  type: 'CONTENT', progressionType: 'SEQUENTIAL', completionRule: 'ALL_LESSONS',
  lessons: [], materials: [], _count: { lessons: 0 },
};

const baseModuleWithLessons = {
  ...baseModule, status: 'DRAFT',
  lessons: [{ id: 1, title: 'Lição 1', seq: 1 }],
  _count: { lessons: 1 },
};

describe('CourseModulesService (additional)', () => {
  let service: CourseModulesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CourseModulesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CourseModulesService>(CourseModulesService);
  });

  // ─── createModule ─────────────────────────────────────────────

  describe('createModule', () => {
    it('deve criar módulo para curso existente', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.courseModule.create.mockResolvedValue(baseModule);
      const result = await service.createModule({ courseId: 1, title: 'Módulo 1', seq: 1 } as any);
      expect(result).toBeDefined();
      expect(result.title).toBe('Módulo 1 — Fundamentos');
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.createModule({ courseId: 99, title: 'Módulo X', seq: 1 } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findModuleOrFail ─────────────────────────────────────────

  describe('findModuleOrFail', () => {
    it('deve retornar módulo por id', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      const result = await service.findModuleOrFail(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se módulo não existe', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(null);
      await expect(service.findModuleOrFail(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateModule ─────────────────────────────────────────────

  describe('updateModule', () => {
    it('deve actualizar módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.courseModule.update.mockResolvedValue({ ...baseModule, title: 'Módulo Actualizado' });
      const result = await service.updateModule(1, { title: 'Módulo Actualizado' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── publishModule ────────────────────────────────────────────

  describe('publishModule', () => {
    it('deve publicar módulo com lições', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModuleWithLessons);
      mockPrisma.courseModule.update.mockResolvedValue({ ...baseModuleWithLessons, status: 'PUBLISHED' });
      const result = await service.publishModule(1);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se módulo sem lições', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      await expect(service.publishModule(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── deleteModule ─────────────────────────────────────────────

  describe('deleteModule', () => {
    it('deve eliminar módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.courseModule.delete.mockResolvedValue(baseModule);
      await service.deleteModule(1);
      expect(mockPrisma.courseModule.delete).toHaveBeenCalled();
    });
  });

  // ─── reorderModules ───────────────────────────────────────────

  describe('reorderModules', () => {
    it('deve reordenar módulos do curso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.courseModule.update.mockResolvedValue(baseModule);
      const result = await service.reorderModules(1, { modules: [{ id: 1, seq: 2 }, { id: 2, seq: 1 }] } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── createLesson ─────────────────────────────────────────────

  describe('createLesson', () => {
    it('deve criar lição no módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.lesson.create.mockResolvedValue({ id: 1, moduleId: 1, title: 'Lição 1', seq: 1, textContent: 'Conteúdo' });
      const result = await service.createLesson({ moduleId: 1, title: 'Lição 1', seq: 1, textContent: 'Conteúdo' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── updateLesson ─────────────────────────────────────────────

  describe('updateLesson', () => {
    it('deve actualizar lição', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 1, title: 'Lição 1', moduleId: 1 });
      mockPrisma.lesson.update.mockResolvedValue({ id: 1, title: 'Lição Actualizada' });
      const result = await service.updateLesson(1, { title: 'Lição Actualizada' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── deleteLesson ─────────────────────────────────────────────

  describe('deleteLesson', () => {
    it('deve eliminar lição', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 1, moduleId: 1 });
      mockPrisma.lesson.delete.mockResolvedValue({});
      await service.deleteLesson(1);
      expect(mockPrisma.lesson.delete).toHaveBeenCalled();
    });
  });

  // ─── markLessonComplete ───────────────────────────────────────

  describe('markLessonComplete', () => {
    it('deve marcar lição como completa para utilizador inscrito', async () => {
      const fullLesson = {
        id: 1, moduleId: 1,
        module: { id: 1, courseId: 1, status: 'PUBLISHED', seq: 0,
          progressionType: 'FREE', dripDays: null, availableFrom: null,
          course: { id: 1 } },
      };
      mockPrisma.lesson.findUnique.mockResolvedValue(fullLesson);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1, userId: 1, courseId: 1, status: 'IN_PROGRESS', enrolledAt: new Date() });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({ id: 1, completed: true });
      mockPrisma.courseModule.findUnique.mockResolvedValue({ id: 1, completionRule: 'ALL_LESSONS', lessons: [{ id: 1 }] });
      mockPrisma.lessonProgress.count.mockResolvedValue(1);
      mockPrisma.enrollment.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.courseModule.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.courseModule.findFirst = jest.fn().mockResolvedValue(null);
      const result = await service.markLessonComplete(1, { lessonId: 1, watchedSeconds: 300 });
      expect(result).toBeDefined();
    });
  });

  // ─── addMaterial ──────────────────────────────────────────────

  describe('addMaterial', () => {
    it('deve adicionar material ao módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.courseMaterial.create.mockResolvedValue({ id: 1, moduleId: 1, title: 'PDF Fundamentos' });
      const result = await service.addMaterial(1, { title: 'PDF Fundamentos', url: '/files/fund.pdf', type: 'PDF' as any } as any);
      expect(result).toBeDefined();
    });
  });
});
