// src/course-modules/course-modules.service.progress.spec.ts
// Cobre métodos não testados: cloneModule, moveLesson, reorderLessons, removeMaterial,
// isModuleCompleted (MIN_PERCENT, QUIZ_PASS, COMBINED), markLessonComplete (acessível/bloqueado),
// getLessonProgress, getModuleAnalytics, deleteModule com progresso

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CourseModulesService } from './course-modules.service';
import { PrismaService } from '../prisma/prisma.service';

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { watchedSeconds: null } }),
    upsert: jest.fn().mockResolvedValue({}),
  });

  return {
    course: crud(),
    courseModule: crud(),
    lesson: crud(),
    lessonProgress: crud(),
    moduleMaterial: crud(),
    notificationLog: crud(),
    enrollment: crud(),
    userPoints: crud(),
    courseAnalytics: crud(),
    quiz: crud(),
    quizAttempt: crud(),
  };
}

const baseModule = {
  id: 1, courseId: 10, title: 'Módulo Base', seq: 1, status: 'PUBLISHED',
  progressionType: 'SEQUENTIAL', completionRule: 'ALL_LESSONS',
  minCompletionPercent: 100, mandatory: true, dripDays: null, availableFrom: null,
  lessons: [{ id: 5, title: 'Aula 1', progress: [] }],
  materials: [],
  _count: { lessons: 1 },
};

const baseLesson = {
  id: 5, moduleId: 1, title: 'Aula 1', seq: 1, type: 'VIDEO',
  module: {
    id: 1, courseId: 10, status: 'PUBLISHED', seq: 1,
    progressionType: 'FREE', dripDays: null, availableFrom: null,
    course: { id: 10, title: 'Curso Base' },
  },
};

