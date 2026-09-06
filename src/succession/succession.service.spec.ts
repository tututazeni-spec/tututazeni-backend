import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SuccessionService } from './succession.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  criticalPosition: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  successionPlan: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  successionCandidate: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  talentPool: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  position: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  developmentPlan: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

const basePosition = { id: 1, name: 'CTO', level: 10 };
const baseCritical = {
  id: 1,
  positionId: 1,
  riskLevel: 'HIGH',
  vacancyProbability: 80,
  position: basePosition,
  candidates: [],
  _count: { candidates: 0 },
};
const basePlan = {
  id: 1,
  positionId: 1,
  status: 'ACTIVE',
  position: basePosition,
  candidates: [],
  approvals: [],
  _count: { candidates: 2 },
};

describe('SuccessionService', () => {
  let service: SuccessionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [SuccessionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SuccessionService>(SuccessionService);
  });

  describe('createCriticalPosition', () => {
    it('deve criar posição crítica', async () => {
      mockPrisma.position.findUnique.mockResolvedValue(basePosition);
      mockPrisma.criticalPosition.findUnique.mockResolvedValue(null);
      mockPrisma.criticalPosition.create.mockResolvedValue(baseCritical);

      const result = await service.createCriticalPosition({
        positionId: 1,
        riskLevel: 'HIGH',
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se posição não encontrada', async () => {
      mockPrisma.position.findUnique.mockResolvedValue(null);
      await expect(service.createCriticalPosition({ positionId: 99 } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar ConflictException se já é crítica', async () => {
      mockPrisma.position.findUnique.mockResolvedValue(basePosition);
      mockPrisma.criticalPosition.findUnique.mockResolvedValue(baseCritical);
      await expect(service.createCriticalPosition({ positionId: 1 } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getCriticalPositions', () => {
    it('deve retornar posições críticas', async () => {
      mockPrisma.criticalPosition.findMany.mockResolvedValue([baseCritical]);
      mockPrisma.criticalPosition.count.mockResolvedValue(1);

      const result = await service.getCriticalPositions({});
      expect((result as any).data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('deve retornar plano de sucessão por id', async () => {
      mockPrisma.successionPlan.findUnique.mockResolvedValue(basePlan);
      const result = await service.findOne(1);
      expect(result.id).toBe(1);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.successionPlan.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    beforeEach(() => {
      mockPrisma.criticalPosition.findUnique.mockResolvedValue(baseCritical);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, fullName: 'Candidato', positionId: 1 });
      mockPrisma.successionPlan.findFirst.mockResolvedValue(null);
      mockPrisma.successionPlan.count.mockResolvedValue(0);
      mockPrisma.successionPlan.create.mockResolvedValue(basePlan);
    });

    it('deve criar plano de sucessão', async () => {
      const result = await service.create({ criticalPositionId: 1, candidateId: 2 } as any);
      expect(result).toBeDefined();
    });

    it('usa a priority do DTO quando fornecida', async () => {
      await service.create({
        criticalPositionId: 1,
        candidateId: 2,
        readinessLevel: 'READY_NOW',
        priority: 'SECONDARY',
      } as any);
      expect(mockPrisma.successionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ priority: 'SECONDARY' }) }),
      );
      expect(mockPrisma.successionPlan.count).not.toHaveBeenCalled();
    });

    it('calcula a priority por contagem quando ausente (0 → PRIMARY)', async () => {
      mockPrisma.successionPlan.count.mockResolvedValue(0);
      await service.create({
        criticalPositionId: 1,
        candidateId: 2,
        readinessLevel: 'READY_NOW',
      } as any);
      expect(mockPrisma.successionPlan.count).toHaveBeenCalledWith({
        where: { criticalPositionId: 1 },
      });
      expect(mockPrisma.successionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ priority: 'PRIMARY' }) }),
      );
    });

    it('calcula a priority por contagem (1 → SECONDARY, >=2 → TERTIARY)', async () => {
      mockPrisma.successionPlan.count.mockResolvedValue(1);
      await service.create({
        criticalPositionId: 1,
        candidateId: 2,
        readinessLevel: 'READY_NOW',
      } as any);
      expect(mockPrisma.successionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ priority: 'SECONDARY' }) }),
      );
      mockPrisma.successionPlan.count.mockResolvedValue(5);
      await service.create({
        criticalPositionId: 1,
        candidateId: 2,
        readinessLevel: 'READY_NOW',
      } as any);
      expect(mockPrisma.successionPlan.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ priority: 'TERTIARY' }) }),
      );
    });

    it('emite uma notificação SUCCESSION_PLAN_ADDED', async () => {
      await service.create({
        criticalPositionId: 1,
        candidateId: 2,
        readinessLevel: 'READY_NOW',
      } as any);
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 2, type: 'SUCCESSION_PLAN_ADDED' }),
        }),
      );
    });

    it('colisão @@unique (P2002) → ConflictException', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockPrisma.successionPlan.create.mockRejectedValue(p2002);
      await expect(
        service.create({
          criticalPositionId: 1,
          candidateId: 2,
          readinessLevel: 'READY_NOW',
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('deve retornar planos paginados', async () => {
      mockPrisma.successionPlan.findMany.mockResolvedValue([basePlan]);
      mockPrisma.successionPlan.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect((result as any).data).toHaveLength(1);
    });
  });
});
