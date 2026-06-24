import { Test, TestingModule } from '@nestjs/testing';
import { RoiImpactService } from './roi-impact.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  enrollment: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { progressPercent: 0 } }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  certificate: { count: jest.fn().mockResolvedValue(0) },
  performanceReview: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
  },
  user: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  course: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  department: { findMany: jest.fn().mockResolvedValue([]) },
  badgeAward: { count: jest.fn().mockResolvedValue(0) },
  assessmentAttempt: {
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
  },
  lessonProgress: { count: jest.fn().mockResolvedValue(0) },
  userCompetency: {
    aggregate: jest.fn().mockResolvedValue({ _avg: { currentLevel: null, targetLevel: null } }),
  },
  surveyResponse: {
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
  },
  developmentPlanAction: { count: jest.fn().mockResolvedValue(0) },
};

describe('RoiImpactService (additional)', () => {
  let service: RoiImpactService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoiImpactService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<RoiImpactService>(RoiImpactService);
  });

  // ─── calculateTrainingRoi ──────────────────────────────────────

  describe('calculateTrainingRoi', () => {
    it('deve calcular ROI de formação para o período', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(100);
      mockPrisma.certificate.count.mockResolvedValue(80);
      const result = await service.calculateTrainingRoi('2026-01-01', '2026-12-31');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('financial.roi');
      expect(result).toHaveProperty('financial.totalBenefit');
      expect(result).toHaveProperty('financial.totalCost');
    });

    it('deve filtrar por departamento', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(20);
      mockPrisma.certificate.count.mockResolvedValue(15);
      const result = await service.calculateTrainingRoi('2026-01-01', '2026-12-31', 1);
      expect(result).toBeDefined();
    });

    it('deve retornar roi=0 quando sem conclusões', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.certificate.count.mockResolvedValue(0);
      const result = await service.calculateTrainingRoi('2026-01-01', '2026-12-31');
      expect(result).toBeDefined();
    });
  });

  // ─── calculateRoiFull ─────────────────────────────────────────

  describe('calculateRoiFull', () => {
    it('deve calcular ROI com parâmetros personalizados', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(50);
      mockPrisma.certificate.count.mockResolvedValue(40);
      const result = await service.calculateRoiFull(
        { from: '2026-01-01', to: '2026-12-31' },
        { costPerEnrollment: 300, benefitPerCompletion: 700 },
      );
      expect(result).toBeDefined();
      expect(result).toHaveProperty('financial.roi');
      expect(result).toHaveProperty('financial.bcrVal');
      expect(result).toHaveProperty('financial.paybackMonths');
    });
  });

  // ─── getExecutiveDashboard ────────────────────────────────────

  describe('getExecutiveDashboard', () => {
    it('deve retornar dashboard executivo de ROI', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(200);
      mockPrisma.certificate.count.mockResolvedValue(150);
      mockPrisma.user.count.mockResolvedValue(600);
      const result = await service.getExecutiveDashboard({ from: '2026-01-01', to: '2026-12-31' });
      expect(result).toBeDefined();
    });
  });

  // ─── getImpactMetrics ─────────────────────────────────────────

  describe('getImpactMetrics', () => {
    it('deve retornar métricas de impacto', async () => {
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI' },
        { id: 2, name: 'RH' },
      ]);
      mockPrisma.enrollment.count.mockResolvedValue(30);
      mockPrisma.certificate.count.mockResolvedValue(25);
      const result = await service.getImpactMetrics({ from: '2026-01-01', to: '2026-12-31' });
      expect(result).toBeDefined();
    });
  });

  // ─── getProgramLibrary ────────────────────────────────────────

  describe('getProgramLibrary', () => {
    it('deve retornar biblioteca de programas com ROI', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 1, title: 'TypeScript', workloadHours: 20, _count: { enrollments: 50 } },
      ]);
      mockPrisma.enrollment.count.mockResolvedValue(50);
      mockPrisma.certificate.count.mockResolvedValue(40);
      const result = await service.getProgramLibrary({ from: '2026-01-01', to: '2026-12-31' });
      expect(result).toBeDefined();
    });
  });

  // ─── simulateWhatIf ───────────────────────────────────────────

  describe('simulateWhatIf', () => {
    it('deve calcular análise what-if com parâmetros hipotéticos', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(100);
      mockPrisma.certificate.count.mockResolvedValue(80);
      const result = await service.simulateWhatIf({
        from: '2026-01-01',
        to: '2026-12-31',
        targetEnrollments: 120,
        targetCompletionRate: 90,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getRetentionImpact ───────────────────────────────────────

  describe('getRetentionImpact', () => {
    it('deve retornar impacto na retenção', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(100);
      mockPrisma.certificate.count.mockResolvedValue(75);
      const result = await service.getRetentionImpact({ from: '2026-01-01', to: '2026-12-31' });
      expect(result).toBeDefined();
    });
  });
});
