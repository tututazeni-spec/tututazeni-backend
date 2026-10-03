import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmFundersService } from './crm-funders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const funder = {
  id: 'fun-1',
  deletedAt: null,
  typicalMinAmount: 100,
  typicalMaxAmount: 500,
  contacts: [],
  programs: [],
};

const mockPrisma: Record<string, any> = {
  funder: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  funderProgram: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
};
const mockAudit = { logEntity: jest.fn() };

describe('CrmFundersService — §4 perfil de financiamento, §5 elegibilidade, §6 programas', () => {
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
  });

  describe('perfil e elegibilidade — intervalos', () => {
    it('rejeita valor máximo habitual inferior ao mínimo na criação', async () => {
      await expect(
        service.create(
          { type: 'FOUNDATION', name: 'X', typicalMinAmount: 500, typicalMaxAmount: 100 } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.funder.create).not.toHaveBeenCalled();
    });

    it('rejeita idade máxima < mínima', async () => {
      await expect(
        service.create(
          { type: 'FOUNDATION', name: 'X', eligibleMinAge: 40, eligibleMaxAge: 18 } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('na actualização compara com o valor já guardado', async () => {
      // guardado: min 100 / max 500 → novo min 900 é incoerente com o max existente
      await expect(service.update('fun-1', { typicalMinAmount: 900 } as any, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.funder.update).not.toHaveBeenCalled();
    });

    it('aceita intervalo coerente', async () => {
      mockPrisma.funder.update.mockResolvedValue({ id: 'fun-1' });
      await service.update('fun-1', { typicalMaxAmount: 800 } as any, 1);
      expect(mockPrisma.funder.update).toHaveBeenCalled();
    });
  });

  describe('programas e projectos financiados', () => {
    it('cria programa com datas convertidas e auditoria', async () => {
      mockPrisma.funderProgram.create.mockResolvedValue({ id: 'p1' });
      await service.addProgram(
        'fun-1',
        { program: 'Crescer', startDate: '2026-01-01', endDate: '2028-12-31' } as any,
        1,
      );
      const data = mockPrisma.funderProgram.create.mock.calls[0][0].data;
      expect(data.funderId).toBe('fun-1');
      expect(data.startDate).toBeInstanceOf(Date);
      expect(mockAudit.logEntity).toHaveBeenCalledWith(
        1,
        'CREATE',
        'FunderProgram',
        'p1',
        expect.anything(),
      );
    });

    it('rejeita data de término anterior ao início', async () => {
      await expect(
        service.addProgram(
          'fun-1',
          { program: 'X', startDate: '2026-05-01', endDate: '2026-01-01' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita responsável inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.addProgram('fun-1', { program: 'X', responsibleId: 99 } as any, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('update valida datas contra as já guardadas', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue({
        id: 'p1',
        startDate: new Date('2026-06-01'),
        endDate: null,
      });
      await expect(
        service.updateProgram('fun-1', 'p1', { endDate: '2026-01-01' } as any, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('update/remove de programa de outro financiador → 404', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue(null);
      await expect(service.updateProgram('fun-1', 'px', {} as any, 1)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.removeProgram('fun-1', 'px', 1)).rejects.toThrow(NotFoundException);
    });

    it('remove faz soft-delete', async () => {
      mockPrisma.funderProgram.findFirst.mockResolvedValue({ id: 'p1' });
      mockPrisma.funderProgram.update.mockResolvedValue({});
      await service.removeProgram('fun-1', 'p1', 1);
      expect(mockPrisma.funderProgram.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
