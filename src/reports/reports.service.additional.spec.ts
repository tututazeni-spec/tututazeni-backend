import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  user: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  department: { findMany: jest.fn().mockResolvedValue([]) },
  userCompetency: {
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { currentLevel: null } }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  enrollment: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { progressPercent: 0 } }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  position: { findMany: jest.fn().mockResolvedValue([]) },
  certificate: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  course: { findMany: jest.fn().mockResolvedValue([]) },
  legacyEmployeeSkill: { findMany: jest.fn().mockResolvedValue([]) },
  performanceReview: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
  },
  attendanceRecord: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { hoursWorked: 8 } }),
  },
  savedReport: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  reportSchedule: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const baseFilter = { from: '2026-01-01', to: '2026-12-31' };

describe('ReportsService (additional)', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
  });

  // ─── headcountReport ──────────────────────────────────────────

  describe('headcountReport', () => {
    it('deve gerar relatório de headcount', async () => {
      mockPrisma.user.count.mockResolvedValue(600);
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI', _count: { users: 50 } },
      ]);
      const result = await service.headcountReport(baseFilter);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('summary.total');
    });

    it('deve filtrar por departamento', async () => {
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.department.findMany.mockResolvedValue([]);
      const result = await service.headcountReport({ ...baseFilter, departmentId: 1 });
      expect(result).toBeDefined();
    });
  });

  // ─── trainingReportFull ───────────────────────────────────────

  describe('trainingReportFull', () => {
    it('deve gerar relatório de formação', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(500);
      mockPrisma.certificate.count.mockResolvedValue(200);
      const result = await service.trainingReportFull(baseFilter);
      expect(result).toBeDefined();
    });
  });

  // ─── competencyGapReport ──────────────────────────────────────

  describe('competencyGapReport', () => {
    it('deve gerar relatório de competências', async () => {
      mockPrisma.legacyEmployeeSkill.findMany.mockResolvedValue([]);
      const result = await service.competencyGapReport();
      expect(result).toBeDefined();
    });
  });

  // ─── performanceReportFull ────────────────────────────────────

  describe('performanceReportFull', () => {
    it('deve gerar relatório de performance', async () => {
      mockPrisma.performanceReview.count.mockResolvedValue(150);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 4.2 } });
      const result = await service.performanceReportFull(baseFilter);
      expect(result).toBeDefined();
    });
  });

  // ─── attendanceReport ─────────────────────────────────────────

  describe('attendanceReport', () => {
    it('deve gerar relatório de presenças', async () => {
      mockPrisma.attendanceRecord.count.mockResolvedValue(1200);
      mockPrisma.attendanceRecord.aggregate.mockResolvedValue({ _avg: { hoursWorked: 7.8 } });
      const result = await service.attendanceReport(baseFilter.from, baseFilter.to);
      expect(result).toBeDefined();
    });
  });

  // ─── saveReport ───────────────────────────────────────────────

  describe('saveReport', () => {
    it('deve guardar relatório', async () => {
      mockPrisma.savedReport.create.mockResolvedValue({ id: 1, name: 'Headcount Q1' });
      const result = await service.saveReport(1, {
        name: 'Headcount Q1',
        category: 'HR' as any,
        data: {},
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── listSavedReports ─────────────────────────────────────────

  describe('listSavedReports', () => {
    it('deve retornar relatórios guardados', async () => {
      mockPrisma.savedReport.findMany.mockResolvedValue([{ id: 1, name: 'Headcount Q1' }]);
      const result = await service.listSavedReports(1);
      expect(result).toBeDefined();
    });
  });

  // ─── createSchedule ───────────────────────────────────────────

  describe('createSchedule', () => {
    it('deve criar agendamento de relatório', async () => {
      mockPrisma.reportSchedule.create.mockResolvedValue({ id: 1 });
      const result = await service.createSchedule(1, {
        frequency: 'MONTHLY' as any,
        recipients: ['rh@innova.com'],
      } as any);
      expect(result).toBeDefined();
    });
  });
});
