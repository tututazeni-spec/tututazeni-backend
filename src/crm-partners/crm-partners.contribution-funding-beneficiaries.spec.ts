import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmPartnersService } from './crm-partners.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const partner = { id: 'par-1', deletedAt: null, isFunder: false };

const mockPrisma: Record<string, any> = {
  partner: { findUnique: jest.fn(), update: jest.fn() },
  partnerProgram: { findFirst: jest.fn(), findMany: jest.fn() },
  partnerContribution: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  partnerFunderLink: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  funder: { findFirst: jest.fn() },
  beneficiaryParticipation: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  $transaction: jest.fn(),
};
const mockAudit = { logEntity: jest.fn() };

describe('CrmPartnersService — §7 contribuições, §8 financiamento, §9 beneficiários', () => {
  let service: CrmPartnersService;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmPartnersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(CrmPartnersService);
    jest.resetAllMocks();
    mockPrisma.partner.findUnique.mockResolvedValue(partner);
  });

  describe('contribuições', () => {
    it('cria contribuição convertendo datas', async () => {
      mockPrisma.partnerContribution.create.mockResolvedValue({ id: 'c1' });
      await service.addContribution(
        'par-1',
        { type: 'FINANCIAL', estimatedValue: 100, startDate: '2026-01-01' } as any,
        1,
      );
      const data = mockPrisma.partnerContribution.create.mock.calls[0][0].data;
      expect(data.partnerId).toBe('par-1');
      expect(data.startDate).toBeInstanceOf(Date);
    });

    it('rejeita data de término anterior ao início', async () => {
      await expect(
        service.addContribution(
          'par-1',
          { type: 'FINANCIAL', startDate: '2026-05-01', endDate: '2026-01-01' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.partnerContribution.create).not.toHaveBeenCalled();
    });

    it('rejeita programId que não pertence ao parceiro', async () => {
      mockPrisma.partnerProgram.findFirst.mockResolvedValue(null);
      await expect(
        service.addContribution('par-1', { type: 'TRAINING', programId: 'outro' } as any, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('remove contribuição por soft delete', async () => {
      mockPrisma.partnerContribution.findFirst.mockResolvedValue({ id: 'c1' });
      await service.removeContribution('par-1', 'c1', 1);
      expect(mockPrisma.partnerContribution.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(
        Date,
      );
    });

    it('404 ao actualizar contribuição inexistente', async () => {
      mockPrisma.partnerContribution.findFirst.mockResolvedValue(null);
      await expect(service.updateContribution('par-1', 'x', {}, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('financiamento', () => {
    it('rejeita funder inexistente', async () => {
      mockPrisma.funder.findFirst.mockResolvedValue(null);
      await expect(service.addFunderLink('par-1', { funderId: 'f-x' }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('associa funder e marca o parceiro como financiador', async () => {
      mockPrisma.funder.findFirst.mockResolvedValue({ id: 'f1' });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.partnerFunderLink.create.mockResolvedValue({ id: 'l1' });
      await service.addFunderLink('par-1', { funderId: 'f1', amountFunded: 50 }, 1);
      expect(mockPrisma.partner.update).toHaveBeenCalledWith({
        where: { id: 'par-1' },
        data: { isFunder: true },
      });
    });

    it('agrega totais por moeda sem misturar moedas', async () => {
      mockPrisma.partnerFunderLink.findMany.mockResolvedValue([
        { currency: 'AOA', amountFunded: 100 },
        { currency: 'AOA', amountFunded: 50 },
        { currency: 'USD', amountFunded: 10 },
        { currency: 'USD', amountFunded: null },
      ]);
      const result = await service.getFunding('par-1');
      expect(result.totalsByCurrency).toEqual({ AOA: 150, USD: 10 });
    });
  });

  describe('beneficiários relacionados', () => {
    it('sem programas devolve resumo vazio sem consultar participações', async () => {
      mockPrisma.partnerProgram.findMany.mockResolvedValue([]);
      const result = await service.getBeneficiariesSummary('par-1');
      expect(result.totalBeneficiaries).toBe(0);
      expect(mockPrisma.beneficiaryParticipation.groupBy).not.toHaveBeenCalled();
    });

    it('agrega participações dos programas do parceiro', async () => {
      mockPrisma.partnerProgram.findMany.mockResolvedValue([
        { program: 'Crescer' },
        { program: ' crescer ' },
      ]);
      mockPrisma.beneficiaryParticipation.groupBy.mockImplementation(async ({ by }: any) => {
        if (by[0] === 'program') return [{ program: 'Crescer', _count: { id: 3 } }];
        if (by[0] === 'status') return [{ status: 'ENROLLED', _count: { id: 3 } }];
        if (by[0] === 'province') return [{ province: 'LUANDA', _count: { id: 2 } }];
        return [{ beneficiaryId: 'b1' }, { beneficiaryId: 'b2' }];
      });
      const result = await service.getBeneficiariesSummary('par-1');
      expect(result.totalParticipations).toBe(3);
      expect(result.totalBeneficiaries).toBe(2);
      // nomes duplicados (caixa/espaços) são colapsados num único filtro
      const where = mockPrisma.beneficiaryParticipation.groupBy.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(1);
    });

    it('filtro por programa que o parceiro não tem devolve página vazia', async () => {
      mockPrisma.partnerProgram.findMany.mockResolvedValue([{ program: 'Crescer' }]);
      const result = await service.getRelatedBeneficiaries('par-1', 1, 20, 'Outro');
      expect(result.data).toEqual([]);
      expect(mockPrisma.beneficiaryParticipation.findMany).not.toHaveBeenCalled();
    });
  });
});
