import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CompetenciesService } from './competencies.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  competency: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  userCompetency: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  competencyEndorsement: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  positionCompetency: {
    findFirst: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  courseCompetency: {
    findFirst: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  competencyProficiencyLevel: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  position: { findMany: jest.fn().mockResolvedValue([]) },
  competencyEvolutionLog: { create: jest.fn().mockResolvedValue({}) },
  proficiencyLevel: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, competencyId: 1, value: 3 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const baseCompetency = {
  id: 1,
  name: 'TypeScript',
  category: 'TECH',
  status: 'ACTIVE',
  tags: ['programming'],
  description: 'TypeScript programming',
  courses: [],
  positions: [],
  proficiencyLevels: [],
  _count: { userCompetencies: 0, endorsements: 0 },
};

describe('CompetenciesService (additional)', () => {
  let service: CompetenciesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompetenciesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CompetenciesService>(CompetenciesService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de competências', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([baseCompetency]);
      mockPrisma.competency.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve filtrar por search', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([]);
      mockPrisma.competency.count.mockResolvedValue(0);
      await service.findAll({ search: 'TypeScript' });
      expect(mockPrisma.competency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });

    it('deve filtrar por category e status', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([]);
      mockPrisma.competency.count.mockResolvedValue(0);
      await service.findAll({ category: 'TECH' as any, status: 'ACTIVE' as any });
      expect(mockPrisma.competency.findMany).toHaveBeenCalled();
    });

    it('deve filtrar por tag', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([]);
      mockPrisma.competency.count.mockResolvedValue(0);
      await service.findAll({ tag: 'programming' });
      expect(mockPrisma.competency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { has: 'programming' } }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar competência por id', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
      expect(result.name).toBe('TypeScript');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar competência', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.create.mockResolvedValue(baseCompetency);
      const result = await service.create({ name: 'TypeScript', category: 'TECH' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se nome já existe', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(baseCompetency);
      await expect(service.create({ name: 'TypeScript', category: 'TECH' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar competência', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.competency.findFirst.mockResolvedValue(null); // no name conflict
      mockPrisma.competency.update.mockResolvedValue({
        ...baseCompetency,
        name: 'TypeScript Advanced',
      });
      const result = await service.update(1, { name: 'TypeScript Advanced' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se competência não existe', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('deve eliminar competência sem utilizadores associados', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue({
        ...baseCompetency,
        _count: { userCompetencies: 0, endorsements: 0 },
      });
      mockPrisma.competency.delete.mockResolvedValue(baseCompetency);
      await service.remove(1);
      expect(mockPrisma.competency.delete).toHaveBeenCalled();
    });
  });

  // ─── upsertUserCompetency ─────────────────────────────────────

  describe('upsertUserCompetency', () => {
    it('deve criar/actualizar competência do utilizador', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.userCompetency.upsert.mockResolvedValue({
        id: 1,
        userId: 1,
        competencyId: 1,
        currentLevel: 3,
      });
      const result = await service.upsertUserCompetency({
        userId: 1,
        competencyId: 1,
        currentLevel: 3,
        source: 'SELF' as any,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── selfAssess ───────────────────────────────────────────────

  describe('selfAssess', () => {
    it('deve registar auto-avaliação de competências', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.userCompetency.upsert.mockResolvedValue({ id: 1 });
      const result = await service.selfAssess(1, {
        assessments: [{ competencyId: 1, level: 3, evidence: 'Projecto X' }],
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── managerAssess ────────────────────────────────────────────

  describe('managerAssess', () => {
    it('deve registar avaliação do gestor', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.userCompetency.upsert.mockResolvedValue({ id: 1 });
      const result = await service.managerAssess(1, {
        userId: 2,
        assessments: [{ competencyId: 1, level: 4, feedback: 'Boa evolução' }],
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── mapToPosition ────────────────────────────────────────────

  describe('mapToPosition', () => {
    it('deve mapear competência a posição', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.positionCompetency.upsert.mockResolvedValue({ competencyId: 1, positionId: 1 });
      const result = await service.mapToPosition({
        competencyId: 1,
        positionId: 1,
        requiredLevel: 3,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── mapToCourse ──────────────────────────────────────────────

  describe('mapToCourse', () => {
    it('deve mapear competência a curso', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.courseCompetency.upsert.mockResolvedValue({ competencyId: 1, courseId: 1 });
      const result = await service.mapToCourse({
        competencyId: 1,
        courseId: 1,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── addEndorsement ───────────────────────────────────────────

  describe('addEndorsement', () => {
    it('deve criar endorsement de competência', async () => {
      mockPrisma.competencyEndorsement.findFirst.mockResolvedValue(null);
      mockPrisma.competencyEndorsement.create.mockResolvedValue({ id: 1 });
      const result = await service.addEndorsement(1, {
        userId: 2,
        competencyId: 1,
        message: 'Excelente',
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se endorsement já existe', async () => {
      mockPrisma.competencyEndorsement.findFirst.mockResolvedValue({ id: 1 });
      await expect(
        service.addEndorsement(1, { userId: 2, competencyId: 1 } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── createProficiencyLevel ───────────────────────────────────

  describe('createProficiencyLevel', () => {
    it('deve adicionar nível de proficiência à competência', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.proficiencyLevel.findFirst.mockResolvedValue(null); // no conflict
      mockPrisma.proficiencyLevel.create.mockResolvedValue({
        id: 1,
        competencyId: 1,
        value: 3,
      });
      const result = await service.createProficiencyLevel({
        competencyId: 1,
        value: 3,
        name: 'Avançado',
        description: 'Domínio avançado',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getOrgGapDashboard ───────────────────────────────────────

  describe('getOrgGapDashboard', () => {
    it('deve retornar análise de gaps de competências', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1, positionId: 1 }]);
      mockPrisma.positionCompetency.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      const result = await service.getOrgGapDashboard();
      expect(result).toBeDefined();
    });
  });
});
