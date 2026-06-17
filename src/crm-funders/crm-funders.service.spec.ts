import { Test, TestingModule } from '@nestjs/testing';
import { CrmFundersService } from './crm-funders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockFunder = {
  id: 'fun-1',
  code: 'FIN-00001',
  name: 'União Europeia',
  type: 'BILATERAL',
  status: 'ACTIVE',
  deletedAt: null,
  totalCommitted: 0,
  totalReceived: 0,
  totalPending: 0,
  createdBy: { fullName: 'Admin' },
  assignedTo: null,
  grants: [],
  interactions: [],
  reports: [],
  _count: { grants: 0, interactions: 0 },
};

const mockGrant = {
  id: 'grt-1',
  code: 'GRT-00001',
  funderId: 'fun-1',
  title: 'Grant Educação 2026',
  amount: 5000000,
  disbursed: 0,
  currency: 'AOA',
  status: 'ACTIVE',
};

const mockPrisma = {
  funder: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  fundingGrant: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    findFirst: jest.fn(),
  },
  grantDisbursement: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  funderInteraction: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  funderReport: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('CrmFundersService', () => {
  let service: CrmFundersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrmFundersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CrmFundersService>(CrmFundersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar financiador com código FIN- auto-gerado', async () => {
      mockPrisma.funder.findFirst.mockResolvedValue(null);
      mockPrisma.funder.create.mockResolvedValue(mockFunder);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create({ name: 'União Europeia', type: 'BILATERAL' as any }, 1);
      expect(result.code).toBe('FIN-00001');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'Funder', action: 'CREATE' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockFunder], 1]);
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toMatchObject({
        data: expect.any(Array),
        total: 1,
        totalPages: 1,
      });
    });

    it('deve filtrar por tipo e status', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      const result = await service.findAll({
        type: 'GOVERNMENT' as any,
        status: 'ACTIVE' as any,
      });
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('deve retornar financiador com grants e interacções', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      const result = await service.findOne('fun-1');
      expect(result.id).toBe('fun-1');
    });

    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se deletedAt preenchido', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue({
        ...mockFunder,
        deletedAt: new Date(),
      });
      await expect(service.findOne('fun-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve actualizar e criar auditLog', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.funder.update.mockResolvedValue({
        ...mockFunder,
        name: 'UE Actualizada',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.update('fun-1', { name: 'UE Actualizada' } as any, 1);
      expect(result.name).toBe('UE Actualizada');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('deve definir deletedAt e status INACTIVE', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.funder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.softDelete('fun-1', 1);
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.funder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            status: 'INACTIVE',
          }),
        }),
      );
    });
  });

  describe('createGrant', () => {
    it('deve criar grant com código GRT- e notificação', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.fundingGrant.findFirst.mockResolvedValue(null);
      mockPrisma.fundingGrant.create.mockResolvedValue(mockGrant);
      mockPrisma.fundingGrant.findMany.mockResolvedValue([mockGrant]);
      mockPrisma.funder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.createGrant(
        'fun-1',
        {
          title: 'Grant Educação 2026',
          amount: 5000000,
          startDate: '2026-01-01',
        } as any,
        1,
      );
      expect(result.code).toBe('GRT-00001');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'GRANT_CREATED' }),
        }),
      );
    });
  });

  describe('findGrants', () => {
    it('deve retornar grants paginados', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.$transaction.mockResolvedValue([[mockGrant], 1]);
      const result = await service.findGrants('fun-1', 1, 20);
      expect(result.total).toBe(1);
    });
  });

  describe('updateGrantStatus', () => {
    it('deve actualizar estado do grant e totais', async () => {
      mockPrisma.fundingGrant.findUnique.mockResolvedValue(mockGrant);
      mockPrisma.fundingGrant.update.mockResolvedValue({
        ...mockGrant,
        status: 'COMPLETED',
      });
      mockPrisma.fundingGrant.findMany.mockResolvedValue([mockGrant]);
      mockPrisma.funder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateGrantStatus('grt-1', 'COMPLETED', 1);
      expect(result.status).toBe('COMPLETED');
    });

    it('deve lançar NotFoundException se grant não existir', async () => {
      mockPrisma.fundingGrant.findUnique.mockResolvedValue(null);
      await expect(service.updateGrantStatus('nao-existe', 'CLOSED', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addDisbursement', () => {
    it('deve registar desembolso e actualizar totais', async () => {
      mockPrisma.fundingGrant.findUnique.mockResolvedValue(mockGrant);
      mockPrisma.grantDisbursement.create.mockResolvedValue({
        id: 'dis-1',
        amount: 1000000,
      });
      mockPrisma.fundingGrant.update.mockResolvedValue({});
      mockPrisma.fundingGrant.findMany.mockResolvedValue([{ ...mockGrant, disbursed: 1000000 }]);
      mockPrisma.funder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addDisbursement(
        'grt-1',
        { amount: 1000000, receivedAt: '2026-06-01', currency: 'AOA' } as any,
        1,
      );
      expect(result.amount).toBe(1000000);
    });

    it('deve lançar BadRequestException se desembolso excede o grant', async () => {
      mockPrisma.fundingGrant.findUnique.mockResolvedValue({
        ...mockGrant,
        disbursed: 4500000,
      });
      await expect(
        service.addDisbursement('grt-1', { amount: 600000, receivedAt: '2026-06-01' } as any, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se grant não existir', async () => {
      mockPrisma.fundingGrant.findUnique.mockResolvedValue(null);
      await expect(
        service.addDisbursement('nao-existe', { amount: 100, receivedAt: '2026-06-01' } as any, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDisbursements', () => {
    it('deve retornar desembolsos paginados', async () => {
      mockPrisma.$transaction.mockResolvedValue([[{ id: 'dis-1' }], 1]);
      const result = await service.getDisbursements('grt-1', 1, 20);
      expect(result.total).toBe(1);
    });
  });

  describe('addInteraction', () => {
    it('deve criar interacção e actualizar lastContactAt', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.funderInteraction.create.mockResolvedValue({
        id: 'int-1',
        type: 'MEETING',
        user: { fullName: 'User Teste' },
      });
      mockPrisma.funderInteraction.findMany.mockResolvedValue([]);
      mockPrisma.funder.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addInteraction(
        'fun-1',
        { type: 'MEETING' as any, subject: 'Reunião', description: 'Desc' } as any,
        1,
      );
      expect(result.type).toBe('MEETING');
      expect(mockPrisma.funder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastContactAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('createReport / submitReport', () => {
    it('deve criar relatório', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.funderReport.create.mockResolvedValue({
        id: 'rep-1',
        period: 'Q2 2026',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createReport(
        'fun-1',
        { title: 'Relatório Q2', period: 'Q2 2026', dueDate: '2026-07-15' } as any,
        1,
      );
      expect(result.id).toBe('rep-1');
    });

    it('deve submeter relatório', async () => {
      mockPrisma.funderReport.findUnique.mockResolvedValue({
        id: 'rep-1',
        status: 'PENDING',
      });
      mockPrisma.funderReport.update.mockResolvedValue({
        id: 'rep-1',
        status: 'SUBMITTED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.submitReport('rep-1', 'http://file.pdf', 1);
      expect(result.status).toBe('SUBMITTED');
    });

    it('deve lançar NotFoundException ao submeter relatório inexistente', async () => {
      mockPrisma.funderReport.findUnique.mockResolvedValue(null);
      await expect(service.submitReport('nao-existe', 'http://file.pdf', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getOverdueReports', () => {
    it('deve retornar relatórios em atraso', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([{ id: 'rep-1' }]);
      const result = await service.getOverdueReports();
      expect(result).toHaveLength(1);
    });
  });

  describe('getDashboard', () => {
    it('deve retornar totais financeiros e taxa de execução', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        5,
        1,
        4,
        [],
        [],
        { _sum: { amount: 10000000 } },
        { _sum: { disbursed: 6000000 } },
        3,
        0,
        2,
        [],
        [],
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result.totals.executionRate).toBe(60);
      expect(result.totals.totalPending).toBe(4000000);
    });
  });

  describe('getReport', () => {
    it('deve retornar relatório por período', async () => {
      mockPrisma.$transaction.mockResolvedValue([3, [], 2, { _sum: { amount: 2500000 } }, 4]);
      const result = await service.getReport(new Date('2026-01-01'), new Date('2026-12-31'));
      expect(result.created).toBe(3);
      expect(result.totalDisbursed).toBe(2500000);
      expect(result.reportsSubmitted).toBe(4);
    });
  });
});
