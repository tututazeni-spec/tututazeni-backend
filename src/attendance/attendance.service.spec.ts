import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CacheService } from '../cache/cache.service';
import { LeaveManagementService } from '../leave-management/leave-management.service';
import { AttendanceStatus, AttendanceContext } from './attendance.dto';

const mockAttendanceRecord = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue(0),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
};

const mockPrisma = {
  attendanceRecord: mockAttendanceRecord,
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  workSchedule: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Horário Normal' }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  attendanceJustification: {
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  attendanceAdjustment: { create: jest.fn().mockResolvedValue({}) },
  leaveRequest: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userSchedule: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
  overtimeRecord: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  allowedLocation: { findMany: jest.fn().mockResolvedValue([]) },
};

// attendanceRecord acedido directamente via this.prisma.attendanceRecord
const mockPrismaProxy = new Proxy(mockPrisma, {
  get(target, prop) {
    if (prop === 'attendanceRecord') return mockAttendanceRecord;
    return (target as any)[prop];
  },
});

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const mockLeaveManagement = {
  create: jest.fn(),
  processApproval: jest.fn(),
  getBalance: jest.fn(),
  getLeaveTypes: jest.fn(),
};

function buildMockCache() {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn((key: string) => Promise.resolve(store.has(key) ? store.get(key) : null)),
    set: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
}

const baseRecord = {
  id: 1,
  userId: 1,
  date: new Date(),
  status: AttendanceStatus.PRESENT,
  context: AttendanceContext.WORK,
  clockIn: '08:00',
  clockOut: null,
  workMinutes: 0,
  user: { id: 1, fullName: 'Test User', email: 'test@innova.com' },
  justifications: [],
  adjustments: [],
};

