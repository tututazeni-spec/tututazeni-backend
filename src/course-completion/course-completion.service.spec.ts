import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CourseCompletionService } from './course-completion.service';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

// A decisão de conclusão passou a ler da primária (regressão evitada da antiga
// calculateCourseProgress): os stubs de lesson/lessonProgress/courseModule/quiz/
// quizAttempt vivem agora no nível de topo (primária). `read` continua a apontar
// para os mesmos jest.fn() — os poucos testes que ainda usam `mockPrisma.read.*`
// exercitam exactamente os mesmos stubs.
const enrollment = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};
const courseModule = { findMany: jest.fn(), findUnique: jest.fn() };
const lesson = { count: jest.fn(), findUnique: jest.fn() };
const lessonProgress = { count: jest.fn(), upsert: jest.fn() };
const quiz = { findFirst: jest.fn() };
const quizAttempt = { findFirst: jest.fn() };

const mockPrisma = {
  enrollment,
  courseModule,
  lesson,
  lessonProgress,
  quiz,
  quizAttempt,
  certificate: { findFirst: jest.fn(), create: jest.fn() },
  courseAnalytics: { updateMany: jest.fn() },
  notificationLog: { create: jest.fn() },
  read: { courseModule, lesson, lessonProgress, quiz, quizAttempt, enrollment },
};

const mockGamification = {
  awardPoints: jest.fn().mockResolvedValue(undefined),
  awardBadge: jest.fn().mockResolvedValue(undefined),
};

