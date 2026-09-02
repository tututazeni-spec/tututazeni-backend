// src/payslips/payroll-calculation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollEngineService } from './payroll-engine.service';
import type { PayrollContext, PayrollResult, PayrollLineItem } from './payroll-engine.service';
import { money, assertNetInvariant } from './money.util';

export interface PayrollInputs {
  absenceDays: number;
  overtimeHours: number;
  workingDaysInMonth: number;
}

export interface CalcOverrides {
  absenceDays?: number;
  overtimeHours?: number;
  bonusAmount?: number;
  advanceDeduction?: number;
}

export interface PayrollRunLike {
  countryCode: string;
  taxYear: number | null;
  period: string;
}

export interface PayslipItemWriteData {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  value: number;
  isTaxable: boolean;
  calcType: 'FIXED' | 'PERCENT' | 'FORMULA' | 'TABLE' | null;
  isEmployerCost: boolean;
  order: number;
}

export interface CalculatedPayslip {
  data: Record<string, unknown>;
  items: PayslipItemWriteData[];
  result: PayrollResult;
}

@Injectable()
export class PayrollCalculationService {
  private readonly logger = new Logger(PayrollCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PayrollEngineService,
  ) {}

  /** Limites [início, fimExclusivo) do mês de "YYYY-MM". */
  private monthRange(period: string): { start: Date; end: Date } {
    const [y, m] = period.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { start, end };
  }

