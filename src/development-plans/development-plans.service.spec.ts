import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DevelopmentPlansService } from './development-plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanStatus } from './development-plans.dto';

const mockPrisma = {
  developmentPlan: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  developmentPlanAction: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  planActionEvidence: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  planGoal: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  planCheckpoint: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  planApproval: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  certificate: { create: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

const basePlan = {
  id: 1,
  name: 'PDI 2024',
  goal: 'Melhorar competências técnicas',
  userId: 1,
  managerId: 2,
  status: 'DRAFT',
  priority: 'MEDIUM',
  actions: [],
  goals: [],
  checkpoints: [],
  approvals: [],
  certificates: [],
  _count: { actions: 0, goals: 0, checkpoints: 0 },
  user: {
    id: 1,
    fullName: 'Test User',
    email: 'test@innova.com',
    avatarUrl: null,
    position: null,
    department: null,
  },
  manager: { id: 2, fullName: 'Manager', avatarUrl: null },
};

describe('DevelopmentPlansService', () => {
  let service: DevelopmentPlansService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [DevelopmentPlansService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<DevelopmentPlansService>(DevelopmentPlansService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar planos paginados com progresso calculado', async () => {
      const plan = {
        ...basePlan,
        actions: [
          { id: 1, status: 'COMPLETED' },
          { id: 2, status: 'IN_PROGRESS' },
        ],
        goals: [
          { id: 1, progress: 50 },
          { id: 2, progress: 80 },
        ],
      };
      mockPrisma.developmentPlan.findMany.mockResolvedValue([plan]);
      mockPrisma.developmentPlan.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).actionProgress).toBe(50);
      expect((result.data[0] as any).avgGoalProgress).toBe(65);
    });

    it('deve filtrar por userId e status', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([]);
      mockPrisma.developmentPlan.count.mockResolvedValue(0);

      await service.findAll({ userId: 1, status: PlanStatus.ACTIVE });

      expect(mockPrisma.developmentPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 1, status: 'ACTIVE' }),
        }),
      );
    });

    it('deve calcular 0% se sem acções', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([
        { ...basePlan, actions: [], goals: [] },
      ]);
      mockPrisma.developmentPlan.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect((result.data[0] as any).actionProgress).toBe(0);
      expect((result.data[0] as any).avgGoalProgress).toBe(0);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar plano com progresso', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        actions: [{ id: 1, status: 'COMPLETED', evidence: [] }],
        goals: [{ id: 1, progress: 75 }],
      });

      const result = await service.findOne(1);

      expect(result.name).toBe('PDI 2024');
      expect((result as any).actionProgress).toBe(100);
      expect((result as any).avgGoalProgress).toBe(75);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar plano e enviar notificação', async () => {
      mockPrisma.developmentPlan.create.mockResolvedValue(basePlan);

      const result = await service.create({
        name: 'PDI 2024',
        goal: 'Melhorar skills',
        userId: 1,
        managerId: 2,
      });

      expect(result.name).toBe('PDI 2024');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            type: 'PDI_CREATED',
            metadata: expect.any(String),
          }),
        }),
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar plano com sucesso', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue({
        ...basePlan,
        actions: [],
        goals: [],
      });
      mockPrisma.developmentPlan.update.mockResolvedValue({ ...basePlan, name: 'PDI Actualizado' });

      const result = await service.update(1, { name: 'PDI Actualizado' });

      expect(result.name).toBe('PDI Actualizado');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });
});