describe('AttendanceService', () => {
  let service: AttendanceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrismaProxy, 'read', {
      get() {
        return mockPrismaProxy;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrismaProxy },
        { provide: AuditService, useValue: mockAudit },
        { provide: CacheService, useValue: buildMockCache() },
        { provide: LeaveManagementService, useValue: mockLeaveManagement },
      ],
    }).compile();
    service = module.get<AttendanceService>(AttendanceService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de registos', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([baseRecord]);
      mockAttendanceRecord.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('deve filtrar por userId e status', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([]);
      mockAttendanceRecord.count.mockResolvedValue(0);

      await service.findAll({ userId: 1, status: AttendanceStatus.PRESENT });

      expect(mockAttendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 1, status: AttendanceStatus.PRESENT }),
        }),
      );
    });

    it('deve filtrar por intervalo de datas', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([]);
      mockAttendanceRecord.count.mockResolvedValue(0);

      await service.findAll({ from: '2024-01-01', to: '2024-01-31' });

      expect(mockAttendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ date: expect.any(Object) }),
        }),
      );
    });
  });

  // ─── findByUser ───────────────────────────────────────────────────────────

  describe('findByUser', () => {
    it('deve retornar registos do utilizador com sumário', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([
        { ...baseRecord, workMinutes: 480 },
        { ...baseRecord, id: 2, status: AttendanceStatus.ABSENT, workMinutes: 0 },
        { ...baseRecord, id: 3, status: AttendanceStatus.LATE, workMinutes: 450 },
      ]);

      const result = await service.findByUser(1);

      expect(result.records).toHaveLength(3);
      expect(result.summary.presentDays).toBe(2);
      expect(result.summary.absentDays).toBe(1);
      expect(result.summary.lateDays).toBe(1);
      expect(result.summary.totalHours).toBeGreaterThan(0);
    });

    it('deve retornar taxa 0 se sem registos', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([]);

      const result = await service.findByUser(1);

      expect(result.summary.attendanceRate).toBe(0);
      expect(result.summary.totalDays).toBe(0);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar registo por id', async () => {
      mockAttendanceRecord.findUnique.mockResolvedValue(baseRecord);

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockAttendanceRecord.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── clockIn ──────────────────────────────────────────────────────────────

  describe('clockIn', () => {
    it('deve registar clock-in com sucesso', async () => {
      mockAttendanceRecord.findFirst.mockResolvedValue(null);
      mockPrisma.userSchedule.findUnique.mockResolvedValue(null);
      mockAttendanceRecord.create.mockResolvedValue({ ...baseRecord, clockIn: '08:05' });

      const result = await service.clockIn(1, { context: AttendanceContext.WORK });

      expect((result as any).clockIn).toBe('08:05');
    });

    it('deve lançar ConflictException se já fez clock-in hoje', async () => {
      mockAttendanceRecord.findFirst.mockResolvedValue({ ...baseRecord, clockIn: '08:00' });

      await expect(service.clockIn(1, { context: AttendanceContext.WORK })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── clockOut ─────────────────────────────────────────────────────────────

  describe('clockOut', () => {
    it('deve registar clock-out e calcular horas', async () => {
      mockAttendanceRecord.findFirst.mockResolvedValue({
        ...baseRecord,
        clockIn: '08:00',
        clockOut: null,
      });
      mockAttendanceRecord.update.mockResolvedValue({
        ...baseRecord,
        clockOut: '17:00',
        workMinutes: 540,
      });

      const result = await service.clockOut(1, {});

      expect((result as any).clockOut).toBe('17:00');
    });

    it('deve lançar NotFoundException se sem clock-in hoje', async () => {
      mockAttendanceRecord.findFirst.mockResolvedValue(null);

      await expect(service.clockOut(1, {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar registo manual', async () => {
      mockAttendanceRecord.create.mockResolvedValue(baseRecord);

      const result = await service.create({
        userId: 1,
        date: new Date().toISOString(),
        status: AttendanceStatus.PRESENT,
        context: AttendanceContext.WORK,
      } as any);

      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar registo e criar log de ajuste', async () => {
      mockAttendanceRecord.findUnique.mockResolvedValue(baseRecord);
      mockAttendanceRecord.update.mockResolvedValue({ ...baseRecord, clockIn: '09:00' });

      const result = await service.update(1, { clockIn: '09:00' } as any, 2);

      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockAttendanceRecord.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deve remover registo', async () => {
      mockAttendanceRecord.findUnique.mockResolvedValue(baseRecord);
      mockAttendanceRecord.delete = jest.fn().mockResolvedValue({});

      const result = await service.remove(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockAttendanceRecord.findUnique.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createLeaveRequest ───────────────────────────────────────────────────

  describe('createLeaveRequest', () => {
    it('deve delegar em LeaveManagementService.create com o código traduzido', async () => {
      mockLeaveManagement.create.mockResolvedValue({ id: 1, userId: 1, status: 'PENDING' });

      const result = await service.createLeaveRequest(1, {
        type: 'VACATION' as any,
        startDate: '2024-08-01',
        endDate: '2024-08-05',
        reason: 'Férias',
      } as any);

      expect(mockLeaveManagement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          leaveTypeCode: 'VACATION',
          startDate: '2024-08-01',
          endDate: '2024-08-05',
          reason: 'Férias',
          durationMode: 'FULL_DAY',
        }),
        1,
      );
      expect(result).toBeDefined();
    });

    it('traduz SICK_LEAVE (Prisma) para o código SICK (LeaveTypeConfig)', async () => {
      mockLeaveManagement.create.mockResolvedValue({ id: 2, userId: 1, status: 'PENDING' });

      await service.createLeaveRequest(1, {
        type: 'SICK_LEAVE' as any,
        startDate: '2024-08-01',
        endDate: '2024-08-02',
        reason: 'Doença',
      } as any);

      expect(mockLeaveManagement.create).toHaveBeenCalledWith(
        expect.objectContaining({ leaveTypeCode: 'SICK' }),
        1,
      );
    });

    it('meio-dia → durationMode HALF_AM/HALF_PM conforme halfDayPeriod', async () => {
      mockLeaveManagement.create.mockResolvedValue({ id: 3, userId: 1, status: 'PENDING' });

      await service.createLeaveRequest(1, {
        type: 'VACATION' as any,
        startDate: '2024-08-01',
        endDate: '2024-08-01',
        reason: 'Manhã livre',
        halfDay: true,
        halfDayPeriod: 'PM' as any,
      } as any);

      expect(mockLeaveManagement.create).toHaveBeenCalledWith(
        expect.objectContaining({ durationMode: 'HALF_PM' }),
        1,
      );
    });
  });

  // ─── getLeaves ────────────────────────────────────────────────────────────

  describe('getLeaves', () => {
    it('deve retornar lista de licenças', async () => {
      mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
      mockPrisma.leaveRequest.count.mockResolvedValue(0);
      const result = await service.getLeaves({});
      expect(result).toBeDefined();
    });
  });

  // ─── getLeaveBalance ──────────────────────────────────────────────────────

  describe('getLeaveBalance', () => {
    it('deve retornar saldo de licenças', async () => {
      mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
      const result = await service.getLeaveBalance(1);
      expect(result).toBeDefined();
    });
  });

  // ─── createWorkSchedule ───────────────────────────────────────────────────

  describe('createWorkSchedule', () => {
    it('deve criar horário de trabalho', async () => {
      mockPrisma.workSchedule.create.mockResolvedValue({ id: 1, name: 'Horário Normal' });
      const result = await service.createWorkSchedule({
        name: 'Horário Normal',
        startTime: '09:00',
        endTime: '18:00',
        daysOfWeek: [1, 2, 3, 4, 5],
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getWorkSchedules ─────────────────────────────────────────────────────

  describe('getWorkSchedules', () => {
    it('deve retornar lista de horários', async () => {
      const result = await service.getWorkSchedules();
      expect(result).toBeDefined();
    });
  });

  // ─── getDashboard ─────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar dashboard de presenças', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.leaveRequest.count.mockResolvedValue(0);
      mockPrisma.attendanceJustification.count.mockResolvedValue(0);
      mockPrisma.overtimeRecord.count.mockResolvedValue(0);
      const result = await service.getDashboard();
      expect(result).toBeDefined();
    });
  });

  // ─── getMonthlyReport ─────────────────────────────────────────────────────

  describe('getMonthlyReport', () => {
    it('deve retornar relatório mensal', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([]);
      const result = await service.getMonthlyReport(2024, 7);
      expect(result).toBeDefined();
    });
  });

  // ─── getKpiTrend ──────────────────────────────────────────────────────────

  describe('getKpiTrend', () => {
    it('deve retornar tendência de KPIs', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([]);
      const result = await service.getKpiTrend(undefined, 30);
      expect(result).toBeDefined();
    });
  });

  // ─── getAbsenteeismReport ─────────────────────────────────────────────────

  describe('getAbsenteeismReport', () => {
    it('deve retornar relatório de absentismo', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([]);
      mockAttendanceRecord.count.mockResolvedValue(0);
      const result = await service.getAbsenteeismReport('2024-01-01', '2024-12-31');
      expect(result).toBeDefined();
    });
  });

  // ─── getEventAttendance ───────────────────────────────────────────────────

  describe('getEventAttendance', () => {
    it('deve retornar presenças de evento', async () => {
      mockAttendanceRecord.findMany.mockResolvedValue([]);
      const result = await service.getEventAttendance(1);
      expect(result).toBeDefined();
    });
  });
});