describe('CourseCompletionService', () => {
  let service: CourseCompletionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CourseCompletionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GamificationService, useValue: mockGamification },
      ],
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

    it('MIN_PERCENT: false quando abaixo do limiar', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 7,
        completionRule: 'MIN_PERCENT',
        minCompletionPercent: 80,
        lessons: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2); // 50% < 80%
      expect(await service.isModuleCompleted(7, 10)).toBe(false);
    });

    it('QUIZ_PASS: true quando o módulo tem quiz e há tentativa aprovada', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 8,
        completionRule: 'QUIZ_PASS',
        lessons: [{ id: 1 }],
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.read.quiz.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.read.quizAttempt.findFirst.mockResolvedValue({ id: 1, passed: true });
      expect(await service.isModuleCompleted(8, 10)).toBe(true);
    });

    it('QUIZ_PASS: false quando o módulo tem quiz mas sem tentativa aprovada', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 8,
        completionRule: 'QUIZ_PASS',
        lessons: [{ id: 1 }],
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.read.quiz.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.read.quizAttempt.findFirst.mockResolvedValue(null);
      expect(await service.isModuleCompleted(8, 10)).toBe(false);
    });

    it('QUIZ_PASS: sem quiz no módulo → fallback a ALL_LESSONS', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 8,
        completionRule: 'QUIZ_PASS',
        lessons: [{ id: 1 }, { id: 2 }],
      });
      mockPrisma.read.quiz.findFirst.mockResolvedValue(null);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(1); // 1 < 2 → incompleto
      expect(await service.isModuleCompleted(8, 10)).toBe(false);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2); // 2 >= 2 → completo
      expect(await service.isModuleCompleted(8, 10)).toBe(true);
    });

    it('COMBINED: exige limiar de aulas E quiz aprovado', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 9,
        completionRule: 'COMBINED',
        minCompletionPercent: 80,
        lessons: [{ id: 1 }, { id: 2 }],
      });
      mockPrisma.read.quiz.findFirst.mockResolvedValue({ id: 10 });

      // aulas OK (100% >= 80%) + quiz aprovado → true
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2);
      mockPrisma.read.quizAttempt.findFirst.mockResolvedValue({ id: 1, passed: true });
      expect(await service.isModuleCompleted(9, 10)).toBe(true);

      // aulas OK mas quiz reprovado → false
      mockPrisma.read.quizAttempt.findFirst.mockResolvedValue(null);
      expect(await service.isModuleCompleted(9, 10)).toBe(false);

      // quiz aprovado mas aulas insuficientes (50% < 80%) → false
      mockPrisma.read.lessonProgress.count.mockResolvedValue(1);
      mockPrisma.read.quizAttempt.findFirst.mockResolvedValue({ id: 1, passed: true });
      expect(await service.isModuleCompleted(9, 10)).toBe(false);
    });

    it('COMBINED: sem quiz no módulo → basta o limiar de aulas', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 9,
        completionRule: 'COMBINED',
        minCompletionPercent: 80,
        lessons: [{ id: 1 }, { id: 2 }],
      });
      mockPrisma.read.quiz.findFirst.mockResolvedValue(null);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2);
      expect(await service.isModuleCompleted(9, 10)).toBe(true);
    });

    it('regra de conclusão desconhecida → false', async () => {
      mockPrisma.read.courseModule.findUnique.mockResolvedValue({
        id: 11,
        completionRule: 'UNKNOWN_RULE',
        lessons: [{ id: 1 }],
      });
      mockPrisma.read.lessonProgress.count.mockResolvedValue(1);
      expect(await service.isModuleCompleted(11, 10)).toBe(false);
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

  describe('finalizeCompletion', () => {
    const baseEnrollment = {
      id: 1,
      userId: 10,
      courseId: 20,
      status: 'IN_PROGRESS',
      course: { id: 20, title: 'Curso X', certificateValidityDays: null },
    };

    beforeEach(() => {
      // `updateMany` condicional é agora o claim atómico: count:1 = esta chamada
      // ganhou o lock. `courseAnalytics.updateMany` corre num `.catch()`, por isso
      // tem de devolver uma promessa (jest.fn() cru devolveria undefined).
      mockPrisma.enrollment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.courseAnalytics.updateMany.mockResolvedValue({});
    });

    it('primeira chamada aplica os 5 efeitos e devolve finalized:true', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment });
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      mockPrisma.certificate.create.mockResolvedValue({ id: 500, enrollmentId: 1 });
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const res = await service.finalizeCompletion(1);

      expect(res).toEqual({ finalized: true });
      expect(mockPrisma.enrollment.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: { not: 'COMPLETED' } },
        data: { status: 'COMPLETED', completedAt: expect.any(Date) },
      });
      expect(mockPrisma.courseAnalytics.updateMany).toHaveBeenCalledWith({
        where: { courseId: 20 },
        data: { totalCompleted: { increment: 1 } },
      });
      expect(mockPrisma.certificate.create).toHaveBeenCalled();
      expect(mockGamification.awardPoints).toHaveBeenCalledWith(10, 100, 'course-completion');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'COURSE_COMPLETED', userId: 10 }),
        }),
      );
    });

    it('idempotente: se já COMPLETED, o claim não afecta linhas e devolve finalized:false', async () => {
      mockPrisma.enrollment.updateMany.mockResolvedValue({ count: 0 });
      const res = await service.finalizeCompletion(1);
      expect(res).toEqual({ finalized: false });
      expect(mockPrisma.enrollment.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
      expect(mockGamification.awardPoints).not.toHaveBeenCalled();
      expect(mockPrisma.courseAnalytics.updateMany).not.toHaveBeenCalled();
    });

    it('certificado já existe → não volta a criar, mas os outros efeitos aplicam-se na mesma', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment });
      mockPrisma.certificate.findFirst.mockResolvedValue({ id: 500, enrollmentId: 1 });
      mockPrisma.notificationLog.create.mockResolvedValue({});

      await service.finalizeCompletion(1);

      expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
      expect(mockPrisma.enrollment.updateMany).toHaveBeenCalled();
      expect(mockGamification.awardPoints).toHaveBeenCalled();
    });

    it('P2002 ao criar certificado é engolido (corrida) e a conclusão prossegue', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment });
      mockPrisma.certificate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 501, enrollmentId: 1 });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      Object.setPrototypeOf(p2002, Prisma.PrismaClientKnownRequestError.prototype);
      mockPrisma.certificate.create.mockRejectedValue(p2002);
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const res = await service.finalizeCompletion(1);
      expect(res).toEqual({ finalized: true });
    });

    it('delega os pontos ao GamificationService — não escreve UserPoints directamente', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment });
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      mockPrisma.certificate.create.mockResolvedValue({ id: 500 });
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const res = await service.finalizeCompletion(1);
      expect(res).toEqual({ finalized: true });
      expect(mockGamification.awardPoints).toHaveBeenCalledWith(10, 100, 'course-completion');
    });
  });

  describe('issueCertificateFor', () => {
    const adminUser = { id: 99, role: { name: 'ADMIN' } } as any;
    const ownerUser = { id: 10, role: { name: 'COLABORADOR' } } as any;
    const strangerUser = { id: 77, role: { name: 'COLABORADOR' } } as any;

    const completed = {
      id: 1,
      userId: 10,
      courseId: 20,
      status: 'COMPLETED',
      course: { id: 20, title: 'Curso X', certificateValidityDays: null },
    };

    it('curso não concluído → BadRequestException', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...completed, status: 'IN_PROGRESS' });
      await expect(service.issueCertificateFor(1, ownerUser)).rejects.toThrow(BadRequestException);
    });

    it('utilizador que não é dono nem ADMIN/RH → NotFoundException (não revela existência; paridade com o endpoint que substitui)', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...completed });
      await expect(service.issueCertificateFor(1, strangerUser)).rejects.toThrow(NotFoundException);
    });

    it('dono, curso concluído, sem certificado → cria e devolve', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...completed });
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      mockPrisma.certificate.create.mockResolvedValue({ id: 500, enrollmentId: 1 });
      const cert = await service.issueCertificateFor(1, ownerUser);
      expect(cert).toEqual({ id: 500, enrollmentId: 1 });
    });

    it('certificado já existe → devolve o existente, sem criar nem notificar', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...completed });
      mockPrisma.certificate.findFirst.mockResolvedValue({ id: 500, enrollmentId: 1 });
      const cert = await service.issueCertificateFor(1, adminUser);
      expect(cert).toEqual({ id: 500, enrollmentId: 1 });
      expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('matrícula inexistente → NotFoundException', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.issueCertificateFor(999, adminUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCourseProgressNumbers', () => {
    it('pct = round(completed / total * 100)', async () => {
      mockPrisma.read.lesson.count.mockResolvedValue(8);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(2);
      expect(await service.getCourseProgressNumbers(20, 10)).toEqual({
        totalLessons: 8,
        completedLessons: 2,
        pct: 25,
      });
    });
    it('curso sem aulas → pct 0', async () => {
      mockPrisma.read.lesson.count.mockResolvedValue(0);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(0);
      expect(await service.getCourseProgressNumbers(20, 10)).toEqual({
        totalLessons: 0,
        completedLessons: 0,
        pct: 0,
      });
    });
  });

  describe('markLessonComplete', () => {
    it('aula inexistente → NotFoundException', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue(null);
      await expect(service.markLessonComplete(10, 999, {})).rejects.toThrow(NotFoundException);
    });

    it('não matriculado → ForbiddenException', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue({
        id: 1,
        moduleId: 5,
        module: { courseId: 20 },
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(service.markLessonComplete(10, 1, {})).rejects.toThrow(ForbiddenException);
    });

    it('upsert do progresso + NOT_STARTED → IN_PROGRESS + não completa se evaluateCompletion=false', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue({
        id: 1,
        moduleId: 5,
        module: { courseId: 20 },
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        id: 7,
        userId: 10,
        courseId: 20,
        status: 'NOT_STARTED',
      });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({ id: 1, completed: true });
      jest
        .spyOn(service, 'evaluateCompletion')
        .mockResolvedValue({ complete: false, reason: 'all-lessons' });
      mockPrisma.read.lesson.count.mockResolvedValue(4);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(1);

      const res = await service.markLessonComplete(10, 1, { watchedSeconds: 30 });

      expect(mockPrisma.lessonProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { lessonId_userId: { lessonId: 1, userId: 10 } } }),
      );
      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'IN_PROGRESS', startedAt: expect.any(Date) },
      });
      expect(res.courseCompleted).toBe(false);
      expect(res.courseProgress).toEqual({ totalLessons: 4, completedLessons: 1, pct: 25 });
    });

    it('evaluateCompletion=true → chama finalizeCompletion e devolve courseCompleted:true', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue({
        id: 1,
        moduleId: 5,
        module: { courseId: 20 },
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        id: 7,
        userId: 10,
        courseId: 20,
        status: 'IN_PROGRESS',
      });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({ id: 1, completed: true });
      jest
        .spyOn(service, 'evaluateCompletion')
        .mockResolvedValue({ complete: true, reason: 'all-modules' });
      const finalizeSpy = jest
        .spyOn(service, 'finalizeCompletion')
        .mockResolvedValue({ finalized: true });
      mockPrisma.read.lesson.count.mockResolvedValue(4);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(4);

      const res = await service.markLessonComplete(10, 1, {});

      expect(finalizeSpy).toHaveBeenCalledWith(7);
      expect(res.courseCompleted).toBe(true);
    });

    it('idempotente: se finalizeCompletion devolve finalized:false mas o curso já está COMPLETED, courseCompleted:true', async () => {
      mockPrisma.read.lesson.findUnique.mockResolvedValue({
        id: 1,
        moduleId: 5,
        module: { courseId: 20 },
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        id: 7,
        userId: 10,
        courseId: 20,
        status: 'COMPLETED',
      });
      mockPrisma.lessonProgress.upsert.mockResolvedValue({ id: 1, completed: true });
      jest
        .spyOn(service, 'evaluateCompletion')
        .mockResolvedValue({ complete: true, reason: 'all-modules' });
      jest.spyOn(service, 'finalizeCompletion').mockResolvedValue({ finalized: false });
      mockPrisma.read.lesson.count.mockResolvedValue(4);
      mockPrisma.read.lessonProgress.count.mockResolvedValue(4);

      const res = await service.markLessonComplete(10, 1, {});
      expect(res.courseCompleted).toBe(true);
      expect(mockPrisma.enrollment.update).not.toHaveBeenCalled(); // não re-flipa NOT_STARTED
    });
  });
});
