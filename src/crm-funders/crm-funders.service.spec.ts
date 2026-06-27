import { Test, TestingModule } from '@nestjs/testing';
import { CrmFundersService } from './crm-funders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

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
  // generateCode usa nextval() de uma sequência Postgres via raw query
  $queryRawUnsafe: jest.fn().mockResolvedValue([{ nextval: 1n }]),
};

const mockAudit = {
  logEntity: jest.fn((userId, action, entity, entityId, meta = {}) =>
    mockPrisma.auditLog.create({
      data: { userId, action, entity, metadata: JSON.stringify({ ...meta, entityId }) },
    }),
  ),
};

describe('CrmFundersService', () => {
  let service: CrmFundersService;
  let module: TestingModule;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    module = await Test.createTestingModule({
      providers: [
        CrmFundersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        {
          provide: NotificationsService,
          useValue: { enqueueSend: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = module.get<CrmFundersService>(CrmFundersService);
    jest.clearAllMocks();
    // updateFunderTotals usa agora aggregate (somar na BD) em vez de findMany
    mockPrisma.fundingGrant.aggregate.mockResolvedValue({
      _sum: { amount: 5000000, disbursed: 1000000 },
    });
  });

  describe('create', () => {
    it('deve criar financiador com código FIN- auto-gerado', async () => {
      mockPrisma.funder.findFirst.mockResolvedValue(null);
      mockPrisma.funder.create.mockResolvedValue(mockFunder);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create({ name: 'União Europeia', type: 'BILATERAL' as any }, 1);
      expect(result.code).toBe('FIN-00001');
      // código gerado via sequência atómica (nextval), não via "ler último +1"
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("nextval('funder_code_seq')"),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'Funder', action: 'CREATE' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.funder.findMany.mockResolvedValue([mockFunder]);
      mockPrisma.funder.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toMatchObject({
        data: expect.any(Array),
        total: 1,
        totalPages: 1,
      });
    });

    it('deve filtrar por tipo e status', async () => {
      mockPrisma.funder.findMany.mockResolvedValue([]);
      mockPrisma.funder.count.mockResolvedValue(0);
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
      const notifications = module.get(NotificationsService) as any;
      expect(notifications.enqueueSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GRANT_CREATED', userId: expect.any(Number) }),
      );
    });
  });

  describe('findGrants', () => {
    it('deve retornar grants paginados', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.fundingGrant.findMany.mockResolvedValue([mockGrant]);
      mockPrisma.fundingGrant.count.mockResolvedValue(1);
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
      mockPrisma.grantDisbursement.findMany.mockResolvedValue([{ id: 'dis-1' }]);
      mockPrisma.grantDisbursement.count.mockResolvedValue(1);
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
    it('deve retornar relatórios em atraso paginados', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([{ id: 'rep-1' }]);
      mockPrisma.funderReport.count.mockResolvedValue(1);
      const result = await service.getOverdueReports();
      expect(result.data).toHaveLength(1);
      expect(result).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('deve aplicar o tecto de paginação (limit máximo 100)', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([]);
      mockPrisma.funderReport.count.mockResolvedValue(0);
      const result = await service.getOverdueReports(1, 5000);
      expect(result.limit).toBe(100);
      expect(mockPrisma.funderReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, skip: 0 }),
      );
    });
  });

  describe('getDashboard', () => {
    it('deve retornar totais financeiros e taxa de execução', async () => {
      mockPrisma.funder.count.mockResolvedValue(5);
      mockPrisma.funder.groupBy.mockResolvedValue([]);
      mockPrisma.fundingGrant.aggregate.mockResolvedValue({
        _sum: { amount: 10000000, disbursed: 6000000 },
      });
      mockPrisma.fundingGrant.count.mockResolvedValue(3);
      mockPrisma.funderReport.count.mockResolvedValue(0);
      mockPrisma.grantDisbursement.findMany.mockResolvedValue([]);
      mockPrisma.funderInteraction.findMany.mockResolvedValue([]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result.totals.executionRate).toBe(60);
      expect(result.totals.totalPending).toBe(4000000);
    });
  });

  describe('getReport', () => {
    it('deve retornar relatório por período', async () => {
      mockPrisma.funder.count.mockResolvedValue(3);
      mockPrisma.funder.groupBy.mockResolvedValue([]);
      mockPrisma.fundingGrant.count.mockResolvedValue(2);
      mockPrisma.grantDisbursement.aggregate.mockResolvedValue({ _sum: { amount: 2500000 } });
      mockPrisma.funderReport.count.mockResolvedValue(4);
      const result = await service.getReport(new Date('2026-01-01'), new Date('2026-12-31'));
      expect(result.created).toBe(3);
      expect(result.totalDisbursed).toBe(2500000);
      expect(result.reportsSubmitted).toBe(4);
    });
  });
});
