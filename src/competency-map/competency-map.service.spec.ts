import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompetencyMapService } from './competency-map.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockPrisma = {
  skillCategory: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  skill: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
  },
  legacyEmployeeSkill: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  skillAssessmentHistory: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  skillProficiencyLevel: { findMany: jest.fn().mockResolvedValue([]) },
  roleSkillRequirement: {
    deleteMany: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({}),
  },
  roleSkillMatrix: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  course: { findMany: jest.fn().mockResolvedValue([]) },
  user: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseSkill = {
  id: 1,
  name: 'TypeScript',
  type: 'HARD_SKILL',
  status: 'ACTIVE',
  _count: { legacyEmployeeSkills: 10 },
};

describe('CompetencyMapService', () => {
  let service: CompetencyMapService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetencyMapService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();
    service = module.get<CompetencyMapService>(CompetencyMapService);
  });

  describe('getCategories', () => {
    it('deve retornar categorias', async () => {
      mockPrisma.skillCategory.findMany.mockResolvedValue([{ id: 1, name: 'Tech' }]);
      const result = await service.getCategories();
      expect(result).toHaveLength(1);
    });
  });

  describe('getSkills', () => {
    it('deve retornar skills paginadas', async () => {
      mockPrisma.skill.findMany.mockResolvedValue([baseSkill]);
      mockPrisma.skill.count.mockResolvedValue(1);
      const result = await service.getSkills({});
      expect((result as any).data).toHaveLength(1);
    });
  });

  describe('getSkill', () => {
    it('deve retornar skill por id', async () => {
      mockPrisma.skill.findUnique.mockResolvedValue(baseSkill);
      const result = await service.getSkill(1);
      expect(result.name).toBe('TypeScript');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.skill.findUnique.mockResolvedValue(null);
      await expect(service.getSkill(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSkill', () => {
    it('deve criar skill', async () => {
      mockPrisma.skill.findFirst.mockResolvedValue(null);
      mockPrisma.skill.create.mockResolvedValue(baseSkill);
      mockPrisma.skill.findUnique.mockResolvedValue(baseSkill);

      const result = await service.createSkill(
        { name: 'TypeScript', type: 'HARD_SKILL' } as any,
        1,
      );
      expect(result.name).toBe('TypeScript');
    });
  });
});
