import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';

const baseCourse = {
  id: 1,
  title: 'Curso Teste',
  status: 'PUBLISHED',
  internalCode: 'C001',
  mandatory: false,
  modules: [
    {
      id: 1,
      courseId: 1,
      title: 'Módulo 1',
      seq: 0,
      lessons: [{ id: 10, title: 'Aula 1', type: 'VIDEO', seq: 0, progress: [] }],
    },
  ],
  feedbacks: [],
  department: null,
  competencies: [],
  certificateValidityDays: null,
  _count: { enrollments: 1, feedbacks: 0, modules: 1 },
};

const baseEnrollment = {
  id: 100,
  courseId: 1,
  userId: 1,
  status: 'IN_PROGRESS',
  enrolledAt: new Date(),
  startedAt: new Date(),
  completedAt: null,
  deadline: null,
};

const mockPrisma: any = {
  course: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  courseModule: {
    create: jest.fn().mockResolvedValue({ id: 2 }),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  lesson: {
    create: jest.fn().mockResolvedValue({ id: 11 }),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(5),
  },
  lessonProgress: {
    upsert: jest.fn().mockResolvedValue({ lessonId: 10, userId: 1, completed: true }),
    count: jest.fn().mockResolvedValue(3),
  },
  enrollment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  certificate: {
    create: jest.fn().mockResolvedValue({ id: 'cert-1', validationCode: 'CERT-1-1-123' }),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  courseAnalytics: {
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
    findFirst: jest
      .fn()
      .mockResolvedValue({ totalEnrollments: 5, totalCompleted: 2, avgRating: 4.2 }),
  },
  quiz: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  quizQuestion: {
    createMany: jest.fn().mockResolvedValue({ count: 2 }),
  },
  quizAttempt: {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({ id: 'att-1', score: 80, passed: true }),
  },
  courseFeedback: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.0 }, _count: 5 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

describe('CoursesService (progress & quiz & analytics)', () => {
  let service: CoursesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
    mockPrisma.enrollment.findFirst.mockResolvedValue(baseEnrollment);
    mockPrisma.enrollment.findUnique.mockResolvedValue({
      ...baseEnrollment,
      status: 'IN_PROGRESS',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [CoursesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CoursesService>(CoursesService);
  });

  // ─── duplicate ────────────────────────────────────────────────────────────

  describe('duplicate', () => {
    it('deve duplicar curso com módulos e aulas', async () => {
      mockPrisma.course.create.mockResolvedValue({
        ...baseCourse,
        id: 2,
        title: 'Curso Teste (cópia)',
      });
      const result = await service.duplicate(1);
      expect(result.title).toContain('cópia');
      expect(mockPrisma.courseModule.create).toHaveBeenCalled();
      expect(mockPrisma.courseAnalytics.create).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.duplicate(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── markLessonComplete ───────────────────────────────────────────────────

  describe('markLessonComplete', () => {
    it('deve marcar aula como concluída', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 10,
        module: { courseId: 1, id: 1 },
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);

      const result = await service.markLessonComplete(10, 1, {
        watchedSeconds: 120,
        resumePosition: 0,
      });
      expect(result).toHaveProperty('progress');
      expect(result).toHaveProperty('courseProgress');
      expect(result.courseProgress.pct).toBe(60);
    });

    it('deve completar curso se 100% das aulas concluídas', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 10,
        module: { courseId: 1, id: 1 },
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        ...baseEnrollment,
        status: 'IN_PROGRESS',
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'IN_PROGRESS',
      });
      mockPrisma.lesson.count.mockResolvedValue(3);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);
      mockPrisma.course.findUnique.mockResolvedValue({
        ...baseCourse,
        certificateValidityDays: 365,
      });

      const result = await service.markLessonComplete(10, 1, { watchedSeconds: 300 });
      expect(result.courseProgress.pct).toBe(100);
      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });

    it('deve actualizar status para IN_PROGRESS se estava NOT_STARTED', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 10, module: { courseId: 1, id: 1 } });
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        ...baseEnrollment,
        status: 'NOT_STARTED',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(1);

      await service.markLessonComplete(10, 1, {});
      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
      );
    });

    it('deve lançar NotFoundException se aula não existe', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.markLessonComplete(99, 1, {})).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se não matriculado', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 10, module: { courseId: 1 } });
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(service.markLessonComplete(10, 99, {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getCourseProgress ────────────────────────────────────────────────────

  describe('getCourseProgress', () => {
    it('deve retornar null se não matriculado', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      const result = await service.getCourseProgress(1, 99);
      expect(result).toBeNull();
    });

    it('deve retornar progresso do curso com módulos', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(2);
      mockPrisma.courseModule.findMany.mockResolvedValue([
        {
          id: 1,
          title: 'Módulo 1',
          seq: 0,
          lessons: [
            { id: 10, title: 'Aula 1', type: 'VIDEO', seq: 0, progress: [{ completed: true }] },
            { id: 11, title: 'Aula 2', type: 'VIDEO', seq: 1, progress: [] },
          ],
        },
      ]);

      const result = await service.getCourseProgress(1, 1);
      expect(result).not.toBeNull();
      expect(result!.modules).toHaveLength(1);
      expect(result!.modules[0].completedCount).toBe(1);
      expect(result!.modules[0].totalCount).toBe(2);
    });
  });

  // ─── getMyCertificates ────────────────────────────────────────────────────

  describe('getMyCertificates', () => {
    it('deve retornar certificados do utilizador', async () => {
      mockPrisma.certificate.findMany.mockResolvedValue([
        {
          id: 'cert-1',
          userId: 1,
          courseId: 1,
          validationCode: 'V123',
          course: { title: 'Curso A' },
        },
      ]);
      const result = await service.getMyCertificates(1);
      expect(result).toHaveLength(1);
      expect(result[0].validationCode).toBe('V123');
    });

    it('deve retornar lista vazia se sem certificados', async () => {
      mockPrisma.certificate.findMany.mockResolvedValue([]);
      const result = await service.getMyCertificates(99);
      expect(result).toHaveLength(0);
    });
  });

  // ─── verifyCertificate ────────────────────────────────────────────────────

  describe('verifyCertificate', () => {
    it('deve verificar certificado válido', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue({
        id: 'cert-1',
        validationCode: 'CERT-1-1-123',
        expiresAt: null,
        course: { id: 1, title: 'Curso A' },
        user: { id: 1, fullName: 'Alice' },
      });
      const result = await service.verifyCertificate('CERT-1-1-123');
      expect(result.valid).toBe(true);
    });

    it('deve retornar valid=false para certificado expirado', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue({
        id: 'cert-2',
        validationCode: 'CERT-2',
        expiresAt: new Date('2020-01-01'),
        course: { id: 1, title: 'Curso B' },
        user: { id: 2, fullName: 'Bob' },
      });
      const result = await service.verifyCertificate('CERT-2');
      expect(result.valid).toBe(false);
    });

    it('deve lançar NotFoundException se código inválido', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      await expect(service.verifyCertificate('INVALID')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createQuiz ───────────────────────────────────────────────────────────

  describe('createQuiz', () => {
    it('deve criar quiz com questões', async () => {
      const createdQuiz = { id: 1, lessonId: 10, passingScore: 70, questions: [] };
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 10 });
      mockPrisma.quiz.create.mockResolvedValue(createdQuiz);
      mockPrisma.quiz.findUnique.mockResolvedValue({
        ...createdQuiz,
        questions: [{ id: 1, question: 'O que é NestJS?' }],
      });

      const result = await service.createQuiz(10, {
        title: 'Quiz NestJS',
        passingScore: 70,
        questions: [
          {
            question: 'O que é NestJS?',
            type: 'MULTIPLE_CHOICE',
            correctAnswer: 'Framework',
            points: 1,
          },
        ],
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.quizQuestion.createMany).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se aula não existe', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.createQuiz(99, { title: 'Q', questions: [] } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── submitQuiz ───────────────────────────────────────────────────────────

  describe('submitQuiz', () => {
    const baseQuiz = {
      id: 1,
      passingScore: 70,
      maxAttempts: 0,
      questions: [
        {
          id: 11,
          type: 'MULTIPLE_CHOICE',
          points: 1,
          options: JSON.stringify([
            { text: 'Framework', isCorrect: true },
            { text: 'Library', isCorrect: false },
          ]),
          correctAnswer: 'Framework',
        },
      ],
    };

    it('deve avaliar quiz e retornar resultado', async () => {
      mockPrisma.quiz.findUnique.mockResolvedValue(baseQuiz);
      mockPrisma.quizAttempt.count.mockResolvedValue(0);
      mockPrisma.quizAttempt.create.mockResolvedValue({ id: 1, score: 100, passed: true });

      const result = await service.submitQuiz(1, 1, { answers: { 11: 'Framework' } } as any);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('deve marcar como reprovado se score < passingScore', async () => {
      mockPrisma.quiz.findUnique.mockResolvedValue(baseQuiz);
      mockPrisma.quizAttempt.count.mockResolvedValue(0);
      mockPrisma.quizAttempt.create.mockResolvedValue({ id: 2, score: 0, passed: false });

      const result = await service.submitQuiz(1, 1, { answers: { 11: 'Wrong Answer' } } as any);
      expect(result.passed).toBe(false);
    });

    it('deve lançar NotFoundException se quiz não existe', async () => {
      mockPrisma.quiz.findUnique.mockResolvedValue(null);
      await expect(service.submitQuiz(999, 1, { answers: {} } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar ForbiddenException se limite de tentativas atingido', async () => {
      mockPrisma.quiz.findUnique.mockResolvedValue({ ...baseQuiz, maxAttempts: 2 });
      mockPrisma.quizAttempt.count.mockResolvedValue(2);
      await expect(service.submitQuiz(1, 1, { answers: {} } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve tratar questão TRUE_FALSE', async () => {
      const tfQuiz = {
        ...baseQuiz,
        questions: [
          { id: 12, type: 'TRUE_FALSE', points: 1, options: null, correctAnswer: 'true' },
        ],
      };
      mockPrisma.quiz.findUnique.mockResolvedValue(tfQuiz);
      mockPrisma.quizAttempt.count.mockResolvedValue(0);
      mockPrisma.quizAttempt.create.mockResolvedValue({ id: 3, score: 100, passed: true });

      const result = await service.submitQuiz(1, 1, { answers: { 12: 'true' } } as any);
      expect(result).toBeDefined();
    });

    it('deve marcar questão aberta para correção manual', async () => {
      const openQuiz = {
        ...baseQuiz,
        questions: [{ id: 13, type: 'OPEN', points: 5, options: null, correctAnswer: null }],
      };
      mockPrisma.quiz.findUnique.mockResolvedValue(openQuiz);
      mockPrisma.quizAttempt.count.mockResolvedValue(0);
      mockPrisma.quizAttempt.create.mockResolvedValue({ id: 4, score: 0, passed: false });

      const result = await service.submitQuiz(1, 1, { answers: { 13: 'Minha resposta' } } as any);
      expect(result.results[0].note).toContain('manual');
    });
  });

  // ─── addFeedback ──────────────────────────────────────────────────────────

  describe('addFeedback', () => {
    it('deve criar feedback novo', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.courseFeedback.findFirst.mockResolvedValue(null);
      mockPrisma.courseFeedback.create.mockResolvedValue({
        id: 'fb-1',
        rating: 5,
        comment: 'Excelente',
      });
      const result = await service.addFeedback(1, 1, { rating: 5, comment: 'Excelente' });
      expect(result).toBeDefined();
      expect(mockPrisma.courseFeedback.create).toHaveBeenCalled();
      expect(mockPrisma.courseAnalytics.updateMany).toHaveBeenCalled();
    });

    it('deve actualizar feedback existente', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.courseFeedback.findFirst.mockResolvedValue({
        id: 'fb-1',
        rating: 3,
        comment: 'Bom',
      });
      mockPrisma.courseFeedback.update.mockResolvedValue({
        id: 'fb-1',
        rating: 5,
        comment: 'Melhorou muito',
      });
      const result = await service.addFeedback(1, 1, { rating: 5, comment: 'Melhorou muito' });
      expect(result).toBeDefined();
      expect(mockPrisma.courseFeedback.update).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.addFeedback(99, 1, { rating: 4, comment: '' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getCourseAnalytics ───────────────────────────────────────────────────

  describe('getCourseAnalytics', () => {
    it('deve retornar analytics completo do curso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.groupBy.mockResolvedValue([
        { status: 'COMPLETED', _count: 5 },
        { status: 'IN_PROGRESS', _count: 10 },
      ]);
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { id: 1, user: { id: 1, fullName: 'Alice' } },
      ]);
      mockPrisma.lesson.findMany.mockResolvedValue([
        { id: 10, title: 'Aula 1', _count: { progress: 8 } },
      ]);

      const result = await service.getCourseAnalytics(1);
      expect(result).toHaveProperty('analytics');
      expect(result).toHaveProperty('enrollmentsByStatus');
      expect(result).toHaveProperty('feedbackStats');
      expect(result).toHaveProperty('lessonCompletion');
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.getCourseAnalytics(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getAdminDashboard ────────────────────────────────────────────────────

  describe('getAdminDashboard', () => {
    it('deve retornar dashboard administrativo', async () => {
      mockPrisma.course.count.mockResolvedValueOnce(50).mockResolvedValueOnce(30);
      mockPrisma.enrollment.count
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(600)
        .mockResolvedValueOnce(20);

      const result = await service.getAdminDashboard();
      expect(result).toBeDefined();
    });
  });
});
