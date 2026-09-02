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

describe('PayrollCalculationService.calculatePayslip', () => {
  let svc: PayrollCalculationService;
  let prisma: any;
  let engine: any;

  beforeEach(async () => {
    prisma = prismaMock();
    engine = { calculate: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        PayrollCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayrollEngineService, useValue: engine },
      ],
    }).compile();
    svc = mod.get(PayrollCalculationService);
  });

  const engineResult = {
    userId: 1,
    period: '2026-09',
    countryCode: 'AO',
    taxYear: 2026,
    lines: [
      {
        code: 'BASE_SALARY',
        name: 'Salário Base',
        type: 'EARNING',
        value: 100000,
        isTaxable: true,
        calcType: 'FIXED',
        isEmployerCost: false,
      },
      {
        code: 'ALLOWANCE_FOOD',
        name: 'Subsídio de Alimentação',
        type: 'EARNING',
        value: 25000,
        isTaxable: false,
        calcType: 'FIXED',
        isEmployerCost: false,
      },
      {
        code: 'INSS_EMPLOYEE',
        name: 'INSS Colaborador (3%)',
        type: 'DEDUCTION',
        value: 3000,
        isTaxable: false,
        calcType: 'PERCENT',
        isEmployerCost: false,
      },
      {
        code: 'IRT',
        name: 'IRT',
        type: 'DEDUCTION',
        value: 3230,
        isTaxable: false,
        calcType: 'TABLE',
        isEmployerCost: false,
      },
    ],
    totalEarnings: 125000,
    totalTaxableBase: 100000,
    grossSalary: 125000,
    totalDeductions: 6230,
    netSalary: 118770,
    employerSocialSecurity: 8000,
    totalEmployerCost: 133625,
    incomeTax: 3230,
    employeeSocialSecurity: 3000,
    taxBracketApplied: '11% (100.000 – 150.000 AOA)',
  };

  it('maps engine lines to PayslipItem write data with isEmployerCost + order', async () => {
    engine.calculate.mockResolvedValue(engineResult);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({
      baseSalary: 100000,
      foodAllowance: 25000,
      components: [],
    });
    const out = await svc.calculatePayslip(
      { countryCode: 'AO', taxYear: 2026, period: '2026-09' },
      { id: 1 },
    );
    expect(out.items).toHaveLength(4);
    expect(out.items[0]).toMatchObject({
      code: 'BASE_SALARY',
      type: 'EARNING',
      order: 0,
      isEmployerCost: false,
    });
    expect(out.items.map(i => i.order)).toEqual([0, 1, 2, 3]);
  });

  it('fills the fixed compat columns from named lines', async () => {
    engine.calculate.mockResolvedValue(engineResult);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({
      baseSalary: 100000,
      foodAllowance: 25000,
      components: [],
    });
    const out = await svc.calculatePayslip(
      { countryCode: 'AO', taxYear: 2026, period: '2026-09' },
      { id: 1 },
    );
    expect(out.data.baseSalary).toBe(100000);
    expect(out.data.mealAllowance).toBe(25000);
    expect(out.data.incomeTax).toBe(3230);
    expect(out.data.socialSecurity).toBe(3000);
    expect(out.data.grossSalary).toBe(125000);
    expect(out.data.netSalary).toBe(118770);
    expect(out.data.status).toBe('DRAFT');
  });

  it('passes overrides into the engine context', async () => {
    engine.calculate.mockResolvedValue(engineResult);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({
      baseSalary: 100000,
      components: [],
    });
    await svc.calculatePayslip(
      { countryCode: 'AO', taxYear: 2026, period: '2026-09' },
      { id: 1 },
      { absenceDays: 2, bonusAmount: 5000 },
    );
    const [ctx] = engine.calculate.mock.calls[0];
    expect(ctx.absenceDays).toBe(2);
    expect(ctx.bonusAmount).toBe(5000);
  });

  it('defaults taxYear to the year of the period when run.taxYear is null', async () => {
    engine.calculate.mockResolvedValue(engineResult);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({
      baseSalary: 100000,
      components: [],
    });
    await svc.calculatePayslip({ countryCode: 'AO', taxYear: null, period: '2026-09' }, { id: 1 });
    const [ctx] = engine.calculate.mock.calls[0];
    expect(ctx.taxYear).toBe(2026);
  });
});
