import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InstructorService } from './instructor.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  instructorProfile: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  instructorCourse: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
  },
  instructorCohort: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  cohortParticipant: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  instructorReview: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 0 } }),
  },
  instructorPayout: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  marketplaceCourse: { findMany: jest.fn().mockResolvedValue([]) },
  enrollment: { count: jest.fn().mockResolvedValue(0) },
};

const baseProfile = {
  id: 1,
  userId: 1,
  bio: 'Expert em NestJS',
  specialties: ['TypeScript'],
  status: 'ACTIVE',
  rating: 4.8,
  totalStudents: 100,
};

describe('InstructorService', () => {
  let service: InstructorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [InstructorService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<InstructorService>(InstructorService);
  });

  describe('findAll', () => {
    it('deve retornar instrutores paginados', async () => {
      mockPrisma.instructorProfile.findMany.mockResolvedValue([baseProfile]);
      mockPrisma.instructorProfile.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar instrutor por id', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue(baseProfile);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUser', () => {
    it('deve retornar perfil por userId', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue({
        ...baseProfile,
        reviews: [],
        marketplaceCourses: [],
        cohorts: [],
        _count: { reviews: 0, cohorts: 0 },
      });
      const result = await service.findByUser(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue(null);
      await expect(service.findByUser(99)).rejects.toThrow(NotFoundException);
    });
  });
});
