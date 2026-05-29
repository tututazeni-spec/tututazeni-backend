import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentStatus } from './enrollments.dto';

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnrollmentsService, { provide: PrismaService, useValue: mockPrisma }],
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
      expect(result.total).toBe(1);
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
});
