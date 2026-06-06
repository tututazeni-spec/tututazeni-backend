import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRhService } from './dashboard-rh.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  user: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  department: { findMany: jest.fn().mockResolvedValue([]) },
  enrollment: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { progressPercent: 0 } }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  certificate: { count: jest.fn().mockResolvedValue(0) },
  course: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  notificationLog: { count: jest.fn().mockResolvedValue(0) },
  auditLog: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  performanceReview: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }) },
  attendanceRecord: {
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { hoursWorked: 0 } }),
  },
  notificationChannel: { findMany: jest.fn().mockResolvedValue([]) },
};

describe('DashboardRhService (additional)', () => {
  let service: DashboardRhService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardRhService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<DashboardRhService>(DashboardRhService);
  });

  // ─── getFullRhDashboard ───────────────────────────────────────

  describe('getFullRhDashboard', () => {
    it('deve retornar dashboard completo de RH', async () => {
      mockPrisma.user.count.mockResolvedValue(600);
      mockPrisma.department.findMany.mockResolvedValue([{ id: 1, name: 'TI', _count: { users: 50 } }]);
      mockPrisma.enrollment.count.mockResolvedValue(300);
      mockPrisma.certificate.count.mockResolvedValue(150);
      const result = await service.getFullRhDashboard();
      expect(result).toBeDefined();
    });

    it('deve funcionar com valores zero', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.department.findMany.mockResolvedValue([]);
      const result = await service.getFullRhDashboard();
      expect(result).toBeDefined();
    });
  });

  // ─── getPeopleKpis ────────────────────────────────────────────

  describe('getPeopleKpis', () => {
    it('deve retornar KPIs de pessoas', async () => {
      mockPrisma.user.count.mockResolvedValue(600);
      const result = await service.getPeopleKpis();
      expect(result).toBeDefined();
    });
  });

  // ─── getLmsKpis ───────────────────────────────────────────────

  describe('getLmsKpis', () => {
    it('deve retornar KPIs de formação', async () => {
      mockPrisma.enrollment.count.mockResolvedValue(500);
      mockPrisma.certificate.count.mockResolvedValue(200);
      const result = await service.getLmsKpis();
      expect(result).toBeDefined();
    });
  });

  // ─── getAttendanceKpis ────────────────────────────────────────

  describe('getAttendanceKpis', () => {
    it('deve retornar KPIs de presenças', async () => {
      mockPrisma.attendanceRecord.count.mockResolvedValue(1200);
      const result = await service.getAttendanceKpis();
      expect(result).toBeDefined();
    });
  });

  // ─── getTopCourses ────────────────────────────────────────────

  describe('getTopCourses', () => {
    it('deve retornar top cursos por inscrições', async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 1, title: 'TypeScript', _count: { enrollments: 150 } },
      ]);
      const result = await service.getTopCourses(5);
      expect(result).toBeDefined();
    });
  });

  // ─── getRecentActivity ────────────────────────────────────────

  describe('getRecentActivity', () => {
    it('deve retornar actividades recentes', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      const result = await service.getRecentActivity(10);
      expect(result).toBeDefined();
    });
  });
});
