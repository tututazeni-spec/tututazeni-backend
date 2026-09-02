import { Test } from '@nestjs/testing';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollEngineService } from './payroll-engine.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = () => {
  const m: any = {
    read: {
      leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
      leaveTypeConfig: { findMany: jest.fn().mockResolvedValue([]) },
      userAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      overtimeRecord: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      employeeCompensation: { findFirst: jest.fn().mockResolvedValue(null) },
      payslip: { findFirst: jest.fn().mockResolvedValue(null) },
    },
  };
  return m;
};

describe('PayrollCalculationService.gatherInputs', () => {
  let svc: PayrollCalculationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = prismaMock();
    const mod = await Test.createTestingModule({
      providers: [
        PayrollCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayrollEngineService, useValue: { calculate: jest.fn() } },
      ],
    }).compile();
    svc = mod.get(PayrollCalculationService);
  });

  it('counts Mon-Fri working days for the period', () => {
    expect(svc.workingDaysInMonth('2026-09')).toBe(22); // Sep 2026: 22 weekdays
    expect(svc.workingDaysInMonth('not-a-date')).toBe(22);
  });

  it('sums approved unpaid-leave workDays overlapping the month', async () => {
    prisma.read.leaveTypeConfig.findMany.mockResolvedValue([{ code: 'UNPAID' }]);
    prisma.read.leaveRequest.findMany.mockResolvedValue([
      {
        leaveTypeCode: 'UNPAID',
        startDate: new Date('2026-09-10'),
        endDate: new Date('2026-09-14'),
        workDays: 3,
      },
    ]);
    const r = await svc.gatherInputs(1, '2026-09');
    expect(r.absenceDays).toBe(3);
  });

  it('adds ABSENT attendance days without double-counting leave days', async () => {
    prisma.read.leaveTypeConfig.findMany.mockResolvedValue([{ code: 'UNPAID' }]);
    prisma.read.leaveRequest.findMany.mockResolvedValue([
      {
        leaveTypeCode: 'UNPAID',
        startDate: new Date('2026-09-10'),
        endDate: new Date('2026-09-10'),
        workDays: 1,
      },
    ]);
    prisma.read.userAttendance.findMany.mockResolvedValue([
      { date: new Date('2026-09-10'), status: 'ABSENT' }, // same day — not double counted
      { date: new Date('2026-09-15'), status: 'ABSENT' },
    ]);
    const r = await svc.gatherInputs(1, '2026-09');
    expect(r.absenceDays).toBe(2);
  });

  it('converts approved/paid overtime minutes to hours', async () => {
    prisma.read.overtimeRecord.findMany.mockResolvedValue([
      { overtimeMinutes: 90, status: 'APPROVED' },
      { overtimeMinutes: 30, status: 'PAID' },
    ]);
    const r = await svc.gatherInputs(1, '2026-09');
    expect(r.overtimeHours).toBe(2);
  });
});
