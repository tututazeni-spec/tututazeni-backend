import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CompetenciesService } from './competencies.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompetencyCategory } from './competencies.dto';

const mockPrisma = {
  competency: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  userCompetency: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  positionCompetency: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  courseCompetency: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  competencyEndorsement: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  competencyEvolutionLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  proficiencyLevel: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseCompetency = {
  id: 1,
  name: 'TypeScript',
  description: 'Linguagem TypeScript',
  category: CompetencyCategory.HARD_SKILL,
  status: 'ACTIVE',
  tags: ['typescript', 'javascript'],
  _count: { userCompetencies: 10, courses: 2, positions: 3 },
};

describe('CompetenciesService', () => {
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

  describe('findAll', () => {
    it('deve retornar competências paginadas', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([baseCompetency]);
      mockPrisma.competency.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve filtrar por category', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([]);
      mockPrisma.competency.count.mockResolvedValue(0);

      await service.findAll({ category: CompetencyCategory.HARD_SKILL });

      expect(mockPrisma.competency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: CompetencyCategory.HARD_SKILL }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar competência por id', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      const result = await service.findOne(1);
      expect(result.name).toBe('TypeScript');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar competência', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.create.mockResolvedValue(baseCompetency);
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);

      const result = await service.create({
        name: 'TypeScript',
        category: CompetencyCategory.HARD_SKILL,
      });
      expect(result.name).toBe('TypeScript');
    });

    it('deve lançar ConflictException se nome duplicado', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(baseCompetency);
      await expect(
        service.create({ name: 'TypeScript', category: CompetencyCategory.HARD_SKILL }),
      ).rejects.toThrow(ConflictException);
    });

    it('grava os campos do catálogo 360 (type/scale/isGlobal/tenantId) quando presentes', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.create.mockResolvedValue(baseCompetency);
      await service.create({
        name: 'Liderança',
        category: CompetencyCategory.SOFT_SKILL,
        type: 'LEADERSHIP' as any,
        scaleMin: 1,
        scaleMax: 7,
        isGlobal: false,
        tenantId: 't1',
      });
      expect(mockPrisma.competency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'LEADERSHIP',
            scaleMin: 1,
            scaleMax: 7,
            isGlobal: false,
            tenantId: 't1',
          }),
          include: { indicators: true },
        }),
      );
    });

    it('cria os indicadores aninhados quando enviados', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.create.mockResolvedValue(baseCompetency);
      await service.create({
        name: 'Comunicação',
        category: CompetencyCategory.SOFT_SKILL,
        indicators: [{ level: 1, description: 'Nível básico', examples: 'ex' }],
      });
      const data = mockPrisma.competency.create.mock.calls[0][0].data;
      expect(data.indicators).toEqual({
        create: [{ level: 1, description: 'Nível básico', examples: 'ex' }],
      });
    });

    it('não envia type/scale/tenantId quando ausentes (usa defaults do schema)', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.create.mockResolvedValue(baseCompetency);
      await service.create({ name: 'X', category: CompetencyCategory.HARD_SKILL });
      const data = mockPrisma.competency.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('type');
      expect(data).not.toHaveProperty('scaleMin');
      expect(data).not.toHaveProperty('tenantId');
      expect(data).not.toHaveProperty('indicators');
    });
  });

  describe('update', () => {
    it('deve actualizar competência', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.update.mockResolvedValue({ ...baseCompetency, name: 'TypeScript v2' });
      const result = await service.update(1, { name: 'TypeScript v2' });
      expect(result.name).toBe('TypeScript v2');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('faz strip de `indicators` (relação) antes do update escalar', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.update.mockResolvedValue(baseCompetency);
      await service.update(1, {
        description: 'nova',
        indicators: [{ level: 1, description: 'x' }],
      } as any);
      const data = mockPrisma.competency.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('indicators');
      expect(data).toMatchObject({ description: 'nova' });
    });
  });

  describe('listCatalogue', () => {
    it('filtra por isActive + isGlobal quando não há tenantId e inclui indicadores', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([baseCompetency]);
      const res = await service.listCatalogue({});
      expect(Array.isArray(res)).toBe(true);
      expect(mockPrisma.competency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true, isGlobal: true }),
          include: { indicators: { orderBy: { level: 'asc' } } },
          skip: 0,
          take: 50,
        }),
      );
    });

    it('com tenantId usa OR [isGlobal, tenantId] e aplica search/paginação', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([]);
      await service.listCatalogue({ tenantId: 't1', search: 'lid', offset: 10, limit: 5 });
      expect(mockPrisma.competency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            OR: [{ isGlobal: true }, { tenantId: 't1' }],
            name: { contains: 'lid' },
          }),
          skip: 10,
          take: 5,
        }),
      );
    });
  });

  describe('upsertUserCompetency', () => {
    it('deve fazer upsert da competência do utilizador', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.userCompetency.findFirst.mockResolvedValue(null);
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
        source: 'SELF_ASSESSMENT' as any,
      });

      expect(result).toBeDefined();
    });
  });
});