describe('CourseModulesService (progress)', () => {
  let service: CourseModulesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CourseModulesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<CourseModulesService>(CourseModulesService);
  });

  // ─── deleteModule com progresso ─────────────────────────────────────────────

  describe('deleteModule', () => {
    it('deve lançar ForbiddenException se há progresso activo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.lessonProgress.count.mockResolvedValue(5);
      await expect(service.deleteModule(1)).rejects.toThrow(ForbiddenException);
    });

    it('deve eliminar módulo sem progresso', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.courseModule.delete.mockResolvedValue({});
      const result = await service.deleteModule(1) as any;
      expect(result.message).toContain('eliminado');
    });
  });

  // ─── cloneModule ─────────────────────────────────────────────────────────────

  describe('cloneModule', () => {
    it('deve clonar módulo com lições e materiais', async () => {
      const originalMod = {
        ...baseModule,
        lessons: [
          { id: 5, title: 'Aula 1', type: 'VIDEO', textContent: 'texto', contentUrl: null,
            description: null, seq: 1, durationMinutes: 10, isFree: false, allowDownload: false },
        ],
        materials: [
          { id: 1, title: 'Mat 1', url: 'http://x.com', fileType: 'PDF', fileSizeKb: 100 },
        ],
      };

      mockPrisma.courseModule.findUnique.mockResolvedValue(originalMod);
      mockPrisma.course.findUnique.mockResolvedValue({ id: 20, title: 'Curso Destino' });
      mockPrisma.courseModule.findFirst
        .mockResolvedValueOnce({ seq: 3 }) // maxSeq
        .mockResolvedValueOnce(null);       // findModuleOrFail após clone → null → NotFoundException
      mockPrisma.courseModule.create.mockResolvedValue({ id: 99, ...baseModule });

      // findModuleOrFail (chamado no final de cloneModule) → retorna o clone
      mockPrisma.courseModule.findUnique
        .mockResolvedValueOnce(originalMod)  // primeira chamada (findModuleOrFail no início)
        .mockResolvedValueOnce({ id: 99, ...baseModule, _count: { lessons: 1 }, lessons: [], materials: [] }); // segunda (no final)

      mockPrisma.lesson.create.mockResolvedValue({ id: 50 });
      mockPrisma.moduleMaterial.create.mockResolvedValue({ id: 10 });

      const result = await service.cloneModule(1, { targetCourseId: 20 }) as any;
      expect(result).toBeDefined();
      expect(mockPrisma.courseModule.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.lesson.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.moduleMaterial.create).toHaveBeenCalledTimes(1);
    });

    it('deve lançar NotFoundException se módulo original não existe', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(null);
      await expect(service.cloneModule(99, { targetCourseId: 20 })).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se curso destino não existe', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.cloneModule(1, { targetCourseId: 99 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── moveLesson ───────────────────────────────────────────────────────────────

  describe('moveLesson', () => {
    it('deve mover lição para outro módulo', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 5, moduleId: 1 });
      mockPrisma.courseModule.findUnique.mockResolvedValue({ id: 2, title: 'Módulo 2' });
      mockPrisma.lesson.update.mockResolvedValue({ id: 5, moduleId: 2, seq: 1 });
      const result = await service.moveLesson(5, { targetModuleId: 2, seq: 1 }) as any;
      expect(result.moduleId).toBe(2);
    });

    it('deve lançar NotFoundException se lição não existe', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.moveLesson(99, { targetModuleId: 2, seq: 1 })).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se módulo destino não existe', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 5, moduleId: 1 });
      mockPrisma.courseModule.findUnique.mockResolvedValue(null);
      await expect(service.moveLesson(5, { targetModuleId: 99, seq: 1 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── reorderLessons ───────────────────────────────────────────────────────────

  describe('reorderLessons', () => {
    it('deve reordenar aulas do módulo', async () => {
      mockPrisma.lesson.update.mockResolvedValue({});
      mockPrisma.lesson.findMany.mockResolvedValue([
        { id: 1, seq: 1 }, { id: 2, seq: 2 },
      ]);
      const result = await service.reorderLessons(1, [{ id: 1, seq: 1 }, { id: 2, seq: 2 }]);
      expect(Array.isArray(result)).toBe(true);
      expect(mockPrisma.lesson.update).toHaveBeenCalledTimes(2);
    });
  });

  // ─── removeMaterial ───────────────────────────────────────────────────────────

  describe('removeMaterial', () => {
    it('deve remover material do módulo', async () => {
      mockPrisma.moduleMaterial.findUnique.mockResolvedValue({ id: 1, moduleId: 1 });
      mockPrisma.moduleMaterial.delete.mockResolvedValue({ id: 1 });
      const result = await service.removeMaterial(1) as any;
      expect(result.id).toBe(1);
    });

    it('deve lançar NotFoundException se material não existe', async () => {
      mockPrisma.moduleMaterial.findUnique.mockResolvedValue(null);
      await expect(service.removeMaterial(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── isModuleCompleted ─────────────────────────────────────────────────────────

  describe('isModuleCompleted', () => {
    it('deve retornar true se não há aulas (MIN_PERCENT com 0 aulas)', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'ALL_LESSONS',
        lessons: [],
      });
      const result = await service.isModuleCompleted(1, 1);
      expect(result).toBe(true);
    });

    it('deve calcular regra MIN_PERCENT (70% completo)', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'MIN_PERCENT', minCompletionPercent: 50,
        lessons: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(3); // 3/4 = 75% >= 50%
      const result = await service.isModuleCompleted(1, 1);
      expect(result).toBe(true);
    });

    it('deve retornar false com MIN_PERCENT insuficiente', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'MIN_PERCENT', minCompletionPercent: 80,
        lessons: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(2); // 2/4 = 50% < 80%
      const result = await service.isModuleCompleted(1, 1);
      expect(result).toBe(false);
    });

    it('deve retornar true com QUIZ_PASS quando quiz passou', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'QUIZ_PASS',
        lessons: [{ id: 1 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.quiz.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.quizAttempt.findFirst.mockResolvedValue({ id: 1, passed: true });
      const result = await service.isModuleCompleted(1, 1);
      expect(result).toBe(true);
    });

    it('deve retornar false com QUIZ_PASS quando quiz não passou', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'QUIZ_PASS',
        lessons: [{ id: 1 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.quiz.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.quizAttempt.findFirst.mockResolvedValue(null);
      const result = await service.isModuleCompleted(1, 1);
      expect(result).toBe(false);
    });

    it('deve usar fallback ALL_LESSONS quando QUIZ_PASS sem quiz', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'QUIZ_PASS',
        lessons: [{ id: 1 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(1);
      mockPrisma.quiz.findFirst.mockResolvedValue(null); // sem quiz
      const result = await service.isModuleCompleted(1, 1);
      expect(result).toBe(true); // completedCount(1) >= totalLessons(1)
    });

    it('deve calcular regra COMBINED (lições + quiz)', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'COMBINED', minCompletionPercent: 80,
        lessons: [{ id: 1 }, { id: 2 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(2); // 100% >= 80%
      mockPrisma.quiz.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.quizAttempt.findFirst.mockResolvedValue({ id: 1, passed: true });
      const result = await service.isModuleCompleted(1, 1);
      expect(result).toBe(true);
    });

    it('deve retornar false com regra desconhecida', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'UNKNOWN_RULE',
        lessons: [{ id: 1 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(1);
      const result = await service.isModuleCompleted(1, 1);
      expect(result).toBe(false);
    });
  });

  // ─── markLessonComplete ───────────────────────────────────────────────────────

  describe('markLessonComplete', () => {
    it('deve lançar ForbiddenException se aula inacessível (módulo não publicado)', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        ...baseLesson,
        module: { ...baseLesson.module, status: 'DRAFT' },
      });
      await expect(service.markLessonComplete(1, { lessonId: 5, watchedSeconds: 60 }))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException se utilizador não está inscrito', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(baseLesson);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null); // não inscrito
      await expect(service.markLessonComplete(1, { lessonId: 5 }))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve marcar aula como completa (módulo FREE, inscrito)', async () => {
      // isLessonAccessible: lesson encontrada, módulo PUBLISHED, FREE, inscrito
      mockPrisma.lesson.findUnique.mockResolvedValue(baseLesson);
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        id: 1, userId: 1, courseId: 10, status: 'IN_PROGRESS', enrolledAt: new Date(),
      });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({ id: 1, completed: true });
      // isModuleCompleted: courseModule.findUnique retorna módulo com lições
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'ALL_LESSONS',
        lessons: [{ id: 5 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(1); // 1/1 = 100%
      // checkAndCompleteCourse: enrollment já exists, mandatory modules
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 1, status: 'IN_PROGRESS',
      });
      mockPrisma.courseModule.findMany.mockResolvedValue([{ id: 1 }]); // 1 mandatory module
      // notifyNextModuleUnlock
      mockPrisma.courseModule.findFirst.mockResolvedValue(null); // no next module
      // checkAndCompleteCourse → update enrollment
      mockPrisma.enrollment.update.mockResolvedValue({});
      mockPrisma.courseAnalytics.updateMany.mockResolvedValue({});
      mockPrisma.userPoints.upsert.mockResolvedValue({});
      mockPrisma.course.findUnique.mockResolvedValue({ id: 10, title: 'Curso Base' });

      const result = await service.markLessonComplete(1, { lessonId: 5, watchedSeconds: 300 }) as any;
      expect(result.progress).toBeDefined();
      expect(result.moduleCompleted).toBe(true);
    });
  });

  // ─── getLessonProgress ────────────────────────────────────────────────────────

  describe('getLessonProgress', () => {
    it('deve retornar progresso por módulo sem aulas', async () => {
      mockPrisma.courseModule.findMany.mockResolvedValue([]);
      const result = await service.getLessonProgress(1, 10);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('deve retornar progresso com módulo livre e aulas', async () => {
      const modWithLessons = {
        id: 1, title: 'Módulo 1', seq: 1, type: 'CONTENT', mandatory: true,
        progressionType: 'FREE', dripDays: null, availableFrom: null,
        materials: [],
        lessons: [
          { id: 5, title: 'Aula 1', type: 'VIDEO', seq: 1, durationMinutes: 10, isFree: false,
            progress: [{ completed: true, completedAt: new Date(), resumePosition: 30 }] },
        ],
      };
      mockPrisma.courseModule.findMany.mockResolvedValue([modWithLessons]);
      // isModuleCompleted: courseModule.findUnique
      mockPrisma.courseModule.findUnique.mockResolvedValue({
        id: 1, completionRule: 'ALL_LESSONS',
        lessons: [{ id: 5 }],
      });
      mockPrisma.lessonProgress.count.mockResolvedValue(1);

      const result = await service.getLessonProgress(1, 10) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].completedCount).toBe(1);
      expect(result[0].pct).toBe(100);
      expect(result[0].completed).toBe(true);
    });

    it('deve marcar módulo como bloqueado (SEQUENTIAL sem módulo anterior completo)', async () => {
      const modWithLessons = {
        id: 2, title: 'Módulo 2', seq: 2, type: 'CONTENT', mandatory: true,
        progressionType: 'SEQUENTIAL', dripDays: null, availableFrom: null,
        materials: [],
        lessons: [
          { id: 10, title: 'Aula 2', type: 'VIDEO', seq: 1, durationMinutes: 5, isFree: false,
            progress: [] },
        ],
      };
      mockPrisma.courseModule.findMany.mockResolvedValue([modWithLessons]);

      // isModuleCompleted for module 2
      mockPrisma.courseModule.findUnique
        .mockResolvedValueOnce({ id: 2, completionRule: 'ALL_LESSONS', lessons: [{ id: 10 }] })
        // isLessonAccessible for lesson 10: lesson found with module 2 (SEQUENTIAL, seq=2)
        .mockResolvedValueOnce({ id: 2, completionRule: 'ALL_LESSONS', lessons: [{ id: 10 }] })
        // previous module check
        .mockResolvedValueOnce({ id: 1, completionRule: 'ALL_LESSONS', lessons: [{ id: 5 }] });

      // isLessonAccessible: lesson found
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 10, moduleId: 2,
        module: { id: 2, courseId: 10, status: 'PUBLISHED', seq: 2, progressionType: 'SEQUENTIAL',
          dripDays: null, availableFrom: null, course: { id: 10 } },
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1, enrolledAt: new Date() });
      // previous module (seq=1) not completed
      mockPrisma.courseModule.findFirst.mockResolvedValue({ id: 1, seq: 1 });
      mockPrisma.lessonProgress.count
        .mockResolvedValueOnce(0) // module 2 isModuleCompleted: 0/1
        .mockResolvedValueOnce(0); // previous module isModuleCompleted: 0/1

      const result = await service.getLessonProgress(1, 10) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].locked).toBe(true);
    });
  });

  // ─── getModuleAnalytics ───────────────────────────────────────────────────────

  describe('getModuleAnalytics', () => {
    it('deve retornar analytics do módulo sem dados', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.lesson.findMany.mockResolvedValue([]);
      mockPrisma.lessonProgress.groupBy.mockResolvedValue([]);
      mockPrisma.lessonProgress.aggregate.mockResolvedValue({ _avg: { watchedSeconds: null } });
      const result = await service.getModuleAnalytics(1) as any;
      expect(result.moduleId).toBe(1);
      expect(result.totalEnrollments).toBe(0);
      expect(result.totalCompleted).toBe(0);
      expect(result.completionRate).toBe(0);
    });

    it('deve calcular analytics com dados de progresso', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(baseModule);
      mockPrisma.lesson.findMany.mockResolvedValue([
        { id: 5, title: 'Aula 1' },
        { id: 6, title: 'Aula 2' },
      ]);
      // groupBy por userId: 3 utilizadores acederam
      mockPrisma.lessonProgress.groupBy
        .mockResolvedValueOnce([{ userId: 1, _count: 2 }, { userId: 2, _count: 2 }, { userId: 3, _count: 1 }])
        // completed groupBy: 2 utilizadores completaram as 2 aulas
        .mockResolvedValueOnce([{ userId: 1, _count: 2 }, { userId: 2, _count: 2 }]);
      mockPrisma.lessonProgress.aggregate.mockResolvedValue({ _avg: { watchedSeconds: 120 } });
      mockPrisma.lessonProgress.count
        .mockResolvedValueOnce(3)  // aula 5 completions
        .mockResolvedValueOnce(2); // aula 6 completions
      const result = await service.getModuleAnalytics(1) as any;
      expect(result.totalEnrollments).toBe(3);
      expect(result.totalCompleted).toBe(2);
      expect(result.completionRate).toBe(67); // 2/3 = 66.7 → 67
      expect(result.avgWatchedSeconds).toBe(120);
      expect(result.lessonStats).toHaveLength(2);
    });

    it('deve lançar NotFoundException se módulo não existe', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(null);
      await expect(service.getModuleAnalytics(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteLesson com progresso ───────────────────────────────────────────────

  describe('deleteLesson', () => {
    it('deve eliminar aula e informar hadProgress=true quando havia progresso', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 5, moduleId: 1 });
      mockPrisma.lessonProgress.count.mockResolvedValue(3);
      mockPrisma.lesson.delete.mockResolvedValue({});
      const result = await service.deleteLesson(5) as any;
      expect(result.hadProgress).toBe(true);
      expect(result.progressCount).toBe(3);
    });

    it('deve eliminar aula sem progresso', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 5, moduleId: 1 });
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.lesson.delete.mockResolvedValue({});
      const result = await service.deleteLesson(5) as any;
      expect(result.hadProgress).toBe(false);
    });
  });
});
