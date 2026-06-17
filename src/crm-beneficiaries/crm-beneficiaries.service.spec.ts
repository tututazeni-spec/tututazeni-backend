import { Test, TestingModule } from '@nestjs/testing';
import { CrmBeneficiariesService } from './crm-beneficiaries.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockBeneficiary = {
  id: 'ben-1',
  code: 'BEN-00001',
  fullName: 'João Teste',
  type: 'INDIVIDUAL',
  status: 'ACTIVE',
  deletedAt: null,
  createdBy: { fullName: 'Admin Teste' },
  assignedTo: null,
  interactions: [],
  documents: [],
  needs: [],
  _count: { interactions: 0 },
};

const mockPrisma = {
  beneficiary: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  beneficiaryInteraction: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  beneficiaryNeed: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('CrmBeneficiariesService', () => {
  let service: CrmBeneficiariesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrmBeneficiariesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CrmBeneficiariesService>(CrmBeneficiariesService);
    jest.clearAllMocks();
  });

  // ─── CREATE ──────────────────────────────────────────

  describe('create', () => {
    it('deve criar beneficiário com código auto-gerado', async () => {
      mockPrisma.beneficiary.findFirst.mockResolvedValue(null);
      mockPrisma.beneficiary.create.mockResolvedValue(mockBeneficiary);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create({ fullName: 'João Teste', type: 'INDIVIDUAL' as any }, 1);

      expect(result.code).toBe('BEN-00001');
      expect(mockPrisma.beneficiary.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'BEN-00001', createdById: 1 }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entity: 'Beneficiary',
            action: 'CREATE',
          }),
        }),
      );
    });

    it('deve gerar BEN-00002 quando já existe BEN-00001', async () => {
      mockPrisma.beneficiary.findFirst.mockResolvedValue({ code: 'BEN-00001' });
      mockPrisma.beneficiary.create.mockResolvedValue({
        ...mockBeneficiary,
        code: 'BEN-00002',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.create(
        { fullName: 'Maria Teste', type: 'INDIVIDUAL' as any },
        1,
      );
      expect(result.code).toBe('BEN-00002');
    });
  });

  // ─── FIND ALL ────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockBeneficiary], 1]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('totalPages', 1);
    });

    it('deve filtrar por tipo e status', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      const result = await service.findAll({
        type: 'INDIVIDUAL' as any,
        status: 'ACTIVE' as any,
      });
      expect(result.total).toBe(0);
    });
  });

  // ─── FIND ONE ────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar beneficiário por id', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      const result = await service.findOne('ben-1');
      expect(result.id).toBe('ben-1');
    });

    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se deletedAt preenchido', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue({
        ...mockBeneficiary,
        deletedAt: new Date(),
      });
      await expect(service.findOne('ben-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── UPDATE ──────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar e criar auditLog', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      mockPrisma.beneficiary.update.mockResolvedValue({
        ...mockBeneficiary,
        fullName: 'João Actualizado',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.update('ben-1', { fullName: 'João Actualizado' } as any, 1);
      expect(result.fullName).toBe('João Actualizado');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ─── SOFT DELETE ─────────────────────────────────────

  describe('softDelete', () => {
    it('deve definir deletedAt e status INACTIVE', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      mockPrisma.beneficiary.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.softDelete('ben-1', 1);
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.beneficiary.update).toHaveBeenCalledWith(
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
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      mockPrisma.beneficiaryInteraction.create.mockResolvedValue({
        id: 'int-1',
        type: 'CALL',
        subject: 'Contacto inicial',
        user: { fullName: 'Utilizador Teste' },
      });
      mockPrisma.beneficiaryInteraction.findMany.mockResolvedValue([]);
      mockPrisma.beneficiary.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addInteraction(
        'ben-1',
        {
          type: 'CALL' as any,
          subject: 'Contacto inicial',
          description: 'Desc',
        } as any,
        1,
      );
      expect(result.type).toBe('CALL');
      expect(mockPrisma.beneficiary.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastContactAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('getInteractions', () => {
    it('deve retornar interacções paginadas', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      mockPrisma.$transaction.mockResolvedValue([[{ id: 'int-1', type: 'CALL' }], 1]);
      const result = await service.getInteractions('ben-1', 1, 20);
      expect(result).toHaveProperty('data');
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  // ─── NECESSIDADES ────────────────────────────────────

  describe('addNeed', () => {
    it('deve criar necessidade e auditLog', async () => {
      mockPrisma.beneficiary.findUnique.mockResolvedValue(mockBeneficiary);
      mockPrisma.beneficiaryNeed.create.mockResolvedValue({
        id: 'need-1',
        category: 'Formação',
        status: 'OPEN',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.addNeed(
        'ben-1',
        { category: 'Formação', description: 'Curso de informática' } as any,
        1,
      );
      expect(result.id).toBe('need-1');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('resolveNeed', () => {
    it('deve resolver necessidade existente', async () => {
      mockPrisma.beneficiaryNeed.findUnique.mockResolvedValue({
        id: 'need-1',
        status: 'OPEN',
      });
      mockPrisma.beneficiaryNeed.update.mockResolvedValue({
        id: 'need-1',
        status: 'RESOLVED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.resolveNeed('need-1', 1);
      expect(result.status).toBe('RESOLVED');
      expect(mockPrisma.beneficiaryNeed.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RESOLVED',
            resolvedById: 1,
          }),
        }),
      );
    });

    it('deve lançar NotFoundException se necessidade não existir', async () => {
      mockPrisma.beneficiaryNeed.findUnique.mockResolvedValue(null);
      await expect(service.resolveNeed('nao-existe', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── FOLLOW-UPS ──────────────────────────────────────

  describe('getFollowUps', () => {
    it('deve retornar beneficiários com follow-up pendente', async () => {
      mockPrisma.beneficiary.findMany.mockResolvedValue([
        { id: 'ben-1', code: 'BEN-00001', fullName: 'João Teste' },
      ]);
      const result = await service.getFollowUps(1, 7);
      expect(result).toHaveLength(1);
      expect(mockPrisma.beneficiary.findMany).toHaveBeenCalled();
    });
  });

  // ─── RELATÓRIO ───────────────────────────────────────

  describe('getReport', () => {
    it('deve retornar relatório por período', async () => {
      mockPrisma.$transaction.mockResolvedValue([10, [], [], 25]);
      const result = await service.getReport(new Date('2026-01-01'), new Date('2026-12-31'));
      expect(result).toHaveProperty('period');
      expect(result.created).toBe(10);
      expect(result.interactions).toBe(25);
    });
  });

  // ─── DASHBOARD ───────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar totais e distribuições', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        5,
        2,
        4,
        [],
        [],
        [],
        1,
        [],
        3,
        { _avg: { satisfactionAvg: 4.2 } },
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('distributions');
      expect(result).toHaveProperty('satisfaction');
      expect(result.satisfaction).toBe(4.2);
    });
  });
});
