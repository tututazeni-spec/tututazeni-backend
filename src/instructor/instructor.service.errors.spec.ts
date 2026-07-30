import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InstructorService } from './instructor.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  instructorProfile: { findUnique: jest.fn() },
  instructorCohort: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  cohortParticipant: {
    count: jest.fn().mockResolvedValue(0),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  enrollment: {
    upsert: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  instructorPayout: { findMany: jest.fn().mockResolvedValue([]) },
};

describe('InstructorService — turmas (ownership por instrutor)', () => {
  let service: InstructorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    mockPrisma.instructorProfile.findUnique.mockResolvedValue({ id: 100, userId: 7 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [InstructorService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<InstructorService>(InstructorService);
  });

  it('updateCohort de turma que não pertence ao instrutor → NotFoundException', async () => {
    mockPrisma.instructorCohort.findFirst.mockResolvedValue(null);
    await expect(service.updateCohort(1, 7, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.instructorCohort.update).not.toHaveBeenCalled();
  });

  it('updateCohort da própria turma → sucesso', async () => {
    mockPrisma.instructorCohort.findFirst.mockResolvedValue({ id: 1, instructorId: 100 });
    mockPrisma.instructorCohort.update.mockResolvedValue({ id: 1, name: 'Turma A' });
    await expect(service.updateCohort(1, 7, { name: 'Turma A' } as any)).resolves.toBeDefined();
  });

  it('addParticipants recusa exceder a capacidade máxima da turma', async () => {
    mockPrisma.instructorCohort.findFirst.mockResolvedValue({
      id: 1,
      instructorId: 100,
      maxParticipants: 2,
      courseId: null,
    });
    mockPrisma.cohortParticipant.count.mockResolvedValue(1);

    await expect(
      service.addParticipants(1, 7, { userIds: [10, 11] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.cohortParticipant.createMany).not.toHaveBeenCalled();
  });

  it('addParticipants dentro da capacidade inscreve automaticamente no curso', async () => {
    mockPrisma.instructorCohort.findFirst.mockResolvedValue({
      id: 1,
      instructorId: 100,
      maxParticipants: 5,
      courseId: 'course-1',
    });
    mockPrisma.cohortParticipant.count.mockResolvedValue(0);

    const result = await service.addParticipants(1, 7, { userIds: [10] } as any);

    expect(result).toEqual({ added: 1 });
    expect(mockPrisma.enrollment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId_userId: { courseId: 'course-1', userId: 10 } } }),
    );
  });

  it('removeParticipant de turma alheia → NotFoundException', async () => {
    mockPrisma.instructorCohort.findFirst.mockResolvedValue(null);
    await expect(service.removeParticipant(1, 10, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.cohortParticipant.deleteMany).not.toHaveBeenCalled();
  });

  it('removeParticipant da própria turma remove o participante', async () => {
    mockPrisma.instructorCohort.findFirst.mockResolvedValue({ id: 1, instructorId: 100 });
    const result = await service.removeParticipant(1, 10, 7);
    expect(mockPrisma.cohortParticipant.deleteMany).toHaveBeenCalledWith({
      where: { cohortId: 1, userId: 10 },
    });
    expect(result).toHaveProperty('message');
  });

  it('getCohortDetail de turma alheia → NotFoundException', async () => {
    mockPrisma.instructorCohort.findFirst.mockResolvedValue(null);
    await expect(service.getCohortDetail(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InstructorService — pagamentos e histórico', () => {
  let service: InstructorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [InstructorService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<InstructorService>(InstructorService);
  });

  it('getPayoutHistory está sempre limitado ao próprio perfil do instrutor', async () => {
    mockPrisma.instructorProfile.findUnique.mockResolvedValue({ id: 100, userId: 7 });
    await service.getPayoutHistory(7);
    expect(mockPrisma.instructorPayout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { instructorId: 100 } }),
    );
  });
});
