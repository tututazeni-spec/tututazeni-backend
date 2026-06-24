import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PrismaService } from '../prisma/prisma.service';

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
  status: 'ACTIVE',
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
      providers: [EnrollmentsService, { provide: PrismaService, useValue: mockPrisma }],
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
      expect(result.total).toBe(1);
    });

    it('deve filtrar por userId, courseId, status, mandatory, overdue', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      await service.findAll({
        userId: 1,
        courseId: 1,
        status: 'ACTIVE' as any,
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
    it('deve actualizar status da inscrição', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(0);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.enrollment.update.mockResolvedValue({ ...baseEnrollment, status: 'IN_PROGRESS' });
      // Real signature: updateStatus(id, dto) — 2 args only
      const result = await service.updateStatus(1, { status: 'IN_PROGRESS' as any });
      expect(result).toBeDefined();
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
      // Real signature: cancel(id, dto, requestingUserId) — 3 args
      const result = await service.cancel(1, { reason: 'Não aplicável' } as any, 2);
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
      // Real signature: cancel(id, dto, requestingUserId) — 3 args
      await expect(service.cancel(1, {} as any, 2)).rejects.toThrow(ForbiddenException);
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

  // ─── complete — method doesn't exist, use generateCertificate ─

  describe('generateCertificate', () => {
    it('deve gerar certificado para inscrição completa', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'COMPLETED',
        userId: 2,
        courseId: 1,
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(5);
      mockPrisma.certificate.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.certificate.create.mockResolvedValue({ id: 1, validationCode: 'CERT-001' });
      // Real method: generateCertificate(enrollmentId) — 1 arg, no 'complete' method
      const result = await service.generateCertificate(1);
      expect(result).toBeDefined();
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
