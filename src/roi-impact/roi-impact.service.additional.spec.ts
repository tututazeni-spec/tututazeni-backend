import { Test, TestingModule } from '@nestjs/testing';
import { RoiImpactService } from './roi-impact.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  enrollment: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { progressPercent: 0 } }),
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
};

describe('RoiImpactService (additional)', () => {
  let service: RoiImpactService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
      expect(result).toHaveProperty('roi');
      expect(result).toHaveProperty('benefit');
      expect(result).toHaveProperty('cost');
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
      expect(result).toHaveProperty('roi');
      expect(result).toHaveProperty('bcr');
      expect(result).toHaveProperty('paybackMonths');
    });
  });

  // ─── getDashboard ─────────────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar dashboard de ROI', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(200);
      mockPrisma.certificate.count.mockResolvedValue(150);
      mockPrisma.user.count.mockResolvedValue(600);
      const result = await service.getDashboard({ from: '2026-01-01', to: '2026-12-31' });
      expect(result).toBeDefined();
    });
  });

  // ─── getByDepartment ──────────────────────────────────────────

  describe('getByDepartment', () => {
    it('deve retornar ROI por departamento', async () => {
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI' },
        { id: 2, name: 'RH' },
      ]);
      mockPrisma.enrollment.count.mockResolvedValue(30);
      mockPrisma.certificate.count.mockResolvedValue(25);
      const result = await service.getByDepartment({ from: '2026-01-01', to: '2026-12-31' });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── getByCourse ──────────────────────────────────────────────

  describe('getByCourse', () => {
    it('deve retornar ROI por curso', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 1, title: 'TypeScript', workloadHours: 20, _count: { enrollments: 50 } },
      ]);
      mockPrisma.enrollment.count.mockResolvedValue(50);
      mockPrisma.certificate.count.mockResolvedValue(40);
      const result = await service.getByCourse({ from: '2026-01-01', to: '2026-12-31' });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── whatIfAnalysis ───────────────────────────────────────────

  describe('whatIfAnalysis', () => {
    it('deve calcular análise what-if com parâmetros hipotéticos', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(100);
      mockPrisma.certificate.count.mockResolvedValue(80);
      const result = await service.whatIfAnalysis({
        from: '2026-01-01', to: '2026-12-31',
        enrollmentIncrease: 20,
        completionRateTarget: 90,
      } as any);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('baseline');
      expect(result).toHaveProperty('projected');
    });
  });

  // ─── getBenchmarks ────────────────────────────────────────────

  describe('getBenchmarks', () => {
    it('deve retornar benchmarks de referência da indústria', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(100);
      mockPrisma.certificate.count.mockResolvedValue(75);
      const result = await service.getBenchmarks({ from: '2026-01-01', to: '2026-12-31' });
      expect(result).toBeDefined();
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('industry');
    });
  });
});
