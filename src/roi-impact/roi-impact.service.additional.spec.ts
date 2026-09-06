import { Test, TestingModule } from '@nestjs/testing';
import { RoiImpactService } from './roi-impact.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';

// ─── MetricsAggregationService mock (Fase H — Task 8) ─────────────────────
// calculateRoiFull tira o NÚCLEO financeiro de metrics.trainingRoi; os overlays
// (retenção / performance-lift / competência / narrativa) continuam locais.
const DEFAULT_TRAINING_ROI = {
  enrollments: 0,
  completed: 0,
  completionRate: 0,
  costPerEnrollment: 200,
  benefitPerCompletion: 500,
  totalCost: 0,
  grossBenefit: 0,
  netBenefit: 0,
  roiPct: 0,
  bcr: 0,
  paybackMonths: 0,
  trainingHours: 0,
  confidence: 'LOW' as const,
  methodology: 'test-methodology',
  period: { from: new Date('2026-01-01'), to: new Date('2026-12-31') },
};
const mockMetrics = {
  headcount: jest.fn(),
  turnover: jest.fn(),
  trainingRoi: jest.fn(),
  alerts: jest.fn(),
};

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
    mockMetrics.trainingRoi.mockResolvedValue({ ...DEFAULT_TRAINING_ROI });
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoiImpactService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MetricsAggregationService, useValue: mockMetrics },
      ],
    }).compile();
    service = module.get<RoiImpactService>(RoiImpactService);
  });

  // ─── calculateTrainingRoi ──────────────────────────────────────

  describe('calculateTrainingRoi', () => {
    it('delega o núcleo financeiro a metrics.trainingRoi', async () => {
      mockMetrics.trainingRoi.mockResolvedValue({
        ...DEFAULT_TRAINING_ROI,
        enrollments: 100,
        completed: 80,
        completionRate: 80,
        totalCost: 20000,
        grossBenefit: 40000,
        netBenefit: 20000,
        roiPct: 100,
        bcr: 2,
        paybackMonths: 6,
      });
      const result = await service.calculateTrainingRoi('2026-01-01', '2026-12-31');
      expect(mockMetrics.trainingRoi).toHaveBeenCalledWith(
        expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
      );
      expect(result.volume.enrollments).toBe(100);
      expect(result.volume.completed).toBe(80);
      expect(result.financial.totalCost).toBe(20000);
      expect(result.financial.totalBenefit).toBe(40000);
      expect(result.financial.roi).toBe(100);
      expect(result.financial.bcrVal).toBe(2);
      expect(result.financial.paybackMonths).toBe(6);
    });

    it('passa departmentId a metrics.trainingRoi', async () => {
      const result = await service.calculateTrainingRoi('2026-01-01', '2026-12-31', 1);
      expect(mockMetrics.trainingRoi).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: 1 }),
      );
      expect(result).toBeDefined();
    });

    it('deve retornar roi=0 quando sem conclusões', async () => {
      const result = await service.calculateTrainingRoi('2026-01-01', '2026-12-31');
      expect(result.financial.roi).toBe(0);
    });
  });

  // ─── calculateRoiFull ─────────────────────────────────────────

  describe('calculateRoiFull', () => {
    it('núcleo financeiro vem do canónico; params passam através', async () => {
      mockMetrics.trainingRoi.mockResolvedValue({
        ...DEFAULT_TRAINING_ROI,
        enrollments: 50,
        completed: 40,
        completionRate: 80,
        costPerEnrollment: 300,
        benefitPerCompletion: 700,
        totalCost: 15000,
        grossBenefit: 28000,
        netBenefit: 13000,
        roiPct: 86.7,
        bcr: 1.87,
        paybackMonths: 6.4,
        trainingHours: 320,
        confidence: 'MEDIUM',
      });
      const result = await service.calculateRoiFull(
        { from: '2026-01-01', to: '2026-12-31', courseId: 9 },
        { costPerEnrollment: 300, benefitPerCompletion: 700 },
      );
      expect(mockMetrics.trainingRoi).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 9,
          costPerEnrollment: 300,
          benefitPerCompletion: 700,
        }),
      );
      expect(result.financial.roi).toBe(86.7);
      expect(result.financial.bcrVal).toBe(1.87);
      expect(result.financial.paybackMonths).toBe(6.4);
      expect(result.financial.netBenefit).toBe(13000);
      expect(result.volume.totalHours).toBe(320); // r.trainingHours
      expect(result.confidence).toBe('MEDIUM'); // r.confidence
      expect(result.assumptions.costPerEnrollment).toBe(300);
      expect(result.assumptions.benefitPerCompletion).toBe(700);
      // overlays locais preservados
      expect(result).toHaveProperty('impact.perfLift');
      expect(result).toHaveProperty('financial.retentionBenefit');
      expect(result.financial.roiLabel).toBe('POSITIVE'); // recomputado de r.roiPct (>=0)
    });

    it('degrada para shape all-zero (+ logger.warn) quando metrics.trainingRoi falha', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      mockMetrics.trainingRoi.mockRejectedValue(new Error('replica down'));
      const result = await service.calculateRoiFull({ from: '2026-01-01', to: '2026-12-31' }, {});
      expect(result.volume.enrollments).toBe(0);
      expect(result.volume.completed).toBe(0);
      expect(result.financial.totalCost).toBe(0);
      expect(result.financial.roi).toBe(0);
      expect(result.confidence).toBe('LOW');
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROI_IMPACT_TRAINING_ROI' }),
      );
      warn.mockRestore();
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
