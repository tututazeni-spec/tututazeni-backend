import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CompetencyMapService } from './competency-map.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const mockPrisma: any = {
  skillCategory: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
  skill: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  skillProficiencyLevel: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
  },
  roleSkillMatrix: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  roleSkillRequirement: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  legacyEmployeeSkill: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  skillAssessmentHistory: { create: jest.fn().mockResolvedValue({}) },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseSkill = {
  id: 1,
  name: 'TypeScript',
  type: 'TECHNICAL',
  categoryId: 1,
  maxLevel: 5,
  active: true,
  tags: ['programming'],
  category: { id: 1, name: 'Programação' },
  proficiencyLevels: [],
  _count: { employeeSkills: 0, roleRequirements: 0 },
};

const baseMatrix = {
  id: 1,
  roleCode: 'SENIOR_DEV',
  department: 'TI',
  requirements: [
    { id: 1, skillId: 1, requiredLevel: 4, weight: 100, mandatory: true, skill: baseSkill },
  ],
};

describe('CompetencyMapService (additional)', () => {
  let service: CompetencyMapService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetencyMapService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<CompetencyMapService>(CompetencyMapService);
  });

  // ─── createCategory ───────────────────────────────────────────

  describe('createCategory', () => {
    it('deve criar categoria de skill', async () => {
      mockPrisma.skillCategory.create.mockResolvedValue({ id: 1, name: 'Programação' });
      const result = await service.createCategory({ name: 'Programação' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getCategories ────────────────────────────────────────────

  describe('getCategories', () => {
    it('deve retornar categorias activas', async () => {
      mockPrisma.skillCategory.findMany.mockResolvedValue([{ id: 1, name: 'Programação' }]);
      const result = await service.getCategories();
      expect(result).toHaveLength(1);
    });
  });

  // ─── createSkill ──────────────────────────────────────────────

  describe('createSkill', () => {
    it('deve criar skill e registar auditoria', async () => {
      mockPrisma.skill.create.mockResolvedValue(baseSkill);
      const result = await service.createSkill(
        { name: 'TypeScript', type: 'TECHNICAL', categoryId: 1 } as any,
        1,
      );
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SKILL_CREATED' }),
      );
    });
  });

  // ─── getSkills ────────────────────────────────────────────────

  describe('getSkills', () => {
    it('deve retornar skills paginados com filtros', async () => {
      mockPrisma.skill.findMany.mockResolvedValue([baseSkill]);
      mockPrisma.skill.count.mockResolvedValue(1);
      const result = await service.getSkills({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por search, type, categoryId', async () => {
      mockPrisma.skill.findMany.mockResolvedValue([]);
      mockPrisma.skill.count.mockResolvedValue(0);
      await service.getSkills({ search: 'TypeScript', type: 'TECHNICAL' as any, categoryId: 1 });
      expect(mockPrisma.skill.findMany).toHaveBeenCalled();
    });
  });

  // ─── getSkill ─────────────────────────────────────────────────

  describe('getSkill', () => {
    it('deve retornar skill por id', async () => {
      mockPrisma.skill.findUnique.mockResolvedValue(baseSkill);
      const result = await service.getSkill(1);
      expect(result).toBeDefined();
      expect(result.name).toBe('TypeScript');
    });

    it('deve lançar NotFoundException se skill não existe', async () => {
      mockPrisma.skill.findUnique.mockResolvedValue(null);
      await expect(service.getSkill(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateSkill ──────────────────────────────────────────────

  describe('updateSkill', () => {
    it('deve actualizar skill', async () => {
      mockPrisma.skill.findUnique.mockResolvedValue(baseSkill);
      mockPrisma.skill.update.mockResolvedValue({ ...baseSkill, name: 'TypeScript 5.x' });
      const result = await service.updateSkill(1, { name: 'TypeScript 5.x' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── setProficiencyLevels ─────────────────────────────────────

  describe('setProficiencyLevels', () => {
    it('deve criar/actualizar níveis de proficiência', async () => {
      mockPrisma.skillProficiencyLevel.upsert.mockResolvedValue({ id: 1, skillId: 1, level: 3 });
      const result = await service.setProficiencyLevels({
        skillId: 1,
        level: 3,
        name: 'Avançado',
        description: 'Domínio avançado',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── setRoleSkillMatrix ───────────────────────────────────────

  describe('setRoleSkillMatrix', () => {
    it('deve definir matriz de skills para um role', async () => {
      mockPrisma.roleSkillMatrix.upsert.mockResolvedValue(baseMatrix);
      mockPrisma.roleSkillRequirement.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.roleSkillMatrix.findUnique.mockResolvedValue(baseMatrix);
      const result = await service.setRoleSkillMatrix({
        roleCode: 'SENIOR_DEV',
        department: 'TI',
        skills: [{ skillId: 1, requiredLevel: 4, weight: 100, mandatory: true }],
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getRoleSkillMatrix ───────────────────────────────────────

  describe('getRoleSkillMatrix', () => {
    it('deve retornar matriz de skills do role', async () => {
      mockPrisma.roleSkillMatrix.findUnique.mockResolvedValue(baseMatrix);
      const result = await service.getRoleSkillMatrix('SENIOR_DEV');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se matriz não existe', async () => {
      mockPrisma.roleSkillMatrix.findUnique.mockResolvedValue(null);
      await expect(service.getRoleSkillMatrix('UNKNOWN')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── upsertEmployeeSkill ──────────────────────────────────────

  describe('upsertEmployeeSkill', () => {
    it('deve criar/actualizar skill do colaborador', async () => {
      mockPrisma.legacyEmployeeSkill.findUnique.mockResolvedValue(null);
      mockPrisma.legacyEmployeeSkill.upsert.mockResolvedValue({
        id: 1,
        userId: 1,
        skillId: 1,
        currentLevel: 3,
      });
      const result = await service.upsertEmployeeSkill(
        {
          userId: 1,
          skillId: 1,
          currentLevel: 3,
          source: 'MANAGER' as any,
        } as any,
        2,
      );
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException para autoavaliação de nível 5 sem validação', async () => {
      await expect(
        service.upsertEmployeeSkill(
          {
            userId: 1,
            skillId: 1,
            currentLevel: 5,
            source: 'SELF' as any,
            managerValidated: false,
          } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getEmployeeSkills ────────────────────────────────────────

  describe('getEmployeeSkills', () => {
    it('deve retornar skills do colaborador', async () => {
      mockPrisma.legacyEmployeeSkill.findMany.mockResolvedValue([
        { id: 1, userId: 1, skill: baseSkill, currentLevel: 3 },
      ]);
      const result = await service.getEmployeeSkills(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getGapAnalysis ───────────────────────────────────────────

  describe('getGapAnalysis', () => {
    it('deve retornar análise de gaps para colaborador com role definido', async () => {
      mockPrisma.legacyEmployeeSkill.findMany.mockResolvedValue([{ skillId: 1, currentLevel: 3 }]);
      mockPrisma.roleSkillMatrix.findUnique.mockResolvedValue(baseMatrix);
      const result = await service.getGapAnalysis('SENIOR_DEV', 1);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('gaps');
      expect(result).toHaveProperty('readinessScore');
    });
  });
});
