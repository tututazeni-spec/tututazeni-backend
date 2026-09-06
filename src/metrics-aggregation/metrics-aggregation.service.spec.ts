import { Test, TestingModule } from '@nestjs/testing';
import { MetricsAggregationService } from './metrics-aggregation.service';
import { PrismaService } from '../prisma/prisma.service';

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: unknown[] = []) => jest.fn().mockResolvedValue(data);

const mockPrisma = {
  user: {
    count: makeCount(0),
    findMany: makeFind(),
  },
  department: { findMany: makeFind() },
  position: { findMany: makeFind() },
};

const mockPrismaProxy = mockPrisma as unknown as Record<string, unknown>;

describe('MetricsAggregationService', () => {
  let service: MetricsAggregationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.count = makeCount(0);
    mockPrisma.user.findMany = makeFind();
    mockPrisma.department.findMany = makeFind();
    mockPrisma.position.findMany = makeFind();
    Object.defineProperty(mockPrismaProxy, 'read', {
      get() {
        return mockPrismaProxy;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsAggregationService, { provide: PrismaService, useValue: mockPrismaProxy }],
    }).compile();
    service = module.get<MetricsAggregationService>(MetricsAggregationService);
  });

  // ════════════════════════════════════════════════════════════════
  // headcount
  // ════════════════════════════════════════════════════════════════

  describe('headcount', () => {
    it('total conta toda a população; active só active:true; inactive = total - active', async () => {
      mockPrisma.user.count = jest
        .fn()
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(90) // active
        .mockResolvedValueOnce(0) // newHires
        .mockResolvedValueOnce(0); // newHiresPrev

      const result = await service.headcount({});

      expect(result.total).toBe(100);
      expect(result.active).toBe(90);
      expect(result.inactive).toBe(10);

      expect(mockPrisma.user.count).toHaveBeenNthCalledWith(1, { where: {} });
      expect(mockPrisma.user.count).toHaveBeenNthCalledWith(2, { where: { active: true } });
    });

    it('result NÃO tem a chave turnoverRate', async () => {
      mockPrisma.user.count = makeCount(10);
      const result = await service.headcount({});
      expect(result).not.toHaveProperty('turnoverRate');
    });

    it('departmentId aplica-se a todas as contagens (total + active)', async () => {
      mockPrisma.user.count = makeCount(5);
      await service.headcount({ departmentId: 7 });

      expect(mockPrisma.user.count).toHaveBeenNthCalledWith(1, { where: { departmentId: 7 } });
      expect(mockPrisma.user.count).toHaveBeenNthCalledWith(2, {
        where: { departmentId: 7, active: true },
      });
      // tenure findMany também scoped
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { departmentId: 7, active: true } }),
      );
    });

    it('newHires conta hireDate ∈ [from,to] — nunca createdAt', async () => {
      mockPrisma.user.count = makeCount(3);
      const from = new Date('2025-01-01T00:00:00.000Z');
      const to = new Date('2025-12-31T23:59:59.999Z');

      await service.headcount({ from, to });

      const thirdCall = mockPrisma.user.count.mock.calls[2][0];
      expect(thirdCall.where.hireDate).toEqual({ gte: from, lte: to });
      expect(JSON.stringify(thirdCall)).not.toContain('createdAt');
    });

    it('newHiresPrev usa a janela anterior de igual duração; newHiresTrend em %', async () => {
      mockPrisma.user.count = jest
        .fn()
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(50) // active
        .mockResolvedValueOnce(12) // newHires
        .mockResolvedValueOnce(10); // newHiresPrev

      const from = new Date('2025-07-01T00:00:00.000Z');
      const to = new Date('2025-08-01T00:00:00.000Z');
      const durationMs = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - durationMs);

      const result = await service.headcount({ from, to });

      const fourthCall = mockPrisma.user.count.mock.calls[3][0];
      expect(fourthCall.where.hireDate).toEqual({ gte: prevFrom, lt: from });
      expect(result.newHires).toBe(12);
      expect(result.newHiresPrev).toBe(10);
      expect(result.newHiresTrend).toBe(20); // (12-10)/10*100
    });

    it('byDepartment e byPosition são scoped a active:true e ordenados desc por count', async () => {
      mockPrisma.user.count = makeCount(0);
      mockPrisma.department.findMany = jest.fn().mockResolvedValue([
        { id: 1, name: 'Eng', _count: { users: 3 } },
        { id: 2, name: 'RH', _count: { users: 9 } },
      ]);
      mockPrisma.position.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 5, name: 'Dev', level: 2, _count: { users: 4 } }]);

      const result = await service.headcount({});

      expect(mockPrisma.department.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          _count: { select: { users: { where: { active: true } } } },
        },
      });
      expect(mockPrisma.position.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          level: true,
          _count: { select: { users: { where: { active: true } } } },
        },
        orderBy: { users: { _count: 'desc' } },
        take: 10,
      });

      expect(result.byDepartment).toEqual([
        { id: 2, name: 'RH', count: 9 },
        { id: 1, name: 'Eng', count: 3 },
      ]);
      expect(result.byPosition).toEqual([{ id: 5, name: 'Dev', level: 2, count: 4 }]);
    });

    it('byTenure faz bucketing sobre activos (base hireDate ?? createdAt)', async () => {
      mockPrisma.user.count = makeCount(0);
      const now = Date.now();
      const monthsAgo = (m: number) => new Date(now - m * 30 * 86400000);
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([
        { hireDate: monthsAgo(3), createdAt: monthsAgo(3) }, // <1yr
        { hireDate: monthsAgo(18), createdAt: monthsAgo(18) }, // 1-2yr
        { hireDate: null, createdAt: monthsAgo(40) }, // 2-5yr via createdAt fallback
        { hireDate: monthsAgo(80), createdAt: monthsAgo(80) }, // 5+yr
      ]);

      const result = await service.headcount({});

      expect(result.byTenure).toEqual({ '<1yr': 1, '1-2yr': 1, '2-5yr': 1, '5+yr': 1 });
      expect(result.avgTenureMonths).toBeGreaterThan(0);
    });

    it('janela default = trailing 12 meses até agora', async () => {
      mockPrisma.user.count = makeCount(0);
      const before = Date.now();
      const result = await service.headcount({});
      const after = Date.now();

      expect(result.period.to.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.period.to.getTime()).toBeLessThanOrEqual(after);

      const spanMonths =
        (result.period.to.getFullYear() - result.period.from.getFullYear()) * 12 +
        (result.period.to.getMonth() - result.period.from.getMonth());
      expect(spanMonths).toBe(12);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // headcountTrend
  // ════════════════════════════════════════════════════════════════

  describe('headcountTrend', () => {
    it('devolve N pontos para months: N', async () => {
      mockPrisma.user.count = makeCount(0);
      const result = await service.headcountTrend({ months: 3 });
      expect(result).toHaveLength(3);
    });

    it('default = 6 pontos', async () => {
      mockPrisma.user.count = makeCount(0);
      const result = await service.headcountTrend({});
      expect(result).toHaveLength(6);
    });

    it('month label é YYYY-MM e cronológico ascendente', async () => {
      mockPrisma.user.count = makeCount(0);
      const result = await service.headcountTrend({ months: 4 });
      for (const p of result) {
        expect(p.month).toMatch(/^\d{4}-\d{2}$/);
      }
      const labels = result.map(p => p.month);
      expect([...labels].sort()).toEqual(labels);
    });

    it('headcount de cada ponto = activos ponto-a-ponto (hireDate <= fimMes && (exitDate null || exitDate > fimMes))', async () => {
      mockPrisma.user.count = makeCount(0);
      await service.headcountTrend({ months: 1 });

      const headcountCall = mockPrisma.user.count.mock.calls[0][0];
      expect(headcountCall.where.hireDate).toHaveProperty('lte');
      expect(headcountCall.where.OR).toEqual([
        { exitDate: null },
        { exitDate: { gt: headcountCall.where.hireDate.lte } },
      ]);
    });

    it('new = hireDate no mês; left = exitDate no mês', async () => {
      mockPrisma.user.count = makeCount(0);
      await service.headcountTrend({ months: 1 });

      const newCall = mockPrisma.user.count.mock.calls[1][0];
      const leftCall = mockPrisma.user.count.mock.calls[2][0];

      expect(newCall.where.hireDate).toHaveProperty('gte');
      expect(newCall.where.hireDate).toHaveProperty('lte');
      expect(newCall.where).not.toHaveProperty('exitDate');

      expect(leftCall.where.exitDate).toHaveProperty('gte');
      expect(leftCall.where.exitDate).toHaveProperty('lte');
    });

    it('departmentId aplica-se a todas as contagens do trend', async () => {
      mockPrisma.user.count = makeCount(0);
      await service.headcountTrend({ months: 1, departmentId: 4 });
      for (const call of mockPrisma.user.count.mock.calls) {
        expect(call[0].where.departmentId).toBe(4);
      }
    });
  });
});
