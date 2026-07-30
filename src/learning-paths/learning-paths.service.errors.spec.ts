import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { LearningPathsService } from './learning-paths.service';
import { PrismaService } from '../prisma/prisma.service';

const publishedPath = {
  id: 1,
  title: 'Trilha Publicada',
  status: 'PUBLISHED',
  mandatory: false,
  deadline: null,
  courses: [{ courseId: 'c1', required: true }],
};

const mockPrisma = {
  learningPath: { findUnique: jest.fn() },
  learningPathAssignment: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  learningPathEnrollment: {
    findFirst: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
  },
  enrollment: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({}) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('LearningPathsService — assign / selfEnroll (requer PUBLISHED)', () => {
  let service: LearningPathsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [LearningPathsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LearningPathsService>(LearningPathsService);
  });

  it('assign rejeita trilha ainda não publicada (DRAFT)', async () => {
    mockPrisma.learningPath.findUnique.mockResolvedValue({ ...publishedPath, status: 'DRAFT' });
    await expect(
      service.assign({ learningPathId: 1, targetType: 'USER', targetId: 5 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.learningPathAssignment.create).not.toHaveBeenCalled();
  });

  it('assign por DEPARTMENT resolve os utilizadores activos do departamento', async () => {
    mockPrisma.learningPath.findUnique.mockResolvedValue(publishedPath);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockPrisma.enrollment.findFirst.mockResolvedValue(null);

    const result = await service.assign({
      learningPathId: 1,
      targetType: 'DEPARTMENT',
      targetId: 3,
    } as any);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: 3, active: true } }),
    );
    expect(result.total).toBe(2);
    expect(result.enrolled).toBe(2);
  });

  it('enrollUsersInPath salta cursos em que o utilizador já está inscrito', async () => {
    mockPrisma.learningPath.findUnique.mockResolvedValue(publishedPath);
    mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 99 }); // já inscrito

    const result = await service.enrollUsersInPath(1, [10]);

    expect(result).toEqual({ enrolled: 0, skipped: 1, total: 1 });
    expect(mockPrisma.enrollment.create).not.toHaveBeenCalled();
  });

  it('selfEnroll rejeita trilha não publicada', async () => {
    mockPrisma.learningPath.findUnique.mockResolvedValue({ ...publishedPath, status: 'ARCHIVED' });
    await expect(service.selfEnroll(1, 7)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('selfEnroll rejeita matrícula duplicada', async () => {
    mockPrisma.learningPath.findUnique.mockResolvedValue(publishedPath);
    mockPrisma.learningPathEnrollment.findFirst.mockResolvedValue({ id: 1 });
    await expect(service.selfEnroll(1, 7)).rejects.toBeInstanceOf(ConflictException);
  });

  it('selfEnroll bem-sucedido matricula o próprio utilizador', async () => {
    mockPrisma.learningPath.findUnique.mockResolvedValue(publishedPath);
    mockPrisma.learningPathEnrollment.findFirst.mockResolvedValue(null);
    mockPrisma.enrollment.findFirst.mockResolvedValue(null);

    const result = await service.selfEnroll(1, 7);

    expect(result.total).toBe(1);
    expect(mockPrisma.learningPathEnrollment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { learningPathId_userId: { learningPathId: 1, userId: 7 } },
      }),
    );
  });
});
