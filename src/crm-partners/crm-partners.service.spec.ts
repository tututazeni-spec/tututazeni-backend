import { Test, TestingModule } from '@nestjs/testing';
import { CrmPartnersService } from './crm-partners.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockPartner = {
  id: 'par-1',
  code: 'PAR-00001',
  name: 'EVOS Tecnologia',
  type: 'TECHNOLOGY',
  tier: 'GOLD',
  status: 'ACTIVE',
  deletedAt: null,
  createdBy: { fullName: 'Admin' },
  assignedTo: null,
  interactions: [],
  milestones: [],
  _count: { interactions: 0 },
};

const mockPrisma = {
  partner: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  partnerInteraction: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  partnerMilestone: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('CrmPartnersService', () => {
  let service: CrmPartnersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmPartnersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CrmPartnersService>(CrmPartnersService);
    jest.clearAllMocks();
  });

  // ─── CREATE ──────────────────────────────────────────

  describe('create', () => {
    it('deve criar parceiro com código PAR- auto-gerado', async () => {
      mockPrisma.partner.findFirst.mockResolvedValue(null);
      mockPrisma.partner.create.mockResolvedValue(mockPartner);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(
        { name: 'EVOS Tecnologia', type: 'TECHNOLOGY' as any },
        1,
      );
      expect(result.code).toBe('PAR-00001');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entity: 'Partner',
            action: 'CREATE',
          }),
        }),
      );
    });

    it('deve incrementar código para PAR-00002', async () => {
      mockPrisma.partner.findFirst.mockResolvedValue({ code: 'PAR-00001' });
      mockPrisma.partner.create.mockResolvedValue({
        ...mockPartner,
        code: 'PAR-00002',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(
        { name: 'Outro Parceiro', type: 'COMMERCIAL' as any },
        1,
      );
      expect(result.code).toBe('PAR-00002');
    });
  });

  // ─── FIND ALL ────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada com totais', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockPartner], 1]);
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toMatchObject({
        data: expect.any(Array),
        total: 1,
        totalPages: 1,
      });
    });

    it('deve filtrar por tipo, tier e status', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      const result = await service.findAll({
        type: 'TECHNOLOGY' as any,
        tier: 'GOLD' as any,
        status: 'ACTIVE' as any,
      });
      expect(result.total).toBe(0);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar parceiro com interacções e milestones', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      const result = await service.findOne('par-1');
      expect(result.id).toBe('par-1');
    });

    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nao-existe')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar NotFoundException se deletedAt preenchido', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue({
        ...mockPartner,
        deletedAt: new Date(),
      });
      await expect(service.findOne('par-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── UPDATE ──────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar e criar auditLog', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      mockPrisma.partner.update.mockResolvedValue({
        ...mockPartner,
        name: 'Nome Actualizado',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.update(
        'par-1',
        { name: 'Nome Actualizado' } as any,
        1,
      );
      expect(result.name).toBe('Nome Actualizado');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ─── SOFT DELETE ─────────────────────────────────────

  describe('softDelete', () => {
    it('deve definir deletedAt e status INACTIVE', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      mockPrisma.partner.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.softDelete('par-1', 1);
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.partner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            status: 'INACTIVE',
          }),
        }),
      );
    });
  });

  // ─── INTERACÇÕES ─────────────────────────────────────

  describe('addInteraction', () => {
    it('deve criar interacção e actualizar lastContactAt', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      mockPrisma.partnerInteraction.create.mockResolvedValue({
        id: 'int-1',
        type: 'MEETING',
        subject: 'Reunião anual',
        user: { fullName: 'User Teste' },
      });
      mockPrisma.partnerInteraction.findMany.mockResolvedValue([]);
      mockPrisma.partner.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addInteraction(
        'par-1',
        {
          type: 'MEETING' as any,
          subject: 'Reunião anual',
          description: 'Desc',
        } as any,
        1,
      );
      expect(result.type).toBe('MEETING');
      expect(mockPrisma.partner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastContactAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('getInteractions', () => {
    it('deve retornar interacções paginadas', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      mockPrisma.$transaction.mockResolvedValue([
        [{ id: 'int-1', type: 'MEETING' }],
        1,
      ]);
      const result = await service.getInteractions('par-1', 1, 20);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  // ─── MILESTONES ──────────────────────────────────────

  describe('addMilestone', () => {
    it('deve criar milestone com createdById e auditLog', async () => {
      mockPrisma.partner.findUnique.mockResolvedValue(mockPartner);
      mockPrisma.partnerMilestone.create.mockResolvedValue({
        id: 'mil-1',
        title: 'Lançamento',
        status: 'PENDING',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addMilestone(
        'par-1',
        { title: 'Lançamento', dueDate: '2026-12-31' } as any,
        1,
      );
      expect(result.id).toBe('mil-1');
      expect(mockPrisma.partnerMilestone.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: 1,
            dueDate: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('completeMilestone', () => {
    it('deve concluir milestone existente', async () => {
      mockPrisma.partnerMilestone.findUnique.mockResolvedValue({
        id: 'mil-1',
        status: 'PENDING',
      });
      mockPrisma.partnerMilestone.update.mockResolvedValue({
        id: 'mil-1',
        status: 'COMPLETED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.completeMilestone('mil-1', 1);
      expect(result.status).toBe('COMPLETED');
      expect(mockPrisma.partnerMilestone.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('deve lançar NotFoundException se milestone não existir', async () => {
      mockPrisma.partnerMilestone.findUnique.mockResolvedValue(null);
      await expect(service.completeMilestone('nao-existe', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getOverdueMilestones', () => {
    it('deve retornar milestones em atraso', async () => {
      mockPrisma.partnerMilestone.findMany.mockResolvedValue([{ id: 'mil-1' }]);
      const result = await service.getOverdueMilestones();
      expect(result).toHaveLength(1);
    });
  });

  describe('getExpiringContracts', () => {
    it('deve retornar contratos a expirar', async () => {
      mockPrisma.partner.findMany.mockResolvedValue([{ id: 'par-1' }]);
      const result = await service.getExpiringContracts(30);
      expect(result).toHaveLength(1);
      expect(mockPrisma.partner.findMany).toHaveBeenCalled();
    });
  });

  // ─── DASHBOARD ───────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar totais, distribuições e interacções recentes', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        10,
        2,
        8,
        [],
        [],
        [],
        { _sum: { annualValue: 5000000 } },
        1,
        0,
        [],
        { _avg: { satisfactionAvg: 4.5 } },
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('distributions');
      expect(result.totals.totalValueAOA).toBe(5000000);
    });
  });

  // ─── RELATÓRIO ───────────────────────────────────────

  describe('getReport', () => {
    it('deve retornar relatório por período', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        7,
        [],
        [],
        { _sum: { annualValue: 3000000 } },
        12,
        4,
      ]);
      const result = await service.getReport(
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      );
      expect(result.created).toBe(7);
      expect(result.totalValue).toBe(3000000);
      expect(result.milestonesCompleted).toBe(4);
    });
  });
});
