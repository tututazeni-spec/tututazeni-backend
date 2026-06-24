// src/enrollments/enrollments.service.progress.spec.ts
// Cobre métodos não testados: updateStatus, cancel, updateDeadline,
// generateCertificate, getUserEnrollments, bulkEnroll

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PrismaService } from '../prisma/prisma.service';

function buildMockPrisma() {
  return {
    enrollment: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    course: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 1, title: 'Curso', status: 'PUBLISHED', workloadHours: 10 }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    lesson: { count: jest.fn().mockResolvedValue(5) },
    lessonProgress: {
      count: jest.fn().mockResolvedValue(3),
      groupBy: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    courseModule: { findMany: jest.fn().mockResolvedValue([]) },
    courseAnalytics: { updateMany: jest.fn().mockResolvedValue({}) },
    certificate: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1, validationCode: 'CERT-1-1-123' }),
    },
    notificationLog: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    userPoints: { update: jest.fn().mockResolvedValue({}) },
    badgeAward: { create: jest.fn().mockResolvedValue({}) },
  };
}

const baseEnrollment: any = {
  id: 1,
  userId: 5,
  courseId: 1,
  status: 'NOT_STARTED',
  deadline: null,
  mandatory: false,
  origin: 'MANUAL',
  enrolledAt: new Date(),
  completedAt: null,
  user: { id: 5, fullName: 'Ana', email: 'ana@test.com', avatarUrl: null, department: null },
  course: {
    id: 1,
    title: 'Curso Teste',
    thumbnailUrl: null,
    category: null,
    workloadHours: 10,
    status: 'PUBLISHED',
  },
  certificate: null,
  progresses: [],
};

describe('EnrollmentsService (progress)', () => {
  let service: EnrollmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma = buildMockPrisma();

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

  // ─── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('deve actualizar status para CANCELLED a partir de NOT_STARTED', async () => {
      // invalidTransitions['CANCELLED'] = ['COMPLETED'] — NOT_STARTED não está na lista → válido
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'NOT_STARTED',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.enrollment.update.mockResolvedValue({ id: 1, status: 'CANCELLED' });

      const result = await service.updateStatus(1, { status: 'CANCELLED' } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.enrollment.update).toHaveBeenCalled();
    });

    it('deve lançar BadRequestException ao tentar COMPLETED a partir de IN_PROGRESS', async () => {
      // invalidTransitions['COMPLETED'] inclui 'IN_PROGRESS' → inválido
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'IN_PROGRESS',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);

      await expect(service.updateStatus(1, { status: 'COMPLETED' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar BadRequestException ao tentar CANCELLED a partir de COMPLETED', async () => {
      // invalidTransitions['CANCELLED'] inclui 'COMPLETED' → inválido
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'COMPLETED',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(5);

      await expect(service.updateStatus(1, { status: 'CANCELLED' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── cancel ───────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('deve cancelar matrícula com sucesso', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'IN_PROGRESS',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);
      mockPrisma.enrollment.update.mockResolvedValue({ id: 1, status: 'CANCELLED' });

      const result = (await service.cancel(1, { reason: 'Sem tempo' } as any, 5)) as any;
      expect(result.message).toBeDefined();
    });

    it('deve lançar ForbiddenException se matrícula já concluída', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'COMPLETED',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(5);

      await expect(service.cancel(1, { reason: 'Teste' } as any, 5)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar ForbiddenException se matrícula é obrigatória', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({ ...baseEnrollment, mandatory: true });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);

      await expect(service.cancel(1, { reason: 'Teste' } as any, 5)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── updateDeadline ───────────────────────────────────────────────────────

  describe('updateDeadline', () => {
    it('deve actualizar prazo da matrícula', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.enrollment.update.mockResolvedValue({ id: 1, deadline: new Date('2026-12-31') });

      const result = await service.updateDeadline(1, { deadline: '2026-12-31' } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.enrollment.update).toHaveBeenCalled();
    });
  });

  // ─── generateCertificate ──────────────────────────────────────────────────

  describe('generateCertificate', () => {
    it('deve lançar BadRequestException se curso não concluído', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'IN_PROGRESS',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);

      await expect(service.generateCertificate(1)).rejects.toThrow(BadRequestException);
    });

    it('deve retornar certificado existente sem criar novo', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'COMPLETED',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(5);
      const existingCert = { id: 99, validationCode: 'CERT-OLD' };
      mockPrisma.certificate.findFirst.mockResolvedValue(existingCert);

      const result = await service.generateCertificate(1);
      expect(result).toBe(existingCert);
      expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
    });

    it('deve gerar novo certificado para curso concluído', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...baseEnrollment,
        status: 'COMPLETED',
      });
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(5);
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      const newCert = { id: 1, validationCode: 'CERT-1-5-123' };
      mockPrisma.certificate.create.mockResolvedValue(newCert);

      const result = await service.generateCertificate(1);
      expect(result).toBe(newCert);
      expect(mockPrisma.certificate.create).toHaveBeenCalled();
    });
  });

  // ─── getUserEnrollments ───────────────────────────────────────────────────

  describe('getUserEnrollments', () => {
    it('deve retornar objeto vazio se utilizador sem matrículas', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([]);

      const result = (await service.getUserEnrollments(5)) as any;
      expect(result.enrollments).toHaveLength(0);
      expect(result.groups).toBeDefined();
    });

    it('deve retornar matrículas agrupadas por estado', async () => {
      const past = new Date('2020-01-01'); // overdue
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { ...baseEnrollment, id: 1, status: 'IN_PROGRESS', deadline: past },
        { ...baseEnrollment, id: 2, status: 'COMPLETED', deadline: null },
        { ...baseEnrollment, id: 3, status: 'NOT_STARTED', deadline: null },
      ]);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);

      const result = (await service.getUserEnrollments(5)) as any;
      expect(result.enrollments.length).toBeGreaterThan(0);
    });
  });

  // ─── bulkEnroll ───────────────────────────────────────────────────────────

  describe('bulkEnroll', () => {
    it('deve inscrever múltiplos utilizadores com sucesso', async () => {
      // course exists + not enrolled yet
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 1,
        status: 'PUBLISHED',
        workloadHours: 10,
        title: 'Curso',
        mandatory: false,
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue(null); // no existing enrollment
      mockPrisma.enrollment.create.mockResolvedValue({ id: 1 });
      mockPrisma.lesson.count.mockResolvedValue(0);
      mockPrisma.lessonProgress.count.mockResolvedValue(0);
      mockPrisma.courseAnalytics.updateMany.mockResolvedValue({});

      const result = (await service.bulkEnroll({
        courseId: 1,
        userIds: [1, 2],
        mandatory: false,
      } as any)) as any;

      expect(result.total).toBe(2);
      expect(result.success + result.skipped + result.errors).toBe(2);
    });

    it('deve contar skipped quando utilizador já inscrito (ConflictException)', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 1,
        status: 'PUBLISHED',
        workloadHours: 10,
        title: 'Curso',
        mandatory: false,
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 99 }); // already enrolled → conflict
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(5);

      const result = (await service.bulkEnroll({
        courseId: 1,
        userIds: [3],
        mandatory: false,
      } as any)) as any;

      expect(result.skipped).toBe(1);
      expect(result.success).toBe(0);
    });
  });
});
