import { Test, TestingModule } from '@nestjs/testing';
import { MetricsAggregationService } from './metrics-aggregation.service';
import { evaluateRule_PDI_ACTION_CRITICAL, evaluateRule_PDI_PLAN_OVERDUE } from './alert-rules';
import { PrismaService } from '../prisma/prisma.service';

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: unknown[] = []) => jest.fn().mockResolvedValue(data);

const mockPrisma = {
  user: {
    count: makeCount(0),
    findMany: makeFind(),
    findUnique: makeFind() as unknown as jest.Mock,
  },
  department: { findMany: makeFind() },
  position: { findMany: makeFind() },
  enrollment: {
    count: makeCount(0),
    findMany: makeFind(),
  },
  course: { count: makeCount(0) },
  engagementSurvey: { count: makeCount(0) },
  evaluationRequest: { count: makeCount(0) },
  developmentPlanAction: { count: makeCount(0) },
  developmentPlan: { count: makeCount(0), findMany: makeFind() },
  performanceReview: {
    count: makeCount(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
    findMany: makeFind(),
  },
  surveyResponse: { count: makeCount(0) },
  avatarSession: { count: makeCount(0) },
  userCompetency: { findMany: makeFind() },
  nineBoxPlacement: { findMany: makeFind() },
};

const mockPrismaProxy = mockPrisma as unknown as Record<string, unknown>;

describe('MetricsAggregationService', () => {
  let service: MetricsAggregationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.count = makeCount(0);
    mockPrisma.user.findMany = makeFind();
    mockPrisma.user.findUnique = makeFind() as unknown as jest.Mock;
    mockPrisma.department.findMany = makeFind();
    mockPrisma.position.findMany = makeFind();
    mockPrisma.enrollment.count = makeCount(0);
    mockPrisma.enrollment.findMany = makeFind();
    mockPrisma.course.count = makeCount(0);
    mockPrisma.engagementSurvey.count = makeCount(0);
    mockPrisma.evaluationRequest.count = makeCount(0);
    mockPrisma.developmentPlanAction.count = makeCount(0);
    mockPrisma.developmentPlan.count = makeCount(0);
    mockPrisma.developmentPlan.findMany = makeFind();
    mockPrisma.performanceReview.count = makeCount(0);
    mockPrisma.performanceReview.aggregate = jest.fn().mockResolvedValue({ _avg: { score: null } });
    mockPrisma.performanceReview.findMany = makeFind();
    mockPrisma.surveyResponse.count = makeCount(0);
    mockPrisma.avatarSession.count = makeCount(0);
    mockPrisma.userCompetency.findMany = makeFind();
    mockPrisma.nineBoxPlacement.findMany = makeFind();
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

  // ════════════════════════════════════════════════════════════════
  // turnover — nota §2.2
  // ════════════════════════════════════════════════════════════════

  describe('turnover', () => {
    // ordem das 6 contagens no Promise.all:
    // 0 leavers · 1 headcountStart · 2 headcountEnd · 3 leaversPrev · 4 headcountPrevStart · 5 newHires
    const scenario = () =>
      jest
        .fn()
        .mockResolvedValueOnce(12) // leavers
        .mockResolvedValueOnce(100) // headcountStart
        .mockResolvedValueOnce(140) // headcountEnd
        .mockResolvedValueOnce(6) // leaversPrev
        .mockResolvedValueOnce(80) // headcountPrevStart
        .mockResolvedValueOnce(20); // newHires

    it('leavers conta exitDate ∈ [from,to] — NUNCA updatedAt, NUNCA active:false', async () => {
      mockPrisma.user.count = scenario();
      const from = new Date('2025-01-01T00:00:00.000Z');
      const to = new Date('2025-12-31T23:59:59.999Z');

      await service.turnover({ from, to });

      const leaversCall = mockPrisma.user.count.mock.calls[0][0];
      expect(leaversCall.where.exitDate).toEqual({ gte: from, lte: to });
      expect(leaversCall.where).not.toHaveProperty('active');
      expect(JSON.stringify(leaversCall)).not.toContain('updatedAt');
    });

    it('headcountStart/End = activos ponto-a-ponto (hireDate<=fronteira && (exitDate null || exitDate>fronteira))', async () => {
      mockPrisma.user.count = scenario();
      const from = new Date('2025-01-01T00:00:00.000Z');
      const to = new Date('2025-12-31T23:59:59.999Z');

      await service.turnover({ from, to });

      const startCall = mockPrisma.user.count.mock.calls[1][0];
      const endCall = mockPrisma.user.count.mock.calls[2][0];
      expect(startCall.where.hireDate).toEqual({ lte: from });
      expect(startCall.where.OR).toEqual([{ exitDate: null }, { exitDate: { gt: from } }]);
      expect(endCall.where.hireDate).toEqual({ lte: to });
      expect(endCall.where.OR).toEqual([{ exitDate: null }, { exitDate: { gt: to } }]);
    });

    it('avgHeadcount = (headcountStart + headcountEnd) / 2', async () => {
      mockPrisma.user.count = scenario();
      const result = await service.turnover({});
      expect(result.avgHeadcount).toBe(120); // (100 + 140) / 2
    });

    it('turnoverRate = round(leavers / avgHeadcount * 100, 1); retentionRate = 100 - turnoverRate', async () => {
      mockPrisma.user.count = scenario();
      const result = await service.turnover({});
      expect(result.turnoverRate).toBe(10); // 12 / 120 * 100
      expect(result.retentionRate).toBe(90); // 100 - 10
    });

    it('turnoverTrend = turnoverRate - turnoverRatePrev (janela anterior de igual duração)', async () => {
      mockPrisma.user.count = scenario();
      const from = new Date('2025-07-01T00:00:00.000Z');
      const to = new Date('2025-08-01T00:00:00.000Z');
      const durationMs = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - durationMs);

      const result = await service.turnover({ from, to });

      // leaversPrev usa [prevFrom, from)
      const leaversPrevCall = mockPrisma.user.count.mock.calls[3][0];
      expect(leaversPrevCall.where.exitDate).toEqual({ gte: prevFrom, lt: from });

      // headcountPrevStart ponto-a-ponto em prevFrom
      const prevStartCall = mockPrisma.user.count.mock.calls[4][0];
      expect(prevStartCall.where.hireDate).toEqual({ lte: prevFrom });

      // prevAvgHc = (80 + 100)/2 = 90 → ratePrev = round(6/90*100,1) = 6.7 → trend = 10 - 6.7 = 3.3
      expect(result.turnoverRatePrev).toBe(6.7);
      expect(result.turnoverTrend).toBe(3.3);
    });

    it('newHires conta hireDate ∈ [from,to]; netHeadcountChange = newHires - leavers', async () => {
      mockPrisma.user.count = scenario();
      const from = new Date('2025-01-01T00:00:00.000Z');
      const to = new Date('2025-12-31T23:59:59.999Z');

      const result = await service.turnover({ from, to });

      const newHiresCall = mockPrisma.user.count.mock.calls[5][0];
      expect(newHiresCall.where.hireDate).toEqual({ gte: from, lte: to });
      expect(result.newHires).toBe(20);
      expect(result.netHeadcountChange).toBe(8); // 20 - 12
    });

    it('guarda divisão-por-zero: avgHeadcount 0 → turnoverRate 0 (não NaN)', async () => {
      mockPrisma.user.count = makeCount(0);
      const result = await service.turnover({});
      expect(result.avgHeadcount).toBe(0);
      expect(result.turnoverRate).toBe(0);
      expect(Number.isNaN(result.turnoverRate)).toBe(false);
      expect(result.retentionRate).toBe(100);
      expect(result.turnoverRatePrev).toBe(0);
      expect(result.turnoverTrend).toBe(0);
    });

    it('janela default = trailing 12 meses até agora', async () => {
      mockPrisma.user.count = makeCount(0);
      const before = Date.now();
      const result = await service.turnover({});
      const after = Date.now();

      expect(result.period.to.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.period.to.getTime()).toBeLessThanOrEqual(after);
      const spanMonths =
        (result.period.to.getFullYear() - result.period.from.getFullYear()) * 12 +
        (result.period.to.getMonth() - result.period.from.getMonth());
      expect(spanMonths).toBe(12);
    });

    it('scope filter (departmentId/managerId/positionId) aplica-se a todas as contagens', async () => {
      mockPrisma.user.count = makeCount(0);
      await service.turnover({ departmentId: 7, managerId: 3, positionId: 9 });
      for (const call of mockPrisma.user.count.mock.calls) {
        expect(call[0].where.departmentId).toBe(7);
        expect(call[0].where.managerId).toBe(3);
        expect(call[0].where.positionId).toBe(9);
      }
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { departmentId: 7, managerId: 3, positionId: 9, active: true },
        }),
      );
    });

    it('insights: variante emoji do dashboard-rh; não-vazio; 🚨 crítico acima de 20%', async () => {
      mockPrisma.user.count = jest
        .fn()
        .mockResolvedValueOnce(30) // leavers
        .mockResolvedValueOnce(50) // headcountStart
        .mockResolvedValueOnce(50) // headcountEnd
        .mockResolvedValueOnce(0) // leaversPrev
        .mockResolvedValueOnce(50) // headcountPrevStart
        .mockResolvedValueOnce(0); // newHires

      const result = await service.turnover({});

      expect(result.turnoverRate).toBe(60); // 30 / 50 * 100
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights[0]).toBe('🚨 Turnover crítico: 60% — investigar causas urgentemente');
      expect(result.insights[1]).toBe('30 saída(s) no período');
    });

    it('insights: turnover saudável quando taxa <= 10%', async () => {
      mockPrisma.user.count = scenario();
      const result = await service.turnover({});
      expect(result.insights[0]).toBe('✅ Turnover saudável: 10%');
    });

    it('avgTenureMonths: média sobre activos, base hireDate ?? createdAt', async () => {
      mockPrisma.user.count = makeCount(0);
      const now = Date.now();
      const monthsAgo = (m: number) => new Date(now - m * 30 * 86400000);
      mockPrisma.user.findMany = jest.fn().mockResolvedValue([
        { hireDate: monthsAgo(6), createdAt: monthsAgo(6) },
        { hireDate: null, createdAt: monthsAgo(24) },
      ]);
      const result = await service.turnover({});
      expect(result.avgTenureMonths).toBeGreaterThan(0);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { active: true },
          select: { hireDate: true, createdAt: true },
        }),
      );
    });
  });

  // ════════════════════════════════════════════════════════════════
  // trainingRoi — nota §3.2
  // ════════════════════════════════════════════════════════════════

  describe('trainingRoi', () => {
    // ordem das 2 contagens no Promise.all: 0 enrollments · 1 completed
    const setCounts = (enrollments: number, completed: number) => {
      mockPrisma.enrollment.count = jest
        .fn()
        .mockResolvedValueOnce(enrollments)
        .mockResolvedValueOnce(completed);
    };

    it('where usa a janela enrolledAt [from,to]; completed filtra status COMPLETED; findMany inclui course.workloadHours', async () => {
      setCounts(10, 4);
      mockPrisma.enrollment.findMany = makeFind([]);
      const from = new Date('2025-01-01T00:00:00.000Z');
      const to = new Date('2025-12-31T23:59:59.999Z');

      await service.trainingRoi({ from, to });

      const enrollCall = mockPrisma.enrollment.count.mock.calls[0][0];
      const completedCall = mockPrisma.enrollment.count.mock.calls[1][0];
      const findCall = mockPrisma.enrollment.findMany.mock.calls[0][0];

      expect(enrollCall.where.enrolledAt).toEqual({ gte: from, lte: to });
      expect(enrollCall.where).not.toHaveProperty('status');

      expect(completedCall.where.enrolledAt).toEqual({ gte: from, lte: to });
      expect(completedCall.where.status).toBe('COMPLETED');

      expect(findCall.where.enrolledAt).toEqual({ gte: from, lte: to });
      expect(findCall.where.status).toBe('COMPLETED');
      expect(findCall.include).toEqual({ course: { select: { workloadHours: true } } });
    });

    it('roiPct = round((grossBenefit - totalCost) / totalCost * 100, 1); bcr; netBenefit; paybackMonths', async () => {
      setCounts(100, 40); // totalCost 20000, grossBenefit 20000
      mockPrisma.enrollment.findMany = makeFind([]);
      const result = await service.trainingRoi({});
      expect(result.totalCost).toBe(20000);
      expect(result.grossBenefit).toBe(20000);
      expect(result.netBenefit).toBe(0);
      expect(result.roiPct).toBe(0);
      expect(result.bcr).toBe(1);
      expect(result.completionRate).toBe(40);
      expect(result.paybackMonths).toBe(12);
    });

    it('roiPct positivo quando benefício > custo', async () => {
      setCounts(50, 40); // totalCost 10000, grossBenefit 20000
      mockPrisma.enrollment.findMany = makeFind([]);
      const result = await service.trainingRoi({});
      expect(result.roiPct).toBe(100);
      expect(result.bcr).toBe(2);
      expect(result.netBenefit).toBe(10000);
    });

    it('guarda div-por-zero: enrollments 0 → completionRate 0; totalCost 0 → roiPct 0 e bcr 0 (nunca NaN/Infinity)', async () => {
      setCounts(0, 0);
      mockPrisma.enrollment.findMany = makeFind([]);
      const result = await service.trainingRoi({});
      expect(result.completionRate).toBe(0);
      expect(result.totalCost).toBe(0);
      expect(result.roiPct).toBe(0);
      expect(result.bcr).toBe(0);
      expect(Number.isNaN(result.roiPct)).toBe(false);
      expect(Number.isFinite(result.bcr)).toBe(true);
    });

    it('guarda div-por-zero: grossBenefit 0 → paybackMonths 0', async () => {
      setCounts(10, 0); // totalCost 2000, grossBenefit 0
      mockPrisma.enrollment.findMany = makeFind([]);
      const result = await service.trainingRoi({});
      expect(result.grossBenefit).toBe(0);
      expect(result.paybackMonths).toBe(0);
      expect(result.roiPct).toBe(-100);
      expect(result.bcr).toBe(0);
      expect(Number.isFinite(result.paybackMonths)).toBe(true);
    });

    it('janela default = trailing 12 meses até agora', async () => {
      setCounts(0, 0);
      mockPrisma.enrollment.findMany = makeFind([]);
      const before = Date.now();
      const result = await service.trainingRoi({});
      const after = Date.now();

      expect(result.period.to.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.period.to.getTime()).toBeLessThanOrEqual(after);
      const spanMonths =
        (result.period.to.getFullYear() - result.period.from.getFullYear()) * 12 +
        (result.period.to.getMonth() - result.period.from.getMonth());
      expect(spanMonths).toBe(12);
    });

    it('departmentId → where.user.departmentId; courseId → where.courseId em todas as queries', async () => {
      setCounts(0, 0);
      mockPrisma.enrollment.findMany = makeFind([]);
      await service.trainingRoi({ departmentId: 7, courseId: 3 });

      for (const call of mockPrisma.enrollment.count.mock.calls) {
        expect(call[0].where.user).toEqual({ departmentId: 7 });
        expect(call[0].where.courseId).toBe(3);
      }
      const findCall = mockPrisma.enrollment.findMany.mock.calls[0][0];
      expect(findCall.where.user).toEqual({ departmentId: 7 });
      expect(findCall.where.courseId).toBe(3);
    });

    it('sem departmentId/courseId → where não tem user nem courseId', async () => {
      setCounts(0, 0);
      mockPrisma.enrollment.findMany = makeFind([]);
      await service.trainingRoi({});
      const enrollCall = mockPrisma.enrollment.count.mock.calls[0][0];
      expect(enrollCall.where).not.toHaveProperty('user');
      expect(enrollCall.where).not.toHaveProperty('courseId');
    });

    it('trainingHours = Σ course.workloadHours das inscrições concluídas na janela', async () => {
      setCounts(20, 3);
      mockPrisma.enrollment.findMany = makeFind([
        { course: { workloadHours: 10 } },
        { course: { workloadHours: 5 } },
        { course: { workloadHours: null } },
      ]);
      const result = await service.trainingRoi({});
      expect(result.trainingHours).toBe(15);
    });

    it('trainingHours fallback = completed * 2 quando workloadHours ausente em massa', async () => {
      setCounts(60, 30);
      mockPrisma.enrollment.findMany = makeFind([
        { course: { workloadHours: null } },
        { course: { workloadHours: null } },
      ]);
      const result = await service.trainingRoi({});
      expect(result.trainingHours).toBe(60);
    });

    it('confidence: LOW abaixo de 20, MEDIUM em 20, MEDIUM abaixo de 50, HIGH em 50', async () => {
      const run = async (completed: number) => {
        setCounts(completed + 10, completed);
        mockPrisma.enrollment.findMany = makeFind([]);
        return (await service.trainingRoi({})).confidence;
      };
      expect(await run(19)).toBe('LOW');
      expect(await run(20)).toBe('MEDIUM');
      expect(await run(49)).toBe('MEDIUM');
      expect(await run(50)).toBe('HIGH');
    });

    it('costPerEnrollment/benefitPerCompletion: default 200/500, overridáveis via params', async () => {
      setCounts(10, 5);
      mockPrisma.enrollment.findMany = makeFind([]);
      const def = await service.trainingRoi({});
      expect(def.costPerEnrollment).toBe(200);
      expect(def.benefitPerCompletion).toBe(500);

      setCounts(10, 5);
      mockPrisma.enrollment.findMany = makeFind([]);
      const custom = await service.trainingRoi({
        costPerEnrollment: 100,
        benefitPerCompletion: 1000,
      });
      expect(custom.costPerEnrollment).toBe(100);
      expect(custom.benefitPerCompletion).toBe(1000);
      expect(custom.totalCost).toBe(1000);
      expect(custom.grossBenefit).toBe(5000);
    });

    it('methodology é uma string constante não-vazia', async () => {
      setCounts(0, 0);
      mockPrisma.enrollment.findMany = makeFind([]);
      const result = await service.trainingRoi({});
      expect(typeof result.methodology).toBe('string');
      expect(result.methodology.length).toBeGreaterThan(0);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // alerts — catálogo canónico de 13 regras (nota §4.6 + §4.8)
  // ════════════════════════════════════════════════════════════════

  describe('alerts', () => {
    const keys = (list: { key: string }[]) => list.map(a => a.key);

    // ── scope: 'user' → regras 1-4 ────────────────────────────────

    describe("scope 'user'", () => {
      it('userId em falta → devolve []', async () => {
        expect(await service.alerts({ scope: 'user' })).toEqual([]);
      });

      it('#1 SURVEYS_PENDING dispara com surveys ACTIVE por responder; query certa', async () => {
        mockPrisma.engagementSurvey.count = makeCount(2);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        const a = r.find(x => x.key === 'SURVEYS_PENDING');
        expect(a).toMatchObject({
          key: 'SURVEYS_PENDING',
          type: 'SURVEY',
          severity: 'MEDIUM',
          scope: 'user',
          count: 2,
          actionUrl: '/engagement',
        });
        expect(mockPrisma.engagementSurvey.count).toHaveBeenCalledWith({
          where: { status: 'ACTIVE', responses: { none: { userId: 42 } } },
        });
      });

      it('#1 SURVEYS_PENDING NÃO dispara quando 0', async () => {
        mockPrisma.engagementSurvey.count = makeCount(0);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        expect(keys(r)).not.toContain('SURVEYS_PENDING');
      });

      it('#2 EVAL_360_PENDING dispara (HIGH); query evaluatorId+PENDING', async () => {
        mockPrisma.evaluationRequest.count = makeCount(3);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        const a = r.find(x => x.key === 'EVAL_360_PENDING');
        expect(a).toMatchObject({ severity: 'HIGH', scope: 'user', type: 'EVALUATION', count: 3 });
        expect(mockPrisma.evaluationRequest.count).toHaveBeenCalledWith({
          where: { evaluatorId: 42, status: 'PENDING' },
        });
      });

      it('#2 EVAL_360_PENDING NÃO dispara quando 0', async () => {
        mockPrisma.evaluationRequest.count = makeCount(0);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        expect(keys(r)).not.toContain('EVAL_360_PENDING');
      });

      it('#3 PDI_ACTIONS_OVERDUE dispara (user → HIGH); query plan.userId + notIn + dueDate<now', async () => {
        mockPrisma.developmentPlanAction.count = makeCount(5);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        const a = r.find(x => x.key === 'PDI_ACTIONS_OVERDUE');
        expect(a).toMatchObject({ severity: 'HIGH', scope: 'user', type: 'PDI', count: 5 });
        const arg = mockPrisma.developmentPlanAction.count.mock.calls[0][0];
        expect(arg.where.plan).toEqual({ userId: 42 });
        expect(arg.where.status).toEqual({ notIn: ['COMPLETED', 'CANCELLED'] });
        expect(arg.where.dueDate).toHaveProperty('lt');
      });

      it('#3 PDI_ACTIONS_OVERDUE NÃO dispara quando 0', async () => {
        mockPrisma.developmentPlanAction.count = makeCount(0);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        expect(keys(r)).not.toContain('PDI_ACTIONS_OVERDUE');
      });

      it('#4 MANDATORY_TRAINING_PENDING dispara (user → MEDIUM); query course.mandatory + enrollments none', async () => {
        mockPrisma.course.count = makeCount(4);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        const a = r.find(x => x.key === 'MANDATORY_TRAINING_PENDING');
        expect(a).toMatchObject({
          severity: 'MEDIUM',
          scope: 'user',
          type: 'COMPLIANCE',
          count: 4,
          actionUrl: '/content-library/mandatory',
        });
        expect(mockPrisma.course.count).toHaveBeenCalledWith({
          where: { mandatory: true, enrollments: { none: { userId: 42, status: 'COMPLETED' } } },
        });
      });

      it('#4 MANDATORY_TRAINING_PENDING NÃO dispara quando 0', async () => {
        mockPrisma.course.count = makeCount(0);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        expect(keys(r)).not.toContain('MANDATORY_TRAINING_PENDING');
      });

      it('scope→rules: só emite regras 1-4, ordenadas por severidade e depois key', async () => {
        mockPrisma.engagementSurvey.count = makeCount(2);
        mockPrisma.evaluationRequest.count = makeCount(3);
        mockPrisma.developmentPlanAction.count = makeCount(5);
        mockPrisma.course.count = makeCount(4);
        const r = await service.alerts({ scope: 'user', userId: 42 });
        expect(keys(r)).toEqual([
          'EVAL_360_PENDING',
          'PDI_ACTIONS_OVERDUE',
          'MANDATORY_TRAINING_PENDING',
          'SURVEYS_PENDING',
        ]);
        r.forEach(a => expect(a.scope).toBe('user'));
      });
    });

    // ── scope: 'organization' → regras 3-4, 9-13 ──────────────────

    describe("scope 'organization'", () => {
      beforeEach(() => {
        mockPrisma.user.findMany = makeFind([{ id: 1 }, { id: 2 }, { id: 3 }]);
      });

      it('#3 PDI_ACTIONS_OVERDUE (org → MEDIUM) usa contagem global (sem plan.userId)', async () => {
        mockPrisma.developmentPlanAction.count = jest
          .fn()
          .mockResolvedValueOnce(7)
          .mockResolvedValueOnce(0);
        const r = await service.alerts({ scope: 'organization' });
        const a = r.find(x => x.key === 'PDI_ACTIONS_OVERDUE');
        expect(a).toMatchObject({ severity: 'MEDIUM', scope: 'organization', count: 7 });
        const arg = mockPrisma.developmentPlanAction.count.mock.calls[0][0];
        expect(arg.where).not.toHaveProperty('plan');
        expect(arg.where.status).toEqual({ notIn: ['COMPLETED', 'CANCELLED'] });
      });

      it('#4 MANDATORY_TRAINING_PENDING (org → HIGH) via enrollment{course.mandatory, status≠COMPLETED}', async () => {
        mockPrisma.enrollment.count = makeCount(9);
        const r = await service.alerts({ scope: 'organization' });
        const a = r.find(x => x.key === 'MANDATORY_TRAINING_PENDING');
        expect(a).toMatchObject({ severity: 'HIGH', scope: 'organization', count: 9 });
        expect(mockPrisma.enrollment.count).toHaveBeenCalledWith({
          where: { course: { mandatory: true }, status: { not: 'COMPLETED' } },
        });
      });

      it('#9 PERFORMANCE_CRITICAL dispara (HIGH); query score<2 + PUBLISHED', async () => {
        mockPrisma.performanceReview.count = makeCount(6);
        const r = await service.alerts({ scope: 'organization' });
        const a = r.find(x => x.key === 'PERFORMANCE_CRITICAL');
        expect(a).toMatchObject({
          severity: 'HIGH',
          scope: 'organization',
          type: 'PERFORMANCE',
          count: 6,
        });
        expect(mockPrisma.performanceReview.count).toHaveBeenCalledWith({
          where: { score: { lt: 2 }, status: 'PUBLISHED' },
        });
      });

      it('#9 PERFORMANCE_CRITICAL NÃO dispara quando 0', async () => {
        mockPrisma.performanceReview.count = makeCount(0);
        const r = await service.alerts({ scope: 'organization' });
        expect(keys(r)).not.toContain('PERFORMANCE_CRITICAL');
      });

      it('#10 SURVEY_PARTICIPATION_LOW dispara quando respostas/activos < 0.30', async () => {
        mockPrisma.surveyResponse.count = makeCount(1);
        mockPrisma.user.count = makeCount(100);
        const r = await service.alerts({ scope: 'organization' });
        const a = r.find(x => x.key === 'SURVEY_PARTICIPATION_LOW');
        expect(a).toMatchObject({ severity: 'MEDIUM', scope: 'organization', type: 'SURVEY' });
        expect(a).not.toHaveProperty('count');
      });

      it('#10 SURVEY_PARTICIPATION_LOW NÃO dispara quando participação >= 30%', async () => {
        mockPrisma.surveyResponse.count = makeCount(50);
        mockPrisma.user.count = makeCount(100);
        const r = await service.alerts({ scope: 'organization' });
        expect(keys(r)).not.toContain('SURVEY_PARTICIPATION_LOW');
      });

      it('#11 INACTIVE_COLLABORATORS dispara: activos da população sem inscrição em 60d', async () => {
        mockPrisma.enrollment.findMany = makeFind([{ userId: 1 }]); // só o user 1 teve actividade
        const r = await service.alerts({ scope: 'organization' });
        const a = r.find(x => x.key === 'INACTIVE_COLLABORATORS');
        expect(a).toMatchObject({
          severity: 'MEDIUM',
          scope: 'organization',
          type: 'RISK',
          count: 2,
        });
        const arg = mockPrisma.enrollment.findMany.mock.calls[0][0];
        expect(arg.where.userId).toEqual({ in: [1, 2, 3] });
        expect(arg.where.enrolledAt).toHaveProperty('gte');
        expect(arg.distinct).toEqual(['userId']);
      });

      it('#11 INACTIVE_COLLABORATORS NÃO dispara quando toda a população teve actividade', async () => {
        mockPrisma.enrollment.findMany = makeFind([{ userId: 1 }, { userId: 2 }, { userId: 3 }]);
        const r = await service.alerts({ scope: 'organization' });
        expect(keys(r)).not.toContain('INACTIVE_COLLABORATORS');
      });

      it('#12 PDI_PLAN_OVERDUE dispara (MEDIUM); query status ACTIVE + endDate<now + userId da população', async () => {
        mockPrisma.developmentPlan.count = makeCount(3);
        const r = await service.alerts({ scope: 'organization' });
        const a = r.find(x => x.key === 'PDI_PLAN_OVERDUE');
        expect(a).toMatchObject({ severity: 'MEDIUM', scope: 'organization', count: 3 });
        const arg = mockPrisma.developmentPlan.count.mock.calls[0][0];
        expect(arg.where.userId).toEqual({ in: [1, 2, 3] });
        expect(arg.where.status).toBe('ACTIVE');
        expect(arg.where.endDate).toHaveProperty('lt');
      });

      it('#13 PDI_ACTION_CRITICAL dispara (HIGH); plan ACTIVE + not COMPLETED + dueDate < now-14d', async () => {
        mockPrisma.developmentPlanAction.count = jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(4);
        const r = await service.alerts({ scope: 'organization' });
        const a = r.find(x => x.key === 'PDI_ACTION_CRITICAL');
        expect(a).toMatchObject({ severity: 'HIGH', scope: 'organization', count: 4 });
        const arg = mockPrisma.developmentPlanAction.count.mock.calls[1][0];
        expect(arg.where.plan).toEqual({ userId: { in: [1, 2, 3] }, status: 'ACTIVE' });
        expect(arg.where.status).toEqual({ not: 'COMPLETED' });
        expect(arg.where.dueDate).toHaveProperty('lt');
      });

      it('scope→rules: emite exactamente {3,4,9,10,11,12,13}; nenhuma regra de user/team', async () => {
        mockPrisma.developmentPlanAction.count = jest
          .fn()
          .mockResolvedValueOnce(7)
          .mockResolvedValueOnce(4);
        mockPrisma.enrollment.count = makeCount(9);
        mockPrisma.performanceReview.count = makeCount(6);
        mockPrisma.surveyResponse.count = makeCount(1);
        mockPrisma.user.count = makeCount(100);
        mockPrisma.enrollment.findMany = makeFind([]);
        mockPrisma.developmentPlan.count = makeCount(3);
        const r = await service.alerts({ scope: 'organization' });
        expect([...keys(r)].sort()).toEqual([
          'INACTIVE_COLLABORATORS',
          'MANDATORY_TRAINING_PENDING',
          'PDI_ACTIONS_OVERDUE',
          'PDI_ACTION_CRITICAL',
          'PDI_PLAN_OVERDUE',
          'PERFORMANCE_CRITICAL',
          'SURVEY_PARTICIPATION_LOW',
        ]);
        r.forEach(a => expect(a.scope).toBe('organization'));
      });

      it('resultado ordenado por severidade (HIGH→MEDIUM→LOW) e depois key', async () => {
        mockPrisma.developmentPlanAction.count = jest
          .fn()
          .mockResolvedValueOnce(7) // rule 3 org → MEDIUM
          .mockResolvedValueOnce(4); // rule 13 org → HIGH
        mockPrisma.performanceReview.count = makeCount(6); // rule 9 → HIGH
        // toda a população teve actividade recente → rule 11 não dispara
        mockPrisma.enrollment.findMany = makeFind([{ userId: 1 }, { userId: 2 }, { userId: 3 }]);
        const r = await service.alerts({ scope: 'organization' });
        expect(keys(r)).toEqual([
          'PDI_ACTION_CRITICAL',
          'PERFORMANCE_CRITICAL',
          'PDI_ACTIONS_OVERDUE',
        ]);
      });
    });

    // ── scope: 'team' → regras 2, 5-8, 11-13 (managerId = userId) ──

    describe("scope 'team'", () => {
      beforeEach(() => {
        mockPrisma.user.findMany = makeFind([{ id: 10 }, { id: 11 }]);
      });

      it('userId em falta → devolve []', async () => {
        expect(await service.alerts({ scope: 'team' })).toEqual([]);
      });

      it('população da equipa = user.findMany managerId + active', async () => {
        await service.alerts({ scope: 'team', userId: 7 });
        expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { managerId: 7, active: true } }),
        );
      });

      it('#2 EVAL_360_PENDING dispara em scope team (HIGH)', async () => {
        mockPrisma.evaluationRequest.count = makeCount(2);
        const r = await service.alerts({ scope: 'team', userId: 7 });
        const a = r.find(x => x.key === 'EVAL_360_PENDING');
        expect(a).toMatchObject({ severity: 'HIGH', scope: 'team', count: 2 });
        expect(mockPrisma.evaluationRequest.count).toHaveBeenCalledWith({
          where: { evaluatorId: 7, status: 'PENDING' },
        });
      });

      it('#5 TEAM_PERFORMANCE_AT_RISK dispara só com roleCode privilegiado', async () => {
        mockPrisma.user.count = makeCount(1);
        const withRole = await service.alerts({ scope: 'team', userId: 7, roleCode: 'LIDER' });
        const a = withRole.find(x => x.key === 'TEAM_PERFORMANCE_AT_RISK');
        expect(a).toMatchObject({ severity: 'HIGH', scope: 'team', type: 'PERFORMANCE', count: 1 });
        expect(mockPrisma.user.count).toHaveBeenCalledWith({
          where: {
            managerId: 7,
            active: true,
            performanceReviews: { some: { score: { lt: 2.5 } } },
          },
        });
      });

      it('#5 TEAM_PERFORMANCE_AT_RISK NÃO dispara sem roleCode privilegiado (query nem corre)', async () => {
        mockPrisma.user.count = makeCount(5);
        const r = await service.alerts({ scope: 'team', userId: 7, roleCode: 'COLABORADOR' });
        expect(keys(r)).not.toContain('TEAM_PERFORMANCE_AT_RISK');
      });

      it('#6 MANAGER_TEAM_RISK dispara quando membro tem inscrições e 0 conclusões', async () => {
        mockPrisma.enrollment.findMany = jest
          .fn()
          .mockResolvedValueOnce([{ userId: 10, status: 'IN_PROGRESS' }]) // memberEnrollments
          .mockResolvedValueOnce([]); // recentRows
        mockPrisma.performanceReview.findMany = makeFind([]);
        const r = await service.alerts({ scope: 'team', userId: 7 });
        const a = r.find(x => x.key === 'MANAGER_TEAM_RISK');
        expect(a).toMatchObject({ severity: 'HIGH', scope: 'team', type: 'PERFORMANCE', count: 1 });
      });

      it('#6 MANAGER_TEAM_RISK NÃO dispara quando ninguém em risco', async () => {
        mockPrisma.enrollment.findMany = jest
          .fn()
          .mockResolvedValueOnce([{ userId: 10, status: 'COMPLETED' }])
          .mockResolvedValueOnce([]);
        mockPrisma.performanceReview.findMany = makeFind([
          { userId: 10, score: 4, createdAt: new Date() },
        ]);
        const r = await service.alerts({ scope: 'team', userId: 7 });
        expect(keys(r)).not.toContain('MANAGER_TEAM_RISK');
      });

      it('#7 MANDATORY_RATE_LOW dispara quando taxa < 80 (mensagem inclui a %)', async () => {
        mockPrisma.enrollment.count = jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(5);
        const r = await service.alerts({ scope: 'team', userId: 7 });
        const a = r.find(x => x.key === 'MANDATORY_RATE_LOW');
        expect(a).toMatchObject({ severity: 'MEDIUM', scope: 'team', type: 'COMPLIANCE' });
        expect(a?.message).toContain('50%');
      });

      it('#7 MANDATORY_RATE_LOW NÃO dispara quando taxa >= 80 nem quando não há obrigatórias', async () => {
        mockPrisma.enrollment.count = jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(9);
        expect(keys(await service.alerts({ scope: 'team', userId: 7 }))).not.toContain(
          'MANDATORY_RATE_LOW',
        );
        mockPrisma.enrollment.count = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0);
        expect(keys(await service.alerts({ scope: 'team', userId: 7 }))).not.toContain(
          'MANDATORY_RATE_LOW',
        );
      });

      it('#8 PDP_COVERAGE_LOW dispara quando cobertura < 50', async () => {
        mockPrisma.developmentPlan.count = jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0);
        const r = await service.alerts({ scope: 'team', userId: 7 });
        const a = r.find(x => x.key === 'PDP_COVERAGE_LOW');
        expect(a).toMatchObject({ severity: 'MEDIUM', scope: 'team', type: 'PDI' });
        expect(a?.message).toContain('0%');
      });

      it('#8 PDP_COVERAGE_LOW NÃO dispara com cobertura >= 50 nem com equipa vazia', async () => {
        mockPrisma.developmentPlan.count = jest
          .fn()
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(0);
        expect(keys(await service.alerts({ scope: 'team', userId: 7 }))).not.toContain(
          'PDP_COVERAGE_LOW',
        );
        mockPrisma.user.findMany = makeFind([]);
        expect(keys(await service.alerts({ scope: 'team', userId: 7 }))).not.toContain(
          'PDP_COVERAGE_LOW',
        );
      });

      it('#11 INACTIVE_COLLABORATORS dispara em scope team sobre os membros', async () => {
        mockPrisma.enrollment.findMany = jest
          .fn()
          .mockResolvedValueOnce([]) // memberEnrollments
          .mockResolvedValueOnce([{ userId: 10 }]); // recentRows → 11 inactivo
        const r = await service.alerts({ scope: 'team', userId: 7 });
        const a = r.find(x => x.key === 'INACTIVE_COLLABORATORS');
        expect(a).toMatchObject({ scope: 'team', count: 1 });
      });

      it('#12 PDI_PLAN_OVERDUE dispara em scope team', async () => {
        mockPrisma.developmentPlan.count = jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(2);
        const r = await service.alerts({ scope: 'team', userId: 7 });
        const a = r.find(x => x.key === 'PDI_PLAN_OVERDUE');
        expect(a).toMatchObject({ severity: 'MEDIUM', scope: 'team', count: 2 });
      });

      it('#13 PDI_ACTION_CRITICAL dispara em scope team', async () => {
        mockPrisma.developmentPlanAction.count = makeCount(3);
        const r = await service.alerts({ scope: 'team', userId: 7 });
        const a = r.find(x => x.key === 'PDI_ACTION_CRITICAL');
        expect(a).toMatchObject({ severity: 'HIGH', scope: 'team', count: 3 });
      });

      it('scope→rules: emite exactamente {2,5,6,7,8,11,12,13}', async () => {
        mockPrisma.evaluationRequest.count = makeCount(2);
        mockPrisma.user.count = makeCount(1);
        mockPrisma.enrollment.findMany = jest
          .fn()
          .mockResolvedValueOnce([{ userId: 10, status: 'IN_PROGRESS' }])
          .mockResolvedValueOnce([]);
        mockPrisma.performanceReview.findMany = makeFind([]);
        mockPrisma.enrollment.count = jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(5);
        mockPrisma.developmentPlan.count = jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(2);
        mockPrisma.developmentPlanAction.count = makeCount(3);
        const r = await service.alerts({ scope: 'team', userId: 7, roleCode: 'ADMIN' });
        expect([...keys(r)].sort()).toEqual([
          'EVAL_360_PENDING',
          'INACTIVE_COLLABORATORS',
          'MANAGER_TEAM_RISK',
          'MANDATORY_RATE_LOW',
          'PDI_ACTION_CRITICAL',
          'PDI_PLAN_OVERDUE',
          'PDP_COVERAGE_LOW',
          'TEAM_PERFORMANCE_AT_RISK',
        ]);
        r.forEach(a => expect(a.scope).toBe('team'));
      });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // managerDashboard — superconjunto dashboard ⊕ analytics (nota §5.2)
  // ════════════════════════════════════════════════════════════════

  describe('managerDashboard', () => {
    const teamRows = [
      {
        id: 10,
        fullName: 'Ana',
        avatarUrl: null,
        position: { name: 'Dev' },
        department: { name: 'Eng' },
        points: { points: 120 },
      },
      {
        id: 11,
        fullName: 'Rui',
        avatarUrl: 'u.png',
        position: null,
        department: { name: 'Eng' },
        points: null,
      },
    ];

    it('early-return sem equipa: tudo a 0/null/[]', async () => {
      mockPrisma.user.findMany = makeFind([]);
      const r = await service.managerDashboard({ userId: 7 });
      expect(r.teamSize).toBe(0);
      expect(r.team).toEqual([]);
      expect(r.competencyGaps).toEqual([]);
      expect(r.nineBox).toEqual([]);
      expect(r.alerts).toEqual([]);
      expect(r.kpis.pdpCoverage).toBe(0);
      expect(r.kpis.activePlans).toBe(0);
      expect(r.kpis.avgScore).toBeNull();
      expect(r.kpis.scoreTrend).toBeNull();
      expect(r.kpis.overdueActions).toBe(0);
    });

    it('devolve todos os campos do superconjunto', async () => {
      mockPrisma.user.findMany = makeFind(teamRows);
      const r = await service.managerDashboard({ userId: 7 });

      expect(r.teamSize).toBe(2);
      // team[] shape do dashboard + department do analytics
      const m = r.team[0];
      expect(m.user).toEqual({
        id: 10,
        fullName: 'Ana',
        avatarUrl: null,
        position: { name: 'Dev' },
        department: { name: 'Eng' },
      });
      expect(m.xp).toBe(120);
      expect(m.enrollment).toEqual({ completed: 0, inProgress: 0 });
      expect(m.plan).toBeNull();
      expect(m.lastScore).toBeNull();
      expect(m.atRisk).toBe(false);
      expect(r.team[1].xp).toBe(0); // points null → 0

      // kpis: superconjunto completo (nomes canónicos do dashboard + extras do analytics)
      const expectedKpiKeys = [
        'pdpCoverage',
        'activePlans',
        'completedPlans',
        'inProgress',
        'completedEnrollments',
        'enrollmentsTotal',
        'completions',
        'completionRate',
        'avgScore',
        'scoreTrend',
        'mandatoryRate',
        'engagementResponses',
        'avatarSessions',
        'pendingEvals',
        'overdueActions',
      ];
      expect(Object.keys(r.kpis).sort()).toEqual([...expectedKpiKeys].sort());
      expect(r.kpis.mandatoryRate).toBe(100); // sem obrigatórias → 100
      expect(Array.isArray(r.competencyGaps)).toBe(true);
      expect(Array.isArray(r.nineBox)).toBe(true);
      expect(Array.isArray(r.alerts)).toBe(true);
    });

    it('competencyGaps e nineBox vêm da lógica do analytics', async () => {
      mockPrisma.user.findMany = makeFind(teamRows);
      mockPrisma.userCompetency.findMany = makeFind([
        { userId: 10, currentLevel: 1, targetLevel: 4, competency: { name: 'SQL' } },
        { userId: 11, currentLevel: 2, targetLevel: 3, competency: { name: 'SQL' } },
        { userId: 10, currentLevel: 5, targetLevel: 3, competency: { name: 'Git' } }, // gap <= 0 ignorado
      ]);
      mockPrisma.nineBoxPlacement.findMany = makeFind([
        {
          userId: 10,
          performanceAxis: 3,
          potentialAxis: 2,
          user: { id: 10, fullName: 'Ana', avatarUrl: null },
        },
      ]);
      const r = await service.managerDashboard({ userId: 7 });
      expect(r.competencyGaps).toEqual([{ name: 'SQL', totalGap: 4, count: 2, avgGap: 2 }]);
      expect(r.nineBox).toEqual([
        {
          userId: 10,
          fullName: 'Ana',
          avatarUrl: null,
          performanceAxis: '3',
          potentialAxis: '2',
          quadrant: '3-2',
        },
      ]);
    });

    it('alerts é MetricAlert[] com scope team (delega em this.alerts)', async () => {
      mockPrisma.user.findMany = makeFind(teamRows);
      mockPrisma.developmentPlanAction.count = makeCount(3); // PDI_ACTION_CRITICAL team
      const r = await service.managerDashboard({ userId: 7 });
      expect(r.alerts.length).toBeGreaterThan(0);
      r.alerts.forEach(a => {
        expect(a.scope).toBe('team');
        expect(a).toHaveProperty('key');
        expect(a).toHaveProperty('severity');
      });
    });

    it('KPIs: completedEnrollments (janela) e completions (bruto) são distintos', async () => {
      mockPrisma.user.findMany = makeFind(teamRows);
      // ordem do Promise.all: 0 activePlans 1 completedPlans 2 inProgress
      // 3 completedEnrollments 4 enrollmentsTotal 5 completions 6 mandatoryTotal 7 mandatoryComplete
      mockPrisma.enrollment.count = jest
        .fn()
        .mockResolvedValueOnce(2) // inProgress
        .mockResolvedValueOnce(3) // completedEnrollments (janela)
        .mockResolvedValueOnce(20) // enrollmentsTotal
        .mockResolvedValueOnce(8) // completions (bruto)
        .mockResolvedValueOnce(0) // mandatoryTotal
        .mockResolvedValueOnce(0); // mandatoryComplete
      const r = await service.managerDashboard({ userId: 7 });
      expect(r.kpis.completedEnrollments).toBe(3);
      expect(r.kpis.enrollmentsTotal).toBe(20);
      expect(r.kpis.completions).toBe(8);
      expect(r.kpis.completionRate).toBe(40); // 8 / 20 * 100
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// alert-rules — no-fire guards (regras 12/13, funções puras)
// ════════════════════════════════════════════════════════════════════

describe('alert-rules no-fire guards', () => {
  it('#12 evaluateRule_PDI_PLAN_OVERDUE(0) → null (ambos os scopes)', () => {
    expect(evaluateRule_PDI_PLAN_OVERDUE(0, 'team')).toBeNull();
    expect(evaluateRule_PDI_PLAN_OVERDUE(0, 'organization')).toBeNull();
  });

  it('#13 evaluateRule_PDI_ACTION_CRITICAL(0) → null (ambos os scopes)', () => {
    expect(evaluateRule_PDI_ACTION_CRITICAL(0, 'team')).toBeNull();
    expect(evaluateRule_PDI_ACTION_CRITICAL(0, 'organization')).toBeNull();
  });
});
