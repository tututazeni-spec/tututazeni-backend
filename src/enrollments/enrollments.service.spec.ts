import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseCompletionService } from '../course-completion/course-completion.service';
import { EnrollmentStatus } from './enrollments.dto';

const mockCourseCompletion = {
  issueCertificateFor: jest.fn(),
  finalizeCompletion: jest.fn(),
};

const mockPrisma = {
  enrollment: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  course: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  lesson: { count: jest.fn() },
  lessonProgress: {
    count: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  courseModule: { findMany: jest.fn() },
  courseAnalytics: { updateMany: jest.fn().mockResolvedValue({}) },
  certificate: { create: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
  badgeAward: { create: jest.fn().mockResolvedValue({}) },
};

const baseCourse = {
  id: 1,
  title: 'Curso Teste',
  status: 'PUBLISHED',
  mandatory: false,
};

const baseEnrollment = {
  id: 1,
  userId: 1,
  courseId: 1,
  status: 'NOT_STARTED',
  deadline: null,
  mandatory: false,
  origin: 'MANUAL',
  enrolledAt: new Date(),
  user: {
    id: 1,
    fullName: 'Test User',
    email: 'test@innova.com',
    avatarUrl: null,
    department: null,
  },
  course: {
    id: 1,
    title: 'Curso Teste',
    thumbnailUrl: null,
    category: null,
    workloadHours: 0,
    status: 'PUBLISHED',
  },
  certificate: null,
  progresses: [],
};

describe('EnrollmentsService', () => {
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

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de matrículas com progresso', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([baseEnrollment]);
      mockPrisma.enrollment.count.mockResolvedValue(1);
      mockPrisma.courseModule.findMany.mockResolvedValue([{ courseId: 1, _count: { lessons: 5 } }]);
      mockPrisma.lessonProgress.groupBy.mockResolvedValue([{ enrollmentId: 1, _count: { id: 3 } }]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect((result.data[0] as any).progressPercent).toBe(60);
    });

    it('deve filtrar por userId e status', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.courseModule.findMany.mockResolvedValue([]);
      mockPrisma.lessonProgress.groupBy.mockResolvedValue([]);

      await service.findAll({ userId: 1, status: EnrollmentStatus.COMPLETED });

      expect(mockPrisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 1, status: 'COMPLETED' }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar matrícula com progresso', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);

      const result = await service.findOne(1);

      expect((result as any).progressPercent).toBe(60);
      expect((result as any).totalLessons).toBe(5);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });

    // ─── Ownership (A3) ───────────────────────────────────────────────────

    it('o dono lê a própria matrícula', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);
      const owner = { id: 1, role: { name: 'COLABORADOR' } } as any;
      await expect(service.findOne(1, owner)).resolves.toMatchObject({ id: 1 });
    });

    it('IDOR: colaborador B não pode ler a matrícula de A (404)', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);
      const userB = { id: 8, role: { name: 'COLABORADOR' } } as any;
      await expect(service.findOne(1, userB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('RH lê qualquer matrícula (papel privilegiado)', async () => {
      mockPrisma.enrollment.findUnique.mockResolvedValue(baseEnrollment);
      mockPrisma.lesson.count.mockResolvedValue(5);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);
      const rh = { id: 99, role: { name: 'RH' } } as any;
      await expect(service.findOne(1, rh)).resolves.toMatchObject({ id: 1 });
    });
  });

  // ─── enroll ───────────────────────────────────────────────────────────────

  describe('enroll', () => {
    const enrollDto = { userId: 1, courseId: 1 };

    it('deve criar matrícula com sucesso', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.create.mockResolvedValue(baseEnrollment);

      const result = await service.enroll(enrollDto);

      expect(result.status).toBe('NOT_STARTED');
      expect(result.userId).toBe(1);
    });

    it('deve lançar ConflictException se já existe matrícula activa', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue({
        ...baseEnrollment,
        status: 'IN_PROGRESS',
      });
      await expect(service.enroll(enrollDto)).rejects.toThrow(ConflictException);
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.enroll(enrollDto)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se curso não publicado', async () => {
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.course.findUnique.mockResolvedValue({ ...baseCourse, status: 'DRAFT' });
      await expect(service.enroll(enrollDto)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── generateCertificate (delega em CourseCompletionService) ───────────────

  describe('generateCertificate', () => {
    it('delega em CourseCompletionService.issueCertificateFor(enrollmentId, user)', async () => {
      mockCourseCompletion.issueCertificateFor.mockResolvedValue({ id: 500, enrollmentId: 7 });
      const user = { id: 10 } as any;
      const res = await service.generateCertificate(7, user);
      expect(mockCourseCompletion.issueCertificateFor).toHaveBeenCalledWith(7, user);
      expect(res).toEqual({ id: 500, enrollmentId: 7 });
    });
  });

  // ─── updateStatus (COMPLETED delega em finalizeCompletion) ────────────────

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
      await expect(service.updateStatus(7, { status: 'NOT_STARTED' } as any)).rejects.toThrow(
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
      await service.updateStatus(7, { status: 'CANCELLED' } as any);
      expect(mockCourseCompletion.finalizeCompletion).not.toHaveBeenCalled();
      expect(mockPrisma.enrollment.update).toHaveBeenCalled();
    });
  });
});
