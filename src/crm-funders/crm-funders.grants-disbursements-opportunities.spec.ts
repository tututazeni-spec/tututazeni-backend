import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmFundersService } from './crm-funders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const funder = { id: 'fun-1', deletedAt: null, contacts: [], programs: [] };
const grant = {
  id: 'grt-1',
  funderId: 'fun-1',
  deletedAt: null,
  amount: 1000,
  usedAmount: 200,
  disbursed: 300,
  currency: 'USD',
  startDate: new Date('2026-01-01'),
  endDate: null,
};

const mockPrisma: Record<string, any> = {
  funder: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  funderProgram: { findFirst: jest.fn() },
  fundingGrant: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  grantDisbursement: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  funderOpportunity: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  funderOpportunityDocument: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  $queryRaw: jest.fn(),
};
const mockAudit = { logEntity: jest.fn() };

describe('CrmFundersService — §7 financiamentos, §8 desembolsos, §9 oportunidades', () => {
  let service: CrmFundersService;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmFundersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: { enqueueSend: jest.fn() } },
      ],
    }).compile();
    service = module.get(CrmFundersService);
    jest.resetAllMocks();
    mockPrisma.funder.findUnique.mockResolvedValue({ ...funder });
    mockPrisma.fundingGrant.findUnique.mockResolvedValue({ ...grant });
    mockPrisma.fundingGrant.aggregate.mockResolvedValue({ _sum: { amount: 0, disbursed: 0 } });
    mockPrisma.$queryRaw.mockResolvedValue([{ nextval: 7n }]);
  });

  describe('§7 financiamentos', () => {
    it('rejeita valor utilizado superior ao aprovado', async () => {
      await expect(
        service.createGrant(
          'fun-1',
          { title: 'G', amount: 100, usedAmount: 150, startDate: '2026-01-01' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.fundingGrant.create).not.toHaveBeenCalled();
    });

    it('rejeita programa de outro financiador', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue(null);
      await expect(
        service.createGrant(
          'fun-1',
          { title: 'G', amount: 100, programId: 'p-x', startDate: '2026-01-01' } as any,
          1,
        ),
      ).rejects.toThrow('Programa não pertence a este financiador');
    });

    it('devolve o saldo = aprovado − utilizado', async () => {
      mockPrisma.fundingGrant.create.mockResolvedValue({ ...grant, title: 'G' });
      const result = await service.createGrant(
        'fun-1',
        { title: 'G', amount: 1000, usedAmount: 200, startDate: '2026-01-01' } as any,
        1,
      );
      expect(result.balance).toBe(800);
    });

    it('não deixa baixar o valor aprovado abaixo do já desembolsado', async () => {
      await expect(service.updateGrant('grt-1', { amount: 250 } as any, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejeita data de fim anterior ao início ao actualizar', async () => {
      await expect(
        service.updateGrant('grt-1', { endDate: '2025-12-31' } as any, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('getGrant devolve 404 para grant apagado', async () => {
      mockPrisma.fundingGrant.findUnique.mockResolvedValue({ ...grant, deletedAt: new Date() });
      await expect(service.getGrant('grt-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('§8 desembolsos', () => {
    beforeEach(() => {
      mockPrisma.grantDisbursement.aggregate.mockResolvedValue({
        _sum: { amount: 300 },
        _max: { installmentNumber: 2 },
      });
      mockPrisma.grantDisbursement.create.mockImplementation(({ data }: any) => ({
        id: 'd-1',
        ...data,
      }));
    });

    it('sem data efectiva cria parcela prevista, numerada automaticamente', async () => {
      const result = await service.addDisbursement(
        'grt-1',
        { amount: 100, expectedDate: '2026-07-15' } as any,
        1,
      );
      expect(result.status).toBe('PREDICTED');
      expect(result.installmentNumber).toBe(3);
      expect(result.receivedAt).toBeNull();
    });

    it('com data efectiva cria parcela recebida e recalcula o desembolsado a partir das parcelas', async () => {
      mockPrisma.grantDisbursement.aggregate.mockResolvedValue({
        _sum: { amount: 400 },
        _max: { installmentNumber: 0 },
      });
      const result = await service.addDisbursement(
        'grt-1',
        { amount: 100, receivedAt: '2026-01-15' } as any,
        1,
      );
      expect(result.status).toBe('RECEIVED');
      expect(mockPrisma.fundingGrant.update).toHaveBeenCalledWith({
        where: { id: 'grt-1' },
        data: { disbursed: 400 },
      });
    });

    it('rejeita parcelas (incluindo previstas) que somem mais do que o valor aprovado', async () => {
      mockPrisma.grantDisbursement.aggregate.mockResolvedValue({ _sum: { amount: 950 } });
      await expect(
        service.addDisbursement('grt-1', { amount: 100, expectedDate: '2026-07-15' } as any, 1),
      ).rejects.toThrow(/excede/);
    });

    it('parcela cancelada não conta para o limite', async () => {
      mockPrisma.grantDisbursement.aggregate.mockResolvedValue({ _sum: { amount: 950 } });
      const result = await service.addDisbursement(
        'grt-1',
        { amount: 100, status: 'CANCELLED' } as any,
        1,
      );
      expect(result.status).toBe('CANCELLED');
    });

    it('rejeita data efectiva numa parcela que não está recebida', async () => {
      await expect(
        service.addDisbursement(
          'grt-1',
          { amount: 10, status: 'PREDICTED', receivedAt: '2026-01-15' } as any,
          1,
        ),
      ).rejects.toThrow('Só uma parcela recebida pode ter data efectiva');
    });

    it('rejeita número de parcela repetido', async () => {
      mockPrisma.grantDisbursement.findFirst.mockResolvedValue({ id: 'd-0' });
      await expect(
        service.addDisbursement('grt-1', { amount: 10, installmentNumber: 1 } as any, 1),
      ).rejects.toThrow('já existe');
    });

    it('marcar como recebida define a data efectiva e recalcula o desembolsado', async () => {
      mockPrisma.grantDisbursement.findFirst.mockResolvedValue({
        id: 'd-1',
        grantId: 'grt-1',
        amount: 100,
        status: 'PREDICTED',
        receivedAt: null,
        installmentNumber: 3,
      });
      mockPrisma.grantDisbursement.update.mockImplementation(({ data }: any) => ({
        id: 'd-1',
        ...data,
      }));
      const result = await service.updateDisbursement(
        'grt-1',
        'd-1',
        { status: 'RECEIVED', proofUrl: 'https://x/proof.pdf' } as any,
        1,
      );
      expect(result.status).toBe('RECEIVED');
      expect(result.receivedAt).toBeInstanceOf(Date);
      expect(mockPrisma.fundingGrant.update).toHaveBeenCalled();
    });

    it('remover parcela inexistente dá 404', async () => {
      mockPrisma.grantDisbursement.findFirst.mockResolvedValue(null);
      await expect(service.removeDisbursement('grt-1', 'x', 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('§9 oportunidades', () => {
    it('rejeita prazo anterior à data de abertura', async () => {
      await expect(
        service.addOpportunity(
          'fun-1',
          { name: 'Call', openingDate: '2026-05-01', deadline: '2026-04-01' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita decisão prevista anterior ao prazo', async () => {
      await expect(
        service.addOpportunity(
          'fun-1',
          { name: 'Call', deadline: '2026-05-01', expectedDecisionDate: '2026-04-01' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita responsável inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.addOpportunity('fun-1', { name: 'Call', responsibleId: 99 } as any, 1),
      ).rejects.toThrow('Responsável interno não encontrado');
    });

    it('cria oportunidade ligada ao financiador', async () => {
      mockPrisma.funderOpportunity.create.mockImplementation(({ data }: any) => ({
        id: 'o-1',
        ...data,
      }));
      const result = await service.addOpportunity(
        'fun-1',
        { name: 'Call', potentialValue: 5000, deadline: '2026-09-01' } as any,
        1,
      );
      expect(result.funderId).toBe('fun-1');
      expect(result.deadline).toBeInstanceOf(Date);
    });

    it('anexa documento só a oportunidade do próprio financiador', async () => {
      mockPrisma.funderOpportunity.findFirst.mockResolvedValue(null);
      await expect(
        service.addOpportunityDocument(
          'fun-1',
          'o-x',
          { type: 'BUDGET', name: 'Orçamento', fileUrl: 'u' } as any,
          1,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.funderOpportunityDocument.create).not.toHaveBeenCalled();
    });

    it('remove documento (soft delete)', async () => {
      mockPrisma.funderOpportunity.findFirst.mockResolvedValue({ id: 'o-1' });
      mockPrisma.funderOpportunityDocument.findFirst.mockResolvedValue({ id: 'doc-1' });
      await service.removeOpportunityDocument('fun-1', 'o-1', 'doc-1', 1);
      expect(mockPrisma.funderOpportunityDocument.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
