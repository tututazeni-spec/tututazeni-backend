import { Test, TestingModule } from '@nestjs/testing';
import { DashboardInstitutionalService } from './dashboard-institutional.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockPrisma = {
  user: { count: jest.fn() },
  course: { count: jest.fn() },
  enrollment: { count: jest.fn() },
  beneficiary: { count: jest.fn(), groupBy: jest.fn() },
  partner: { count: jest.fn() },
  partnerMilestone: { count: jest.fn() },
  funder: { count: jest.fn() },
  fundingGrant: { aggregate: jest.fn() },
  funderReport: { count: jest.fn() },
  libraryItem: { count: jest.fn() },
  issuedCertificate: { count: jest.fn() },
  badgeIssuance: { count: jest.fn() },
  institutionalSnapshot: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  dashboardWidget: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('DashboardInstitutionalService', () => {
  let service: DashboardInstitutionalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardInstitutionalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<DashboardInstitutionalService>(
      DashboardInstitutionalService,
    );
    jest.clearAllMocks();
  });

  describe('getExecutiveSummary', () => {
    it('deve retornar resumo com people, learning, crm, knowledge', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        100, 10, 25, 40, 60, 30, 5, 3,
        { _sum: { amount: 5000000 } },
        50, 80, 20,
      ]);
      const result = await service.getExecutiveSummary();
      expect(result).toHaveProperty('people');
      expect(result).toHaveProperty('learning');
      expect(result).toHaveProperty('crm');
      expect(result).toHaveProperty('knowledge');
      expect(result.people.total).toBe(100);
      expect(result.crm.totalFunding).toBe(5000000);
    });

    it('deve calcular completionRate correctamente', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        100, 10, 25, 40, 50, 30, 5, 3, { _sum: { amount: 0 } }, 50, 80, 20,
      ]);
      const result = await service.getExecutiveSummary();
      expect(result.learning.completionRate).toBe(50);
    });
  });

  describe('getGrowthTrend', () => {
    it('deve retornar array com N meses', async () => {
      mockPrisma.$transaction.mockResolvedValue([5, 10, 8]);
      const result = await service.getGrowthTrend(3);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('users');
      expect(result[0].users).toBe(5);
    });
  });

  describe('getAlerts', () => {
    it('deve retornar críticos, avisos e lembretes', async () => {
      mockPrisma.$transaction.mockResolvedValue([2, 1, 3, 1, 0, 4]);
      const result = await service.getAlerts();
      expect(result).toHaveProperty('critical');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('reminders');
      expect(result.critical).toBe(3); // 2+1+0
      expect(result.warnings).toBe(5); // 1+4
      expect(result.reminders).toBe(3);
    });
  });

  describe('getGeographicDistribution', () => {
    it('deve retornar distribuição por província', async () => {
      mockPrisma.beneficiary.groupBy.mockResolvedValue([
        { province: 'LUANDA', _count: { id: 10 } },
      ]);
      const result = await service.getGeographicDistribution();
      expect(result).toHaveProperty('beneficiariesByProvince');
      expect(result.beneficiariesByProvince).toHaveLength(1);
    });
  });

  describe('createSnapshot', () => {
    it('deve criar snapshot com métricas em JSON', async () => {
      mockPrisma.institutionalSnapshot.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockResolvedValue([
        100, 10, 25, 40, 60, 30, 5, 3,
        { _sum: { amount: 5000000 } },
        50, 80, 20,
      ]);
      mockPrisma.institutionalSnapshot.create.mockResolvedValue({
        id: 'snap-1',
        period: '2026-06',
        totalUsers: 100,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createSnapshot({ period: '2026-06' }, 1);
      expect(result.period).toBe('2026-06');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se snapshot já existe', async () => {
      mockPrisma.institutionalSnapshot.findUnique.mockResolvedValue({
        id: 'snap-1',
        deletedAt: null,
      });
      await expect(
        service.createSnapshot({ period: '2026-06' }, 1),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllSnapshots', () => {
    it('deve retornar snapshots paginados', async () => {
      mockPrisma.$transaction.mockResolvedValue([[{ id: 'snap-1' }], 1]);
      const result = await service.findAllSnapshots({ page: 1, limit: 12 });
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('compareSnapshots', () => {
    it('deve comparar dois períodos com variação percentual', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        {
          totalUsers: 100,
          totalEnrollments: 40,
          totalBeneficiaries: 30,
          totalFunding: 1000000,
          totalCertificates: 50,
          completionRate: 60,
        },
        {
          totalUsers: 120,
          totalEnrollments: 50,
          totalBeneficiaries: 35,
          totalFunding: 1500000,
          totalCertificates: 70,
          completionRate: 65,
        },
      ]);
      const result = await service.compareSnapshots('2026-05', '2026-06');
      expect(result.comparison.users.change).toBe(20);
      expect(result.comparison.users.changePct).toBe(20);
    });

    it('deve lançar NotFoundException se snapshot não existe', async () => {
      mockPrisma.$transaction.mockResolvedValue([null, null]);
      await expect(
        service.compareSnapshots('2026-05', '2026-06'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('widgets', () => {
    it('createWidget deve criar widget', async () => {
      mockPrisma.dashboardWidget.create.mockResolvedValue({ id: 'w-1' });
      const result = await service.createWidget(
        { type: 'KPI_CARD' as any, title: 'T', config: '{}' },
        1,
      );
      expect(result.id).toBe('w-1');
    });

    it('updateWidget deve lançar NotFoundException se não existir', async () => {
      mockPrisma.dashboardWidget.findFirst.mockResolvedValue(null);
      await expect(
        service.updateWidget('w-1', { title: 'X' } as any, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('deleteWidget deve remover (soft delete)', async () => {
      mockPrisma.dashboardWidget.findFirst.mockResolvedValue({ id: 'w-1' });
      mockPrisma.dashboardWidget.update.mockResolvedValue({});
      const result = await service.deleteWidget('w-1', 1);
      expect(result.message).toContain('sucesso');
    });
  });
});
