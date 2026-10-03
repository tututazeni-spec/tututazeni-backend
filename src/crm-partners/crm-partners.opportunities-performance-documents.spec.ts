import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmPartnersService } from './crm-partners.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const partner = { id: 'par-1', deletedAt: null, isFunder: false };

const crud = () => ({
  create: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  aggregate: jest.fn(),
});

const mockPrisma: Record<string, any> = {
  partner: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  partnerProgram: { findMany: jest.fn() },
  partnerContribution: { findMany: jest.fn() },
  partnerFunderLink: { findMany: jest.fn() },
  partnerMilestone: { findMany: jest.fn() },
  partnerOpportunity: crud(),
  partnerImpactIndicator: crud(),
  partnerDocument: crud(),
  beneficiaryParticipation: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  $transaction: jest.fn(),
};
const mockAudit = { logEntity: jest.fn() };

describe('CrmPartnersService — §11 oportunidades, §12 desempenho, §13 documentos', () => {
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

  describe('oportunidades', () => {
    it('fecha a oportunidade (closedAt) ao passar para um estado final e reabre ao sair dele', async () => {
      mockPrisma.partnerOpportunity.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'IN_NEGOTIATION',
      });
      mockPrisma.partnerOpportunity.update.mockResolvedValue({ id: 'o1' });
      await service.updateOpportunity('par-1', 'o1', { status: 'AGREEMENT_REACHED' } as any, 1);
      expect(mockPrisma.partnerOpportunity.update.mock.calls[0][0].data.closedAt).toBeInstanceOf(
        Date,
      );

      mockPrisma.partnerOpportunity.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'NOT_CONCLUDED',
      });
      await service.updateOpportunity('par-1', 'o1', { status: 'IN_DISCUSSION' } as any, 1);
      expect(mockPrisma.partnerOpportunity.update.mock.calls[1][0].data.closedAt).toBeNull();
    });

    it('não toca em closedAt se o estado não mudou', async () => {
      mockPrisma.partnerOpportunity.findFirst.mockResolvedValue({ id: 'o1', status: 'CONTACTED' });
      mockPrisma.partnerOpportunity.update.mockResolvedValue({ id: 'o1' });
      await service.updateOpportunity('par-1', 'o1', { status: 'CONTACTED', notes: 'x' } as any, 1);
      expect(mockPrisma.partnerOpportunity.update.mock.calls[0][0].data).not.toHaveProperty(
        'closedAt',
      );
    });

    it('rejeita responsável inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.addOpportunity('par-1', { name: 'X', responsibleId: 999 } as any, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('pipeline: valor ponderado só das abertas, por moeda, e taxa de sucesso', async () => {
      mockPrisma.partnerOpportunity.findMany.mockResolvedValue([
        { status: 'PROPOSAL_SENT', currency: 'AOA', potentialValue: 1000, probability: 50 },
        { status: 'IDENTIFIED', currency: 'AOA', potentialValue: 200, probability: null },
        { status: 'IN_DISCUSSION', currency: 'USD', potentialValue: 100, probability: 10 },
        { status: 'AGREEMENT_REACHED', currency: 'AOA', potentialValue: 5000, probability: 100 },
        { status: 'NOT_CONCLUDED', currency: 'AOA', potentialValue: 300, probability: 0 },
        { status: 'NOT_CONCLUDED', currency: 'AOA', potentialValue: 300, probability: 0 },
      ]);
      const pipeline = await service.getOpportunityPipeline('par-1');
      expect(pipeline).toMatchObject({ total: 6, open: 3, won: 1, lost: 2, winRate: 33 });
      const aoa = pipeline.openValueByCurrency.find(v => v.currency === 'AOA');
      expect(aoa).toEqual({ currency: 'AOA', total: 1200, weighted: 500 });
      expect(pipeline.openValueByCurrency.find(v => v.currency === 'USD')?.weighted).toBe(10);
    });

    it('pipeline vazio não dá winRate', async () => {
      mockPrisma.partnerOpportunity.findMany.mockResolvedValue([]);
      const pipeline = await service.getOpportunityPipeline('par-1');
      expect(pipeline.winRate).toBeNull();
    });

    it('404 ao actualizar oportunidade de outro parceiro', async () => {
      mockPrisma.partnerOpportunity.findFirst.mockResolvedValue(null);
      await expect(service.updateOpportunity('par-1', 'o9', {} as any, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('desempenho', () => {
    it('agrega programas, investimento por moeda e cumprimento de compromissos', async () => {
      const past = new Date('2020-01-01');
      const later = new Date('2020-02-01');
      const future = new Date('2999-01-01');
      mockPrisma.partnerProgram.findMany.mockResolvedValue([
        { status: 'ACTIVE', program: 'Crescer' },
        { status: 'COMPLETED', program: 'Crescer' },
        { status: 'CANCELLED', program: 'Outro' },
      ]);
      mockPrisma.partnerContribution.findMany.mockResolvedValue([
        { estimatedValue: 100, currency: 'AOA', startDate: past },
        { estimatedValue: 50, currency: 'AOA', startDate: future },
        { estimatedValue: 10, currency: 'USD', startDate: null },
      ]);
      mockPrisma.partnerFunderLink.findMany.mockResolvedValue([
        { amountFunded: 1000, currency: 'AOA' },
        { amountFunded: null, currency: 'AOA' },
      ]);
      mockPrisma.partnerMilestone.findMany.mockResolvedValue([
        { status: 'COMPLETED', dueDate: later, completedAt: past }, // a tempo
        { status: 'COMPLETED', dueDate: past, completedAt: later }, // atrasado
        { status: 'PENDING', dueDate: past, completedAt: null }, // vencido por cumprir
        { status: 'PENDING', dueDate: future, completedAt: null }, // ainda não exigível
      ]);
      mockPrisma.beneficiaryParticipation.groupBy.mockResolvedValue([]);
      mockPrisma.partnerImpactIndicator.findMany.mockResolvedValue([
        { id: 'i1', value: 50, target: 200 },
        { id: 'i2', value: 5, target: null },
      ]);

      const perf = await service.getPerformance('par-1');
      expect(perf.programs).toEqual({ supported: 2, active: 1, completed: 1 });
      expect(perf.invested.contributionsByCurrency).toEqual(
        expect.arrayContaining([
          { currency: 'AOA', total: 150 },
          { currency: 'USD', total: 10 },
        ]),
      );
      expect(perf.invested.fundingByCurrency).toEqual([{ currency: 'AOA', total: 1000 }]);
      expect(perf.contributions).toEqual({ total: 3, realized: 2 });
      expect(perf.commitments).toEqual({
        due: 3,
        completed: 2,
        completedOnTime: 1,
        complianceRate: 67,
      });
      expect(perf.impactIndicators.map(i => i.attainment)).toEqual([25, null]);
    });

    it('sem programas nem beneficiários devolve zeros e taxa nula', async () => {
      mockPrisma.partnerProgram.findMany.mockResolvedValue([]);
      mockPrisma.partnerContribution.findMany.mockResolvedValue([]);
      mockPrisma.partnerFunderLink.findMany.mockResolvedValue([]);
      mockPrisma.partnerMilestone.findMany.mockResolvedValue([]);
      mockPrisma.partnerImpactIndicator.findMany.mockResolvedValue([]);
      const perf = await service.getPerformance('par-1');
      expect(perf.beneficiaries.reached).toBe(0);
      expect(perf.commitments.complianceRate).toBeNull();
    });

    it('rejeita período de indicador invertido', async () => {
      await expect(
        service.addImpactIndicator(
          'par-1',
          { name: 'x', value: 1, periodStart: '2026-05-01', periodEnd: '2026-01-01' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('documentos', () => {
    it('lista só a versão mais recente de cada nome e marca como EXPIRED o que passou da validade', async () => {
      mockPrisma.partnerDocument.findMany.mockResolvedValue([
        {
          id: 'a2',
          name: 'Contrato',
          version: 2,
          status: 'VALID',
          validUntil: new Date('2999-01-01'),
        },
        { id: 'a1', name: 'Contrato', version: 1, status: 'VALID', validUntil: null },
        {
          id: 'b1',
          name: 'Certidão',
          version: 1,
          status: 'VALID',
          validUntil: new Date('2020-01-01'),
        },
      ]);
      const latest = await service.getDocuments('par-1');
      expect(latest.map(d => d.id)).toEqual(['a2', 'b1']);
      expect(latest[1].status).toBe('EXPIRED');
      expect(await service.getDocuments('par-1', true)).toHaveLength(3);
    });

    it('recusa duplicar um nome já existente', async () => {
      mockPrisma.partnerDocument.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(
        service.addDocument(
          'par-1',
          { type: 'CONTRACT', name: 'Contrato', fileUrl: 'u' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.partnerDocument.create).not.toHaveBeenCalled();
    });

    it('continua a numeração depois de versões apagadas (unique inclui apagadas)', async () => {
      mockPrisma.partnerDocument.findFirst.mockResolvedValue(null);
      mockPrisma.partnerDocument.aggregate.mockResolvedValue({ _max: { version: 3 } });
      mockPrisma.partnerDocument.create.mockResolvedValue({ id: 'd4', version: 4 });
      await service.addDocument(
        'par-1',
        { type: 'CONTRACT', name: 'Contrato', fileUrl: 'u' } as any,
        7,
      );
      const data = mockPrisma.partnerDocument.create.mock.calls[0][0].data;
      expect(data.version).toBe(4);
      expect(data.uploadedById).toBe(7);
    });

    it('nova versão herda nome/tipo/responsável e incrementa a versão', async () => {
      mockPrisma.partnerDocument.findFirst.mockResolvedValue({
        id: 'd1',
        name: 'Contrato',
        type: 'CONTRACT',
        responsibleId: 5,
      });
      const tx = {
        partnerDocument: {
          aggregate: jest.fn().mockResolvedValue({ _max: { version: 2 } }),
          create: jest.fn().mockResolvedValue({ id: 'd3', name: 'Contrato', version: 3 }),
        },
      };
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx));
      await service.addDocumentVersion(
        'par-1',
        'd1',
        { fileUrl: 'u2', validUntil: '2027-01-01' } as any,
        9,
      );
      const data = tx.partnerDocument.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        name: 'Contrato',
        type: 'CONTRACT',
        responsibleId: 5,
        version: 3,
        uploadedById: 9,
        status: 'VALID',
      });
      expect(data.validUntil).toBeInstanceOf(Date);
    });

    it('rejeita validade anterior à data do documento', async () => {
      await expect(
        service.addDocument(
          'par-1',
          {
            type: 'CONTRACT',
            name: 'C',
            fileUrl: 'u',
            documentDate: '2026-05-01',
            validUntil: '2026-01-01',
          } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('404 ao remover documento inexistente', async () => {
      mockPrisma.partnerDocument.findFirst.mockResolvedValue(null);
      await expect(service.removeDocument('par-1', 'x', 1)).rejects.toThrow(NotFoundException);
    });
  });
});
