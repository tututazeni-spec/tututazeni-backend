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
  funderProgram: { findFirst: jest.fn() },
  fundingGrant: { findFirst: jest.fn() },
  funderContact: { findFirst: jest.fn() },
  funderContract: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  funderReport: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  funderIndicator: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
};
const mockAudit = { logEntity: jest.fn() };

describe('CrmFundersService — §10 contratos, §11 reporte, §12 indicadores', () => {
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
    mockPrisma.funderReport.findFirst.mockResolvedValue(null);
  });

  describe('§10 contratos', () => {
    it('rejeita término anterior ao início', async () => {
      await expect(
        service.addContract(
          'fun-1',
          { type: 'GRANT_AGREEMENT', startDate: '2026-06-01', endDate: '2026-01-01' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.funderContract.create).not.toHaveBeenCalled();
    });

    it('rejeita financiamento de outro financiador', async () => {
      mockPrisma.fundingGrant.findFirst.mockResolvedValue(null);
      await expect(
        service.addContract('fun-1', { type: 'OTHER', grantId: 'grt-x' } as any, 1),
      ).rejects.toThrow('Financiamento não pertence a este financiador');
    });

    it('rejeita responsável do financiador que não é contacto dele', async () => {
      mockPrisma.funderContact.findFirst.mockResolvedValue(null);
      await expect(
        service.addContract('fun-1', { type: 'OTHER', funderContactId: 'c-x' } as any, 1),
      ).rejects.toThrow('Contacto não pertence a este financiador');
    });

    it('rejeita responsável interno inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.addContract('fun-1', { type: 'OTHER', responsibleId: 99 } as any, 1),
      ).rejects.toThrow('Responsável interno não encontrado');
    });

    it('cria o contrato e devolve os dias até ao termo', async () => {
      const end = new Date(Date.now() + 10 * 86_400_000);
      mockPrisma.funderContract.create.mockResolvedValue({
        id: 'ct-1',
        endDate: end,
        type: 'MEMORANDUM',
      });
      const result = await service.addContract(
        'fun-1',
        { type: 'MEMORANDUM', endDate: end.toISOString() } as any,
        1,
      );
      expect(result.daysToExpiry).toBe(10);
      expect(mockPrisma.funderContract.create.mock.calls[0][0].data.funderId).toBe('fun-1');
    });

    it('daysToExpiry é null sem data de término', async () => {
      mockPrisma.funderContract.findMany.mockResolvedValue([{ id: 'ct-1', endDate: null }]);
      const [c] = await service.getContracts('fun-1');
      expect(c.daysToExpiry).toBeNull();
    });

    it('actualizar valida contra a data actual já gravada', async () => {
      mockPrisma.funderContract.findFirst.mockResolvedValue({
        id: 'ct-1',
        startDate: new Date('2026-06-01'),
        endDate: null,
        signedAt: null,
      });
      await expect(
        service.updateContract('fun-1', 'ct-1', { endDate: '2026-01-01' } as any, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('remover um contrato inexistente dá 404', async () => {
      mockPrisma.funderContract.findFirst.mockResolvedValue(null);
      await expect(service.removeContract('fun-1', 'ct-x', 1)).rejects.toThrow(NotFoundException);
    });

    it('remover faz soft delete', async () => {
      mockPrisma.funderContract.findFirst.mockResolvedValue({ id: 'ct-1' });
      await service.removeContract('fun-1', 'ct-1', 1);
      expect(mockPrisma.funderContract.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('§11 requisitos de reporte', () => {
    it('criar relatório sincroniza o próximo prazo do financiador', async () => {
      const due = new Date(Date.now() + 5 * 86_400_000);
      mockPrisma.funderReport.create.mockResolvedValue({
        id: 'r-1',
        status: 'PENDING',
        dueDate: due,
        type: 'FINANCIAL',
      });
      mockPrisma.funderReport.findFirst.mockResolvedValue({ dueDate: due });
      const result = await service.createReport(
        'fun-1',
        { title: 'T', period: 'Q1', dueDate: due.toISOString(), type: 'FINANCIAL' } as any,
        1,
      );
      expect(result.isOverdue).toBe(false);
      expect(mockPrisma.funder.update).toHaveBeenCalledWith({
        where: { id: 'fun-1' },
        data: { nextReportDue: due },
      });
    });

    it('sem relatórios pendentes o próximo prazo fica a null', async () => {
      mockPrisma.funderReport.findFirst
        .mockResolvedValueOnce({ id: 'r-1', submittedAt: null }) // findReport
        .mockResolvedValueOnce(null); // próximo pendente
      mockPrisma.funderReport.update.mockResolvedValue({
        id: 'r-1',
        status: 'SUBMITTED',
        dueDate: new Date(),
      });
      await service.updateReport('fun-1', 'r-1', { status: 'SUBMITTED' } as any, 1);
      expect(mockPrisma.funder.update).toHaveBeenCalledWith({
        where: { id: 'fun-1' },
        data: { nextReportDue: null },
      });
    });

    it('marcar como submetido sem data assume agora', async () => {
      mockPrisma.funderReport.findFirst
        .mockResolvedValueOnce({ id: 'r-1', submittedAt: null })
        .mockResolvedValueOnce(null);
      mockPrisma.funderReport.update.mockResolvedValue({
        id: 'r-1',
        status: 'SUBMITTED',
        dueDate: new Date(),
      });
      await service.updateReport('fun-1', 'r-1', { status: 'SUBMITTED' } as any, 1);
      expect(mockPrisma.funderReport.update.mock.calls[0][0].data.submittedAt).toBeInstanceOf(Date);
    });

    it('relatório pendente com prazo passado vem como em atraso', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([
        { id: 'a', status: 'PENDING', dueDate: new Date('2020-01-01') },
        { id: 'b', status: 'SUBMITTED', dueDate: new Date('2020-01-01') },
        { id: 'c', status: 'PENDING', dueDate: new Date(Date.now() + 86_400_000) },
      ]);
      const list = await service.getReports('fun-1', {});
      expect(list.map(r => r.isOverdue)).toEqual([true, false, false]);
    });

    it('aplica os filtros de tipo e estado', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([]);
      await service.getReports('fun-1', { type: 'AUDIT', status: 'PENDING' } as any);
      expect(mockPrisma.funderReport.findMany.mock.calls[0][0].where).toMatchObject({
        funderId: 'fun-1',
        type: 'AUDIT',
        status: 'PENDING',
      });
    });

    it('rejeita relatório com financiamento de outro financiador', async () => {
      mockPrisma.fundingGrant.findFirst.mockResolvedValue(null);
      await expect(
        service.createReport(
          'fun-1',
          { title: 'T', period: 'Q1', dueDate: '2026-12-01', grantId: 'grt-x' } as any,
          1,
        ),
      ).rejects.toThrow('Financiamento não pertence a este financiador');
    });

    it('actualizar/remover relatório de outro financiador dá 404', async () => {
      mockPrisma.funderReport.findFirst.mockResolvedValue(null);
      await expect(service.updateReport('fun-1', 'r-x', {} as any, 1)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.removeReport('fun-1', 'r-x', 1)).rejects.toThrow(NotFoundException);
    });

    it('submeter relatório recalcula o próximo prazo do respectivo financiador', async () => {
      mockPrisma.funderReport.findUnique.mockResolvedValue({
        id: 'r-1',
        funderId: 'fun-1',
        deletedAt: null,
      });
      mockPrisma.funderReport.update.mockResolvedValue({ id: 'r-1', status: 'SUBMITTED' });
      await service.submitReport('r-1', 'https://x/y.pdf', 1);
      expect(mockPrisma.funder.update).toHaveBeenCalledWith({
        where: { id: 'fun-1' },
        data: { nextReportDue: null },
      });
    });
  });

  describe('§12 indicadores', () => {
    it('rejeita indicador padrão duplicado no mesmo âmbito', async () => {
      mockPrisma.funderIndicator.findFirst.mockResolvedValue({ id: 'i-0' });
      await expect(
        service.addIndicator('fun-1', { key: 'WOMEN', target: 10 } as any, 1),
      ).rejects.toThrow('Este indicador já está configurado para o âmbito');
      expect(mockPrisma.funderIndicator.create).not.toHaveBeenCalled();
    });

    it('indicadores CUSTOM podem repetir-se', async () => {
      mockPrisma.funderIndicator.create.mockResolvedValue({
        id: 'i-1',
        key: 'CUSTOM',
        target: 5,
        achieved: 1,
      });
      await service.addIndicator('fun-1', { key: 'CUSTOM', name: 'KPI X', target: 5 } as any, 1);
      expect(mockPrisma.funderIndicator.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.funderIndicator.create).toHaveBeenCalled();
    });

    it('rejeita programa de outro financiador', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue(null);
      await expect(
        service.addIndicator('fun-1', { key: 'YOUTH', programId: 'p-x' } as any, 1),
      ).rejects.toThrow('Programa não pertence a este financiador');
    });

    it('calcula a percentagem de cumprimento da meta', async () => {
      mockPrisma.funderIndicator.findFirst.mockResolvedValue(null);
      mockPrisma.funderIndicator.create.mockResolvedValue({
        id: 'i-1',
        key: 'PARTICIPANTS',
        target: 200,
        achieved: 50,
      });
      const result = await service.addIndicator(
        'fun-1',
        { key: 'PARTICIPANTS', target: 200, achieved: 50 } as any,
        1,
      );
      expect(result.progress).toBe(25);
    });

    it('sem meta o cumprimento é null', async () => {
      mockPrisma.funderIndicator.findMany.mockResolvedValue([
        { id: 'i', key: 'JOBS_CREATED', target: null, achieved: 3 },
      ]);
      const [i] = await service.getIndicators('fun-1', {});
      expect(i.progress).toBeNull();
    });

    it('actualizar valida unicidade com o âmbito já gravado, excluindo o próprio', async () => {
      mockPrisma.funderIndicator.findFirst
        .mockResolvedValueOnce({ id: 'i-1', key: 'WOMEN', programId: 'p-1', grantId: null })
        .mockResolvedValueOnce(null);
      mockPrisma.funderIndicator.update.mockResolvedValue({
        id: 'i-1',
        target: 10,
        achieved: 4,
      });
      await service.updateIndicator('fun-1', 'i-1', { achieved: 4 } as any, 1);
      expect(mockPrisma.funderIndicator.findFirst.mock.calls[1][0].where).toMatchObject({
        key: 'WOMEN',
        programId: 'p-1',
        grantId: null,
        id: { not: 'i-1' },
      });
    });

    it('resumo de impacto agrega metas e resultados por tipo', async () => {
      mockPrisma.funderIndicator.groupBy.mockResolvedValue([
        { key: 'WOMEN', _sum: { target: 100, achieved: 40 }, _count: { id: 2 } },
        { key: 'YOUTH', _sum: { target: null, achieved: 7 }, _count: { id: 1 } },
      ]);
      const summary = await service.getImpactSummary('fun-1');
      expect(summary).toEqual([
        { key: 'WOMEN', indicators: 2, target: 100, achieved: 40, progress: 40 },
        { key: 'YOUTH', indicators: 1, target: 0, achieved: 7, progress: null },
      ]);
    });

    it('remover um indicador inexistente dá 404', async () => {
      mockPrisma.funderIndicator.findFirst.mockResolvedValue(null);
      await expect(service.removeIndicator('fun-1', 'i-x', 1)).rejects.toThrow(NotFoundException);
    });
  });
});
