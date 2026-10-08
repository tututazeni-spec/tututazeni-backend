import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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
    groupBy: jest.fn(),
  },
  userCompetency: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    groupBy: jest.fn(),
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
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  competencyModel: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  competencyModelItem: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
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

    // docs/módulo_competencies.md §2 — Informações gerais + Configuração (Fase 1).
    it('grava code/family/objective/isCritical/isStrategic/isMandatory/isAssessable/isDevelopable/ownerId quando presentes', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.create.mockResolvedValue(baseCompetency);
      await service.create({
        name: 'Gestão de Projetos',
        category: CompetencyCategory.HARD_SKILL,
        code: 'COMP-001',
        family: 'Gestão',
        objective: 'Planear e entregar projetos',
        isCritical: true,
        isStrategic: true,
        isMandatory: true,
        isAssessable: false,
        isDevelopable: false,
        ownerId: 7,
      });
      expect(mockPrisma.competency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'COMP-001',
            family: 'Gestão',
            objective: 'Planear e entregar projetos',
            isCritical: true,
            isStrategic: true,
            isMandatory: true,
            isAssessable: false,
            isDevelopable: false,
            ownerId: 7,
          }),
        }),
      );
    });

    it('não envia code/family/ownerId quando ausentes', async () => {
      mockPrisma.competency.findFirst.mockResolvedValue(null);
      mockPrisma.competency.create.mockResolvedValue(baseCompetency);
      await service.create({ name: 'Y', category: CompetencyCategory.HARD_SKILL });
      const data = mockPrisma.competency.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('code');
      expect(data).not.toHaveProperty('family');
      expect(data).not.toHaveProperty('ownerId');
    });

    it('deve lançar ConflictException se código duplicado', async () => {
      mockPrisma.competency.findFirst
        .mockResolvedValueOnce(null) // check de nome
        .mockResolvedValueOnce(baseCompetency); // check de código
      await expect(
        service.create({
          name: 'Nova',
          category: CompetencyCategory.HARD_SKILL,
          code: 'COMP-001',
        }),
      ).rejects.toThrow(ConflictException);
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

    it('deve lançar ConflictException se código duplicado (excluindo a própria)', async () => {
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.competency.findFirst.mockResolvedValueOnce({ ...baseCompetency, id: 2 });
      await expect(service.update(1, { code: 'COMP-001' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // docs/módulo_competencies.md §1 — Visão Geral (Fase 1).
  describe('getOverview', () => {
    it('agrega totais, categorias, críticas/estratégicas, proficiência média e gaps', async () => {
      mockPrisma.competency.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2) // isCritical
        .mockResolvedValueOnce(1) // isStrategic
        .mockResolvedValueOnce(8) // ACTIVE
        .mockResolvedValueOnce(1); // IN_REVIEW
      mockPrisma.competency.groupBy.mockResolvedValue([
        { category: 'HARD_SKILL', _count: { category: 5 } },
        { category: 'SOFT_SKILL', _count: { category: 3 } },
      ]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([
        { userId: 1, competencyId: 1, currentLevel: 2, targetLevel: 4 },
        { userId: 2, competencyId: 1, currentLevel: 4, targetLevel: 4 },
      ]);
      mockPrisma.competency.findMany.mockResolvedValue([
        { id: 1, name: 'TypeScript', category: 'HARD_SKILL', isCritical: true },
      ]);
      mockPrisma.userCompetency.groupBy.mockResolvedValue([]);

      const result = await service.getOverview();

      expect(result.total).toBe(10);
      expect(result.critical).toBe(2);
      expect(result.strategic).toBe(1);
      expect(result.active).toBe(8);
      expect(result.inReview).toBe(1);
      expect(result.byCategory).toMatchObject({ technical: 5, behavioral: 3 });
      expect(result.evaluatedUsers).toBe(2);
      expect(result.biggestGaps[0]).toMatchObject({ id: 1, usersWithGap: 1 });
      expect(result.criticalAlerts).toHaveLength(1);
      expect(result.pendingEvaluations).toBeNull();
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

    it('com tag filtra pelo array `tags` (banco curado do feedback contínuo)', async () => {
      mockPrisma.competency.findMany.mockResolvedValue([]);
      await service.listCatalogue({ tag: 'FEEDBACK' });
      expect(mockPrisma.competency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { has: 'FEEDBACK' } }),
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

  // ─── Fase 2: Níveis de Proficiência (§3) + Modelos de Competências (§4) ──
  // docs/superpowers/specs/2026-09-25-competencies-fase2-design.md

  describe('findAllProficiencyLevels', () => {
    it('lista níveis sem filtros', async () => {
      mockPrisma.proficiencyLevel.findMany.mockResolvedValue([{ id: 1, value: 1 }]);
      const result = await service.findAllProficiencyLevels({});
      expect(result).toHaveLength(1);
      expect(mockPrisma.proficiencyLevel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filtra por competencyId', async () => {
      mockPrisma.proficiencyLevel.findMany.mockResolvedValue([]);
      await service.findAllProficiencyLevels({ competencyId: 7 });
      expect(mockPrisma.proficiencyLevel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { competencyId: 7 } }),
      );
    });
  });

  describe('updateProficiencyLevel', () => {
    it('lança NotFoundException se o nível não existir', async () => {
      mockPrisma.proficiencyLevel.findUnique.mockResolvedValue(null);
      await expect(service.updateProficiencyLevel(99, { name: 'x' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lança ConflictException ao trocar para um value já usado nessa competência', async () => {
      mockPrisma.proficiencyLevel.findUnique.mockResolvedValue({
        id: 1,
        competencyId: 1,
        value: 2,
      });
      mockPrisma.proficiencyLevel.findFirst.mockResolvedValue({ id: 2, value: 3 });
      await expect(service.updateProficiencyLevel(1, { value: 3 } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('actualiza o nível quando não há conflito', async () => {
      mockPrisma.proficiencyLevel.findUnique.mockResolvedValue({
        id: 1,
        competencyId: 1,
        value: 2,
      });
      mockPrisma.proficiencyLevel.update.mockResolvedValue({ id: 1, name: 'Básico' });
      const result = await service.updateProficiencyLevel(1, { name: 'Básico' } as any);
      expect(result.name).toBe('Básico');
    });
  });

  describe('findAllModels / findOneModel', () => {
    it('lista modelos paginados', async () => {
      mockPrisma.competencyModel.findMany.mockResolvedValue([{ id: 1, name: 'Liderança' }]);
      mockPrisma.competencyModel.count.mockResolvedValue(1);
      const result = await service.findAllModels({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('lança NotFoundException se o modelo não existir', async () => {
      mockPrisma.competencyModel.findUnique.mockResolvedValue(null);
      await expect(service.findOneModel(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createModel', () => {
    it('lança ConflictException se o código já existir', async () => {
      mockPrisma.competencyModel.findFirst.mockResolvedValue({ id: 1, code: 'LID' });
      await expect(service.createModel({ name: 'Liderança', code: 'LID' } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('cria o modelo quando o código é livre', async () => {
      mockPrisma.competencyModel.findFirst.mockResolvedValue(null);
      mockPrisma.competencyModel.create.mockResolvedValue({ id: 1, name: 'Liderança' });
      const result = await service.createModel({ name: 'Liderança' } as any);
      expect(result.id).toBe(1);
    });
  });

  describe('removeModel', () => {
    it('bloqueia remoção se o modelo tiver itens', async () => {
      mockPrisma.competencyModel.findUnique.mockResolvedValue({
        id: 1,
        _count: { items: 2 },
      });
      await expect(service.removeModel(1)).rejects.toThrow(BadRequestException);
    });

    it('remove o modelo sem itens', async () => {
      mockPrisma.competencyModel.findUnique.mockResolvedValue({
        id: 1,
        _count: { items: 0 },
      });
      mockPrisma.competencyModel.delete.mockResolvedValue({});
      const result = await service.removeModel(1);
      expect(result.message).toBeDefined();
    });
  });

  describe('upsertModelItem', () => {
    it('cria o item quando ainda não existe', async () => {
      mockPrisma.competencyModel.findUnique.mockResolvedValue({
        id: 1,
        items: [],
        _count: { items: 0 },
      });
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.competencyModelItem.findFirst.mockResolvedValue(null);
      mockPrisma.competencyModelItem.create.mockResolvedValue({ id: 1 });

      const result = await service.upsertModelItem(1, {
        competencyId: 1,
        expectedLevel: 3,
      } as any);

      expect(mockPrisma.competencyModelItem.create).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('actualiza o item quando já existe', async () => {
      mockPrisma.competencyModel.findUnique.mockResolvedValue({
        id: 1,
        items: [],
        _count: { items: 1 },
      });
      mockPrisma.competency.findUnique.mockResolvedValue(baseCompetency);
      mockPrisma.competencyModelItem.findFirst.mockResolvedValue({ id: 5 });
      mockPrisma.competencyModelItem.update.mockResolvedValue({ id: 5 });

      await service.upsertModelItem(1, { competencyId: 1, expectedLevel: 4 } as any);

      expect(mockPrisma.competencyModelItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 } }),
      );
    });
  });
});
