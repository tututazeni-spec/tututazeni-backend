import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseCompletionService } from '../course-completion/course-completion.service';

const mockCourseCompletion = {
  issueCertificateFor: jest.fn(),
  finalizeCompletion: jest.fn(),
};

const mockPrisma: any = {
  enrollment: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  course: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  lesson: { count: jest.fn().mockResolvedValue(0) },
  lessonProgress: {
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  courseModule: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  certificate: {
    create: jest.fn().mockResolvedValue({ id: 1, validationCode: 'CERT-001' }),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  courseAnalytics: { updateMany: jest.fn().mockResolvedValue({}) },
};

const baseCourse = {
  id: 1,
  title: 'TypeScript Avançado',
  status: 'PUBLISHED',
  workloadHours: 20,
  category: 'TECH',
  thumbnailUrl: null,
};

const baseEnrollment = {
  id: 1,
  userId: 2,
  courseId: 1,
  status: 'NOT_STARTED',
  origin: 'SELF',
  mandatory: false,
  deadline: null,
  progressPercent: 0,
  enrolledAt: new Date(),
  completedAt: null,
  user: {
    id: 2,
    fullName: 'João Silva',
    email: 'joao@innova.com',
    avatarUrl: null,
    department: { name: 'TI' },
  },
  course: {
    id: 1,
    title: 'TypeScript Avançado',
    thumbnailUrl: null,
    category: 'TECH',
    workloadHours: 20,
    status: 'PUBLISHED',
  },
  certificate: null,
};

describe('EnrollmentsService (additional)', () => {
  let service: EnrollmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CourseCompletionService, useValue: mockCourseCompletion },
      ],
    }).compile();
    service = module.get<EnrollmentsService>(EnrollmentsService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar inscrições paginadas', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([baseEnrollment]);
      mockPrisma.enrollment.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por userId, courseId, status, mandatory, overdue', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      await service.findAll({
        userId: 1,
        courseId: 1,
        status: 'IN_PROGRESS' as any,
        mandatory: true,
        overdue: true,
      });
      expect(mockPrisma.enrollment.findMany).toHaveBeenCalled();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar inscrição por id', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(2);
      // Real signature: findOne(id) — 1 arg only
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se inscrição não existe', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      // Real signature: findOne(id) — 1 arg only
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── enroll ───────────────────────────────────────────────────

  describe('enroll', () => {
    it('deve criar inscrição num curso publicado', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockResolvedValue(baseEnrollment);
      mockPrisma.courseAnalytics = { updateMany: jest.fn().mockResolvedValue({}) };
      // Real signature: enroll(dto) — 1 arg only
      const result = await service.enroll({ userId: 2, courseId: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      // Real signature: enroll(dto) — 1 arg only
      await expect(service.enroll({ userId: 2, courseId: 99 } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar BadRequestException se curso não está publicado', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ ...baseCourse, status: 'DRAFT' });
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      // Real signature: enroll(dto) — 1 arg only
      await expect(service.enroll({ userId: 2, courseId: 1 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar ConflictException se já inscrito', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue(baseEnrollment);
      // Real signature: enroll(dto) — 1 arg only
      await expect(service.enroll({ userId: 2, courseId: 1 } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── getUserEnrollments (replaces getMyEnrollments) ──────────

  describe('getUserEnrollments', () => {
    it('deve retornar inscrições do utilizador com progresso', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);
      // Real method: getUserEnrollments(userId, filters?)
      const result = await service.getUserEnrollments(2, {});
      expect(result).toBeDefined();
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────

  describe('updateStatus', () => {
    it('status COMPLETED → chama finalizeCompletion e devolve a matrícula recarregada', async () => {
      mockCourseCompletion.finalizeCompletion.mockResolvedValue({ finalized: true });
      mockPrisma.enrollment.findUnique
        .mockResolvedValueOnce({ id: 7, status: 'IN_PROGRESS', completedAt: null })
        .mockResolvedValueOnce({ id: 7, status: 'COMPLETED', completedAt: new Date() });

      const res = await service.updateStatus(7, { status: 'COMPLETED' } as any);

      expect(mockCourseCompletion.finalizeCompletion).toHaveBeenCalledWith(7);
      expect((res as any).status).toBe('COMPLETED');
      expect(mockPrisma.enrollment.update).not.toHaveBeenCalled();
    });

    it('transição inválida COMPLETED → NOT_STARTED continua a lançar BadRequestException', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 7,
        status: 'COMPLETED',
        completedAt: new Date(),
      });
      await expect(service.updateStatus(7, { status: 'NOT_STARTED' as any })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCourseCompletion.finalizeCompletion).not.toHaveBeenCalled();
    });

    it('status não-COMPLETED (ex. CANCELLED) → update directo, sem finalizeCompletion', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 7,
        status: 'IN_PROGRESS',
        completedAt: null,
      });
      mockPrisma.enrollment.update.mockResolvedValue({ id: 7, status: 'CANCELLED' });
      await service.updateStatus(7, { status: 'CANCELLED' as any });
      expect(mockCourseCompletion.finalizeCompletion).not.toHaveBeenCalled();
      expect(mockPrisma.enrollment.update).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se inscrição não existe', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      // Real signature: updateStatus(id, dto) — 2 args only
      await expect(service.updateStatus(99, { status: 'IN_PROGRESS' as any })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── cancel ───────────────────────────────────────────────────

  describe('cancel', () => {
    it('deve cancelar inscrição', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        userId: 2,
        status: 'NOT_STARTED',
        mandatory: false,
        courseId: 1,
      });
      mockPrisma.lesson.count.mockResolvedValue(0);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.enrollment.update.mockResolvedValue({ ...baseEnrollment, status: 'CANCELLED' });
      mockPrisma.courseAnalytics = { updateMany: jest.fn().mockResolvedValue({}) };
      // Real signature: cancel(id, dto, requestingUser) — 3 args
      const result = await service.cancel(
        1,
        { reason: 'Não aplicável' } as any,
        { id: 2, role: { name: 'COLABORADOR' } } as any,
      );
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se matrícula obrigatória', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        userId: 2,
        status: 'NOT_STARTED',
        mandatory: true,
        courseId: 1,
      });
      mockPrisma.lesson.count.mockResolvedValue(0);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      // Real signature: cancel(id, dto, requestingUser) — 3 args
      await expect(
        service.cancel(1, {} as any, { id: 2, role: { name: 'COLABORADOR' } } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    // A10-12: sem ownership, qualquer autenticado podia cancelar a matrícula
    // de outra pessoa.
    it('rejeita colaborador a cancelar matrícula de outra pessoa', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        userId: 2,
        status: 'NOT_STARTED',
        mandatory: false,
        courseId: 1,
      });
      await expect(
        service.cancel(
          1,
          { reason: 'x' } as any,
          { id: 999, role: { name: 'COLABORADOR' } } as any,
        ),
      ).rejects.toThrow();
      expect(mockPrisma.enrollment.update).not.toHaveBeenCalled();
    });
  });

  // ─── bulkEnroll ───────────────────────────────────────────────

  describe('bulkEnroll', () => {
    it('deve inscrever múltiplos utilizadores num curso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockResolvedValue(baseEnrollment);
      mockPrisma.courseAnalytics = { updateMany: jest.fn().mockResolvedValue({}) };
      // Real signature: bulkEnroll(dto) — 1 arg; returns { success, skipped, errors, total }
      const result = await service.bulkEnroll({
        courseId: 1,
        userIds: [1, 2, 3],
        mandatory: true,
      } as any);
      expect(result).toBeDefined();
      expect(result.success).toBe(3); // 'success' not 'created'
    });
  });

  // ─── generateCertificate (delega em CourseCompletionService) ──

  describe('generateCertificate', () => {
    it('delega em CourseCompletionService.issueCertificateFor(enrollmentId, user)', async () => {
      mockCourseCompletion.issueCertificateFor.mockResolvedValue({ id: 500, enrollmentId: 7 });
      const user = { id: 10 } as any;
      const result = await service.generateCertificate(7, user);
      expect(mockCourseCompletion.issueCertificateFor).toHaveBeenCalledWith(7, user);
      expect(result).toEqual({ id: 500, enrollmentId: 7 });
    });
  });

  // ─── updateDeadline ───────────────────────────────────────────

  describe('updateDeadline', () => {
    it('deve actualizar prazo da inscrição', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(0);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.enrollment.update.mockResolvedValue({
        ...baseEnrollment,
        deadline: new Date('2026-12-31'),
      });
      // Real signature: updateDeadline(id, dto) — 2 args only
      const result = await service.updateDeadline(1, { deadline: '2026-12-31' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getAdminDashboard (replaces getStats) ────────────────────

  describe('getAdminDashboard', () => {
    it('deve retornar estatísticas de inscrições', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(100);
      mockPrisma.enrollment.groupBy = jest.fn().mockResolvedValue([]);
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      // Real method: getAdminDashboard() — no args, getStats doesn't exist
      const result = await service.getAdminDashboard();
      expect(result).toBeDefined();
    });
  });
});
