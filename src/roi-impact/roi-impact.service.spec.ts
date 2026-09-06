import { Test, TestingModule } from '@nestjs/testing';
import { RoiImpactService } from './roi-impact.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsAggregationService } from '../metrics-aggregation/metrics-aggregation.service';

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

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeAgg = () => jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} });

const mockPrisma = {
  user: { count: makeCount(100), findMany: makeFind() },
  enrollment: { count: makeCount(50), findMany: makeFind(), aggregate: makeAgg() },
  certificate: { count: makeCount(10) },
  performanceReview: { count: makeCount(), aggregate: makeAgg(), findMany: makeFind() },
  developmentPlan: { count: makeCount(), findMany: makeFind() },
  course: {
    count: makeCount(),
    findMany: makeFind(),
    aggregate: makeAgg(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  trainingImpact: { findMany: makeFind(), create: jest.fn().mockResolvedValue({}) },
  userCompetency: { findMany: makeFind(), count: makeCount(), aggregate: makeAgg() },
  surveyResponse: {
    count: makeCount(),
    aggregate: makeAgg(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  developmentPlanAction: { count: makeCount(), findMany: makeFind() },
  assessmentAttempt: { count: makeCount(), aggregate: makeAgg(), findMany: makeFind() },
  lessonProgress: { count: makeCount() },
  leaveRequest: { count: makeCount() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('RoiImpactService', () => {
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

  describe('calculateTrainingRoi', () => {
    it('delega a metrics.trainingRoi e devolve a forma completa', async () => {
      mockMetrics.trainingRoi.mockResolvedValue({
        ...DEFAULT_TRAINING_ROI,
        enrollments: 10,
        completed: 6,
        roiPct: 50,
        totalCost: 2000,
        grossBenefit: 3000,
      });
      const result = await service.calculateTrainingRoi('2024-01-01', '2024-12-31');
      expect(mockMetrics.trainingRoi).toHaveBeenCalled();
      expect(result.financial.roi).toBe(50);
      expect(result.volume.completed).toBe(6);
    });
  });

  describe('getImpactMetrics', () => {
    it('deve retornar métricas de impacto', async () => {
      const result = await service.getImpactMetrics({});
      expect(result).toBeDefined();
    });
  });
});
