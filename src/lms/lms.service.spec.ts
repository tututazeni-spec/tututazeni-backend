import { Test, TestingModule } from '@nestjs/testing';
import { LmsService } from './lms.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockPath = {
  id: 'path-1',
  code: 'PATH-001',
  name: 'Percurso Liderança',
  level: 'BASIC',
  courseIds: ['c1', 'c2'],
  courseOrder: ['c1', 'c2'],
  isActive: true,
  deletedAt: null,
};
const mockPrisma = {
  user: { findUnique: jest.fn() },
  lmsLearningPath: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  lmsPathEnrollment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  lmsLiveSession: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  lmsLiveAttendance: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  lmsLearningAnalytics: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('LmsService', () => {
  let service: LmsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LmsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LmsService>(LmsService);
    jest.clearAllMocks();
  });

  describe('createPath', () => {
    it('deve criar percurso com código', async () => {
      mockPrisma.lmsLearningPath.findUnique.mockResolvedValue(null);
      mockPrisma.lmsLearningPath.create.mockResolvedValue(mockPath);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createPath(
        {
          code: 'PATH-001',
          name: 'Percurso Liderança',
          courseIds: ['c1', 'c2'],
        },
        1,
      );
      expect(result.code).toBe('PATH-001');
    });

    it('deve lançar ConflictException se código existe', async () => {
      mockPrisma.lmsLearningPath.findUnique.mockResolvedValue(mockPath);
      await expect(
        service.createPath({ code: 'PATH-001', name: 'X', courseIds: [] }, 1),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllPaths', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockPath], 1]);
      const result = await service.findAllPaths({ page: 1, limit: 20 });
      expect(result).toMatchObject({ total: 1, totalPages: 1 });
    });
  });

  describe('findPathById', () => {
    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.lmsLearningPath.findUnique.mockResolvedValue(null);
      await expect(service.findPathById('nao-existe')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('enrollInPath', () => {
    it('deve inscrever utilizador no percurso', async () => {
      mockPrisma.lmsLearningPath.findUnique.mockResolvedValue(mockPath);
      mockPrisma.lmsPathEnrollment.findUnique.mockResolvedValue(null);
      mockPrisma.lmsPathEnrollment.create.mockResolvedValue({
        id: 'enr-1',
        pathId: 'path-1',
      });
      mockPrisma.lmsLearningPath.update.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.enrollInPath('path-1', 1);
      expect(result.pathId).toBe('path-1');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'LMS_PATH_ENROLLMENT' }),
        }),
      );
    });

    it('deve lançar ConflictException se já inscrito', async () => {
      mockPrisma.lmsLearningPath.findUnique.mockResolvedValue(mockPath);
      mockPrisma.lmsPathEnrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        deletedAt: null,
      });
      await expect(service.enrollInPath('path-1', 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updatePathProgress', () => {
    it('deve marcar COMPLETED quando todos os cursos concluídos', async () => {
      mockPrisma.lmsPathEnrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        completedCourseIds: ['c1'],
        path: { courseIds: ['c1', 'c2'], courseOrder: ['c1', 'c2'] },
      });
      mockPrisma.lmsPathEnrollment.update.mockResolvedValue({
        id: 'enr-1',
        status: 'COMPLETED',
        progress: 100,
      });
      mockPrisma.lmsLearningPath.update.mockResolvedValue({});
      mockPrisma.lmsLearningAnalytics.findUnique.mockResolvedValue({
        userId: 1,
      });
      mockPrisma.lmsLearningAnalytics.update.mockResolvedValue({});

      const result = await service.updatePathProgress('path-1', 'c2', 1);
      expect(result.status).toBe('COMPLETED');
    });

    it('deve lançar NotFoundException se inscrição não existir', async () => {
      mockPrisma.lmsPathEnrollment.findUnique.mockResolvedValue(null);
      await expect(
        service.updatePathProgress('path-1', 'c2', 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSession', () => {
    it('deve criar sessão com código SES-', async () => {
      mockPrisma.lmsLiveSession.findFirst.mockResolvedValue(null);
      mockPrisma.lmsLiveSession.create.mockResolvedValue({
        id: 'ses-1',
        code: 'SES-00001',
        title: 'Webinar',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createSession(
        { title: 'Webinar', scheduledAt: '2026-07-01T10:00:00Z', duration: 90 },
        1,
      );
      expect(result.code).toBe('SES-00001');
    });
  });

  describe('registerForSession', () => {
    it('deve registar utilizador na sessão', async () => {
      mockPrisma.lmsLiveSession.findUnique.mockResolvedValue({
        id: 'ses-1',
        maxAttendees: null,
        _count: { attendances: 0 },
      });
      mockPrisma.lmsLiveAttendance.findUnique.mockResolvedValue(null);
      mockPrisma.lmsLiveAttendance.create.mockResolvedValue({ id: 'att-1' });
      const result = await service.registerForSession('ses-1', 1);
      expect(result.id).toBe('att-1');
    });

    it('deve lançar ConflictException se sessão lotada', async () => {
      mockPrisma.lmsLiveSession.findUnique.mockResolvedValue({
        id: 'ses-1',
        maxAttendees: 2,
        _count: { attendances: 2 },
      });
      await expect(service.registerForSession('ses-1', 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve lançar NotFoundException se sessão não existir', async () => {
      mockPrisma.lmsLiveSession.findUnique.mockResolvedValue(null);
      await expect(service.registerForSession('nao-existe', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAttendance', () => {
    it('deve marcar presença e actualizar analytics', async () => {
      mockPrisma.lmsLiveAttendance.findUnique.mockResolvedValue({ id: 'att-1' });
      mockPrisma.lmsLiveAttendance.update.mockResolvedValue({
        id: 'att-1',
        attended: true,
      });
      mockPrisma.lmsLearningAnalytics.findUnique.mockResolvedValue({
        userId: 1,
      });
      mockPrisma.lmsLearningAnalytics.update.mockResolvedValue({});
      const result = await service.markAttendance('ses-1', 1);
      expect(result.attended).toBe(true);
    });
  });

  describe('getMyAnalytics', () => {
    it('deve criar analytics se não existirem', async () => {
      mockPrisma.lmsLearningAnalytics.findUnique.mockResolvedValue(null);
      mockPrisma.lmsLearningAnalytics.create.mockResolvedValue({
        userId: 1,
        totalHours: 0,
      });
      const result = await service.getMyAnalytics(1);
      expect(result.userId).toBe(1);
    });
  });

  describe('getRecommendations', () => {
    it('deve retornar percursos recomendados', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        roleId: 1,
        fullName: 'X',
      });
      mockPrisma.lmsPathEnrollment.findMany.mockResolvedValue([]);
      mockPrisma.lmsLearningPath.findMany.mockResolvedValue([
        { id: 'path-2', code: 'P2', name: 'Outro', level: 'BASIC' },
      ]);
      const result = await service.getRecommendations(1);
      expect(result).toHaveLength(1);
      expect(result[0].reason).toContain('Recomendado');
    });
  });

  describe('getLmsDashboard', () => {
    it('deve retornar totais e taxa de conclusão', async () => {
      mockPrisma.$transaction.mockResolvedValue([10, 8, 50, 30, 3, 15, []]);
      const result = await service.getLmsDashboard();
      expect(result.totals.pathCompletionRate).toBe(60);
    });
  });
});