  workingDaysInMonth(period: string): number {
    const [y, m] = period.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) return 22;
    let count = 0;
    const d = new Date(Date.UTC(y, m - 1, 1));
    while (d.getUTCMonth() === m - 1) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) count++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return count || 22;
  }

  /** Expande [startDate, endDate] em dias úteis (chaves "YYYY-MM-DD") dentro do mês. */
  private weekdayKeysInRange(start: Date, end: Date, monthStart: Date, monthEnd: Date): string[] {
    const from = start < monthStart ? monthStart : start;
    const to = end < monthEnd ? end : new Date(monthEnd.getTime() - 1);
    const keys: string[] = [];
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    while (d <= to) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) keys.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return keys;
  }

  async gatherInputs(userId: number, period: string): Promise<PayrollInputs> {
    const { start, end } = this.monthRange(period);
    const workingDaysInMonth = this.workingDaysInMonth(period);

    const unpaidTypes = await this.prisma.read.leaveTypeConfig.findMany({
      where: { isPaid: false },
      select: { code: true },
    });
    const unpaidCodes = unpaidTypes.map(t => t.code);

    const absentDayKeys = new Set<string>();

    if (unpaidCodes.length > 0) {
      const leaves = await this.prisma.read.leaveRequest.findMany({
        where: {
          userId,
          status: 'APPROVED',
          leaveTypeCode: { in: unpaidCodes },
          startDate: { lt: end },
          endDate: { gte: start },
        },
        select: { startDate: true, endDate: true },
      });
      for (const lv of leaves) {
        for (const k of this.weekdayKeysInRange(lv.startDate, lv.endDate, start, end)) {
          absentDayKeys.add(k);
        }
      }
    }

    const attendance = await this.prisma.read.userAttendance.findMany({
      where: { userId, status: 'ABSENT', date: { gte: start, lt: end } },
      select: { date: true },
    });
    for (const a of attendance) absentDayKeys.add(a.date.toISOString().slice(0, 10));

    const overtime = await this.prisma.read.overtimeRecord.findMany({
      where: { userId, status: { in: ['APPROVED', 'PAID'] }, date: { gte: start, lt: end } },
      select: { overtimeMinutes: true },
    });
    const overtimeHours = money(
      overtime.reduce((sum, o) => sum + (o.overtimeMinutes ?? 0), 0) / 60,
    );

    return {
      absenceDays: absentDayKeys.size,
      overtimeHours,
      workingDaysInMonth,
    };
  }

  private lineValue(lines: PayrollLineItem[], code: string): number {
    return money(lines.filter(l => l.code === code).reduce((s, l) => s + l.value, 0));
  }

  async calculatePayslip(
    run: PayrollRunLike,
    user: { id: number },
    overrides: CalcOverrides = {},
  ): Promise<CalculatedPayslip> {
    const taxYear = run.taxYear ?? Number(run.period.slice(0, 4));
    const compensation = await this.prisma.read.employeeCompensation.findFirst({
      where: {
        userId: user.id,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: { components: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const inputs = await this.gatherInputs(user.id, run.period);

    const ctx: PayrollContext = {
      userId: user.id,
      baseSalary: compensation?.baseSalary ?? 0,
      countryCode: run.countryCode,
      taxYear,
      foodAllowance: compensation?.foodAllowance ?? undefined,
      transportAllowance: compensation?.transportAllowance ?? undefined,
      absenceDays: overrides.absenceDays ?? inputs.absenceDays,
      overtimeHours: overrides.overtimeHours ?? inputs.overtimeHours,
      workingDaysInMonth: inputs.workingDaysInMonth,
      bonusAmount: overrides.bonusAmount,
      advanceDeduction: overrides.advanceDeduction,
      extraComponents: (compensation?.components ?? []).map(c => ({
        code: c.componentCode,
        value: c.value,
        isTaxable: true,
      })),
    };

    const result = await this.engine.calculate(ctx, run.period);

    const items: PayslipItemWriteData[] = result.lines.map((l, i) => ({
      code: l.code,
      name: l.name,
      type: l.type,
      value: money(l.value),
      isTaxable: l.isTaxable,
      calcType: (['FIXED', 'PERCENT', 'FORMULA', 'TABLE'].includes(l.calcType)
        ? l.calcType
        : null) as PayslipItemWriteData['calcType'],
      isEmployerCost: l.isEmployerCost,
      order: i,
    }));

    const totals = {
      grossSalary: money(result.grossSalary),
      totalDeductions: money(result.totalDeductions),
      netSalary: money(result.netSalary),
    };
    assertNetInvariant(totals);

    const data: Record<string, unknown> = {
      userId: user.id,
      period: run.period,
      countryCode: run.countryCode,
      baseSalary: this.lineValue(result.lines, 'BASE_SALARY'),
      mealAllowance: this.lineValue(result.lines, 'ALLOWANCE_FOOD'),
      otherAllowances: this.lineValue(result.lines, 'ALLOWANCE_TRANSPORT'),
      overtime: this.lineValue(result.lines, 'OVERTIME'),
      bonuses: this.lineValue(result.lines, 'BONUS'),
      vacationAllowance: 0,
      christmasAllowance: 0,
      grossSalary: totals.grossSalary,
      totalEarnings: money(result.totalEarnings),
      netSalary: totals.netSalary,
      totalDeductions: totals.totalDeductions,
      totalEmployerCost: money(result.totalEmployerCost),
      incomeTax: money(result.incomeTax),
      socialSecurity: money(result.employeeSocialSecurity),
      employerInss: money(result.employerSocialSecurity),
      healthInsurance: this.lineValue(result.lines, 'HEALTH_INSURANCE'),
      advanceDeduction: this.lineValue(result.lines, 'ADVANCE'),
      otherDeductions: this.lineValue(result.lines, 'UNION_FEE'),
      taxBracket: result.taxBracketApplied ?? null,
      calcInputs: {
        absenceDays: ctx.absenceDays,
        overtimeHours: ctx.overtimeHours,
        bonusAmount: ctx.bonusAmount ?? null,
        advanceDeduction: ctx.advanceDeduction ?? null,
        workingDaysInMonth: ctx.workingDaysInMonth,
      },
      calcSnapshot: result as unknown as Record<string, unknown>,
      status: 'DRAFT',
    };

    return { data, items, result };
  }
}
