import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmFundersService } from './crm-funders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const funder = { id: 'fun-1', deletedAt: null, contacts: [], programs: [] };

const mockPrisma: Record<string, any> = {
  funder: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  partner: { findFirst: jest.fn(), update: jest.fn() },
  fundingGrant: { findFirst: jest.fn() },
  funderProgram: { findFirst: jest.fn(), findMany: jest.fn() },
  beneficiaryParticipation: { findMany: jest.fn(), count: jest.fn() },
  partnerFunderLink: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  funderInteraction: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  $transaction: jest.fn(),
};
const mockAudit = { logEntity: jest.fn() };

describe('CrmFundersService — §13 beneficiários, §14 parceiros, §15 actividades', () => {
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
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  });

  describe('§13 beneficiários financiados', () => {
    it('agrupa Programa → Projecto sem contar duas vezes o mesmo beneficiário', async () => {
      mockPrisma.funderProgram.findMany.mockResolvedValue([
        { id: 'p1', program: 'Crescer', project: 'Formação Agrícola', expectedBeneficiaries: 100 },
        { id: 'p2', program: 'crescer ', project: 'Apicultura', expectedBeneficiaries: 50 },
      ]);
      mockPrisma.beneficiaryParticipation.findMany
        .mockResolvedValueOnce([{ beneficiaryId: 'b1' }, { beneficiaryId: 'b2' }])
        .mockResolvedValueOnce([{ beneficiaryId: 'b2' }, { beneficiaryId: 'b3' }]);

      const r = await service.getBeneficiariesSummary('fun-1');

      expect(r.totalBeneficiaries).toBe(3);
      expect(r.programs).toHaveLength(1);
      expect(r.programs[0]).toMatchObject({
        program: 'Crescer',
        expectedBeneficiaries: 150,
        beneficiaries: 3,
      });
      expect(r.programs[0].projects).toHaveLength(2);
    });

    it('financiador sem programas devolve lista paginada vazia', async () => {
      mockPrisma.funderProgram.findMany.mockResolvedValue([]);
      const r = await service.getFundedBeneficiaries('fun-1', {}, {});
      expect(r.data).toEqual([]);
      expect(mockPrisma.beneficiaryParticipation.findMany).not.toHaveBeenCalled();
    });

    it('filtra por programa e projecto ignorando maiúsculas', async () => {
      mockPrisma.funderProgram.findMany.mockResolvedValue([
        { program: 'Crescer', project: 'A' },
        { program: 'Crescer', project: 'B' },
        { program: 'Outro', project: null },
      ]);
      mockPrisma.beneficiaryParticipation.findMany.mockResolvedValue([]);
      mockPrisma.beneficiaryParticipation.count.mockResolvedValue(0);

      await service.getFundedBeneficiaries('fun-1', { program: 'CRESCER', project: 'b' }, {});

      const where = mockPrisma.beneficiaryParticipation.findMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(1);
      expect(where.OR[0].project.equals).toBe('B');
    });
  });

  describe('§14 parceiros associados', () => {
    const dto = { partnerId: 'par-1', programId: 'prog-1', relationType: 'CONSORTIUM' as const };

    it('rejeita programa de outro financiador', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue(null);
      await expect(service.addPartner('fun-1', dto, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita parceiro inexistente', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue({ id: 'prog-1' });
      mockPrisma.partner.findFirst.mockResolvedValue(null);
      await expect(service.addPartner('fun-1', dto, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita associação duplicada', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue({ id: 'prog-1' });
      mockPrisma.partner.findFirst.mockResolvedValue({ id: 'par-1' });
      mockPrisma.partnerFunderLink.findFirst.mockResolvedValue({ id: 'l1' });
      await expect(service.addPartner('fun-1', dto, 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.partnerFunderLink.create).not.toHaveBeenCalled();
    });

    it('cria ligação e marca o parceiro como financiador', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue({ id: 'prog-1' });
      mockPrisma.partner.findFirst.mockResolvedValue({ id: 'par-1' });
      mockPrisma.partnerFunderLink.findFirst.mockResolvedValue(null);
      mockPrisma.partnerFunderLink.create.mockResolvedValue({ id: 'l1' });

      await service.addPartner('fun-1', dto, 7);

      expect(mockPrisma.partner.update).toHaveBeenCalledWith({
        where: { id: 'par-1' },
        data: { isFunder: true },
      });
      expect(mockPrisma.partnerFunderLink.create.mock.calls[0][0].data).toMatchObject({
        funderId: 'fun-1',
        partnerId: 'par-1',
        programId: 'prog-1',
        relationType: 'CONSORTIUM',
      });
    });

    it('agrupa parceiros por programa (consórcio)', async () => {
      const prog = { id: 'prog-1', program: 'Crescer', project: null };
      mockPrisma.partnerFunderLink.findMany.mockResolvedValue([
        {
          id: 'l1',
          programId: 'prog-1',
          program: prog,
          partner: { id: 'a' },
          relationType: 'CONSORTIUM',
        },
        {
          id: 'l2',
          programId: 'prog-1',
          program: prog,
          partner: { id: 'b' },
          relationType: 'CO_FINANCING',
        },
        { id: 'l3', programId: null, program: null, partner: { id: 'c' }, relationType: 'OTHER' },
      ]);
      const r = await service.getPartners('fun-1');
      expect(r.byProgram).toHaveLength(2);
      expect(r.byProgram[0].partners).toHaveLength(2);
    });

    it('remover de outro financiador dá 404', async () => {
      mockPrisma.partnerFunderLink.findFirst.mockResolvedValue(null);
      await expect(service.removePartner('fun-1', 'x', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('§15 actividades', () => {
    const base = { type: 'MEETING' as const, subject: 's', description: 'd' };

    function stubStats(last: Date | null, next: Date | null, avg: number | null) {
      mockPrisma.funderInteraction.findFirst
        .mockResolvedValueOnce(last ? { date: last } : null)
        .mockResolvedValueOnce(next ? { nextDate: next } : null);
      mockPrisma.funderInteraction.aggregate.mockResolvedValue({ _avg: { satisfaction: avg } });
    }

    it('recalcula último/próximo contacto e NÃO toca em nextReportDue', async () => {
      const last = new Date('2026-01-01');
      const next = new Date('2999-01-01');
      mockPrisma.funderInteraction.create.mockResolvedValue({ id: 'i1' });
      stubStats(last, next, 4);

      await service.addInteraction('fun-1', { ...base, nextDate: next.toISOString() }, 1);

      const data = mockPrisma.funder.update.mock.calls[0][0].data;
      expect(data).toEqual({ lastContactAt: last, nextContactAt: next, satisfactionAvg: 4 });
      expect(data).not.toHaveProperty('nextReportDue');
    });

    it('sem avaliações a média volta a 0', async () => {
      mockPrisma.funderInteraction.create.mockResolvedValue({ id: 'i1' });
      stubStats(null, null, null);
      await service.addInteraction('fun-1', base, 1);
      expect(mockPrisma.funder.update.mock.calls[0][0].data).toEqual({
        lastContactAt: null,
        nextContactAt: null,
        satisfactionAvg: 0,
      });
    });

    it('rejeita responsável inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.addInteraction('fun-1', { ...base, responsibleId: 99 }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.funderInteraction.create).not.toHaveBeenCalled();
    });

    it('timeline esconde notas privadas de terceiros mas não do ADMIN', async () => {
      mockPrisma.funderInteraction.findMany.mockResolvedValue([]);
      mockPrisma.funderInteraction.count.mockResolvedValue(0);

      await service.getInteractions('fun-1', {}, { id: 5, isAdmin: false });
      expect(mockPrisma.funderInteraction.findMany.mock.calls[0][0].where.OR).toEqual([
        { isPrivate: false },
        { userId: 5 },
      ]);

      await service.getInteractions('fun-1', {}, { id: 1, isAdmin: true });
      expect(mockPrisma.funderInteraction.findMany.mock.calls[1][0].where.OR).toBeUndefined();
    });

    it('apagar actividade (soft delete) recalcula estatísticas', async () => {
      mockPrisma.funderInteraction.findFirst.mockResolvedValueOnce({ id: 'i1' });
      stubStats(null, null, null);
      await service.removeInteraction('fun-1', 'i1', 1);
      expect(mockPrisma.funderInteraction.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(
        Date,
      );
      expect(mockPrisma.funder.update).toHaveBeenCalled();
    });

    it('actualizar actividade inexistente dá 404', async () => {
      mockPrisma.funderInteraction.findFirst.mockResolvedValue(null);
      await expect(service.updateInteraction('fun-1', 'x', {}, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
