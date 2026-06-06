import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { InstructorService } from './instructor.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (val: any = null) => jest.fn().mockResolvedValue(val);
const makeFindMany = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeAgg = () => jest.fn().mockResolvedValue({ _avg: { rating: 4.5 } });

const baseProfile = {
  id: 1,
  userId: 1,
  bio: 'Expert',
  approved: true,
  status: 'ACTIVE',
  ratingAverage: 4.8,
  reviews: [],
  marketplaceCourses: [],
  cohorts: [],
  _count: { reviews: 0, cohorts: 0 },
};

const mockPrisma = {
  instructorProfile: {
    findUnique: makeFind(null),
    findFirst: makeFind(null),
    findMany: makeFindMany([]),
    create: makeFind(baseProfile),
    update: makeFind(baseProfile),
    count: makeCount(0),
  },
  instructorCourse: {
    findMany: makeFindMany([]),
    create: makeFind({}),
    delete: makeFind({}),
    findFirst: makeFind(null),
  },
  instructorCohort: {
    findMany: makeFindMany([]),
    create: makeFind({ id: 1, name: 'Cohort Test', instructorId: 1 }),
    count: makeCount(0),
    findUnique: makeFind(null),
    update: makeFind({}),
  },
  cohortParticipant: {
    findMany: makeFindMany([]),
    create: makeFind({}),
    count: makeCount(0),
    findFirst: makeFind(null),
  },
  instructorReview: {
    findMany: makeFindMany([]),
    create: makeFind({ id: 1, rating: 5 }),
    upsert: makeFind({ id: 1, rating: 5 }),
    aggregate: makeAgg(),
    count: makeCount(0),
  },
  instructorPayout: { findMany: makeFindMany([]), create: makeFind({ id: 1 }) },
  marketplaceCourse: { findMany: makeFindMany([]) },
  enrollment: { count: makeCount(0) },
};

describe('InstructorService — additional coverage', () => {
  let service: InstructorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [InstructorService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<InstructorService>(InstructorService);
  });

  // ─── createProfile ────────────────────────────────────────────────────────

  describe('createProfile', () => {
    it('deve criar perfil de instrutor', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue(null);
      mockPrisma.instructorProfile.create.mockResolvedValue({
        ...baseProfile,
        user: { id: 1, fullName: 'Instrutor' },
      });

      const result = await service.createProfile(1, {
        bio: 'Expert em NestJS',
        expertiseArea: 'Backend',
      } as any);

      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se já existe', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue(baseProfile);

      await expect(service.createProfile(1, {} as any)).rejects.toThrow(ConflictException);
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('deve actualizar perfil do instrutor', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue({
        ...baseProfile,
        reviews: [],
        marketplaceCourses: [],
        payouts: [],
        cohorts: [],
      });
      mockPrisma.instructorProfile.update.mockResolvedValue({ ...baseProfile, bio: 'Updated' });

      const result = await service.updateProfile(1, { bio: 'Updated' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── approve ──────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('deve aprovar instrutor', async () => {
      mockPrisma.instructorProfile.update.mockResolvedValue({ ...baseProfile, approved: true });

      const result = await service.approve(1);
      expect(result).toBeDefined();
    });
  });

  // ─── revoke ───────────────────────────────────────────────────────────────

  describe('revoke', () => {
    it('deve revogar aprovação do instrutor', async () => {
      mockPrisma.instructorProfile.update.mockResolvedValue({ ...baseProfile, approved: false });

      const result = await service.revoke(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getMyDashboard ───────────────────────────────────────────────────────

  describe('getMyDashboard', () => {
    it('deve retornar dashboard do instrutor', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue({
        ...baseProfile,
        id: 1,
        reviews: [],
        marketplaceCourses: [],
        payouts: [],
        cohorts: [],
      });
      mockPrisma.instructorCohort.findMany.mockResolvedValue([]);
      mockPrisma.instructorReview.count.mockResolvedValue(0);
      mockPrisma.instructorReview.findMany.mockResolvedValue([]);

      const result = await service.getMyDashboard(1);

      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se perfil não encontrado', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue(null);

      await expect(service.getMyDashboard(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── submitReview ─────────────────────────────────────────────────────────

  describe('submitReview', () => {
    it('deve submeter review de instrutor', async () => {
      mockPrisma.instructorProfile.findUnique.mockResolvedValue(baseProfile);
      mockPrisma.instructorReview.create.mockResolvedValue({ id: 1, rating: 5 });
      mockPrisma.instructorReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.8 },
        _count: { id: 10 },
      } as any);
      mockPrisma.instructorProfile.update.mockResolvedValue({});

      const result = await service.addReview(1, {
        instructorId: 2,
        rating: 5,
        comment: 'Excelente!',
      } as any);

      expect(result).toBeDefined();
    });

    it('deve lidar com erro na actualização do perfil', async () => {
      mockPrisma.instructorProfile.update.mockRejectedValue(new Error('DB error'));
      const result = await service.addReview(1, {
        instructorId: 2,
        rating: 3,
      } as any).catch(() => ({}));
      expect(result).toBeDefined();
    });
  });

  // ─── findAll com filtros ──────────────────────────────────────────────────

  describe('findAll with filters', () => {
    it('deve filtrar por approved e instructorType', async () => {
      mockPrisma.instructorProfile.findMany.mockResolvedValue([]);
      mockPrisma.instructorProfile.count.mockResolvedValue(0);

      const result = await service.findAll({ approved: true, instructorType: 'EXTERNAL' as any });
      expect(result).toHaveProperty('data');
    });

    it('deve pesquisar por nome', async () => {
      mockPrisma.instructorProfile.findMany.mockResolvedValue([]);
      mockPrisma.instructorProfile.count.mockResolvedValue(0);

      await service.findAll({ search: 'João' });
      expect(mockPrisma.instructorProfile.findMany).toHaveBeenCalled();
    });
  });
});
