import { Test, TestingModule } from '@nestjs/testing';
import { RoiImpactService } from './roi-impact.service';
import { PrismaService } from '../prisma/prisma.service';

const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);
const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeAgg = () => jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: {} });

const mockPrisma = {
  user: { count: makeCount(100), findMany: makeFind() },
  enrollment: { count: makeCount(50), findMany: makeFind(), aggregate: makeAgg() },
  certificate: { count: makeCount(10) },
  performanceReview: { count: makeCount(), aggregate: makeAgg(), findMany: makeFind() },
  developmentPlan: { count: makeCount(), findMany: makeFind() },
  course: { count: makeCount(), findMany: makeFind(), aggregate: makeAgg(), groupBy: jest.fn().mockResolvedValue([]) },
  trainingImpact: { findMany: makeFind(), create: jest.fn().mockResolvedValue({}) },
  userCompetency: { findMany: makeFind(), count: makeCount(), aggregate: makeAgg() },
  surveyResponse: { count: makeCount(), aggregate: makeAgg(), groupBy: jest.fn().mockResolvedValue([]) },
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoiImpactService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<RoiImpactService>(RoiImpactService);
  });

  describe('calculateTrainingRoi', () => {
    it('deve calcular ROI de formação', async () => {
      const result = await service.calculateTrainingRoi('2024-01-01', '2024-12-31');
      expect(result).toBeDefined();
    });
  });

  describe('getImpactMetrics', () => {
    it('deve retornar métricas de impacto', async () => {
      const result = await service.getImpactMetrics({});
      expect(result).toBeDefined();
    });
  });
});
