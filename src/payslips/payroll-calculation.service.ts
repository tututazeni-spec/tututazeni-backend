// src/payslips/payroll-calculation.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

export type ExceptionSeverity = 'ERROR' | 'WARNING';
export interface PayrollException {
  code: string;
  severity: ExceptionSeverity;
  message: string;
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

  detectExceptions(args: {
    period: string;
    user: { id: number; fullName?: string };
    compensation: { baseSalary: number; iban?: string | null } | null;
    result: { netSalary: number; grossSalary: number };
    minimumWage: number;
    usedFallbackConfig: boolean;
    prevNetSalary: number | null;
    conflictingPayslip: boolean;
  }): PayrollException[] {
    const ex: PayrollException[] = [];
    const { compensation, result } = args;

    if (!compensation) {
      ex.push({
        code: 'NO_COMPENSATION',
        severity: 'ERROR',
        message: 'Sem compensação activa registada.',
      });
    } else if (compensation.baseSalary <= 0) {
      ex.push({ code: 'ZERO_BASE_SALARY', severity: 'ERROR', message: 'Salário-base é 0.' });
    }

    if (result.netSalary < 0) {
      ex.push({
        code: 'NEGATIVE_NET',
        severity: 'ERROR',
        message: `Líquido negativo (${result.netSalary}).`,
      });
    }
    if (args.conflictingPayslip) {
      ex.push({
        code: 'DUPLICATE_PAYSLIP_FOR_PERIOD',
        severity: 'ERROR',
        message: `Já existe recibo de ${args.period} para este colaborador noutro run.`,
      });
    }
    if (result.netSalary >= 0 && result.netSalary < args.minimumWage) {
      ex.push({
        code: 'NET_BELOW_MINIMUM_WAGE',
        severity: 'WARNING',
        message: `Líquido ${result.netSalary} abaixo do salário mínimo ${args.minimumWage}.`,
      });
    }
    if (compensation && !compensation.iban) {
      ex.push({
        code: 'MISSING_BANK_DETAILS',
        severity: 'WARNING',
        message: 'IBAN em falta na compensação.',
      });
    }
    if (args.prevNetSalary && args.prevNetSalary > 0) {
      const variance = Math.abs(result.netSalary - args.prevNetSalary) / args.prevNetSalary;
      if (variance > 0.3) {
        ex.push({
          code: 'HIGH_VARIANCE_VS_PREV_MONTH',
          severity: 'WARNING',
          message: `Variação de ${(variance * 100).toFixed(0)}% face ao mês anterior.`,
        });
      }
    }
    if (args.usedFallbackConfig) {
      ex.push({
        code: 'USING_FALLBACK_TAX_CONFIG',
        severity: 'WARNING',
        message: 'CountryConfig em falta — cálculo com tabela fiscal por omissão.',
      });
    }
    return ex;
  }

  /**
   * Reavalia as exceções de um único recibo já calculado, refazendo os mesmos
   * lookups que o `processRun` faz inline para cada colaborador (config do país,
   * compensação activa, recibo do mês anterior, recibo em conflito noutro run).
   * Fonte ÚNICA de detecção de exceções — usada pelo `processRun` e pelo
   * `recalcPayslip` do workflow, para que um recalc de inputs volte a limpar
   * (ou a marcar) o `exceptions`/`hasExceptions` do recibo.
   * Lê via `this.prisma.read.*` (sem tx): são leituras pré-cálculo sem
   * necessidade de isolamento transaccional.
   */
  async reassessExceptions(
    run: { id: number; countryCode: string; taxYear: number | null; period: string },
    user: { id: number; fullName?: string },
    result: PayrollResult,
  ): Promise<PayrollException[]> {
    const config = await this.engine.loadCountryConfig(
      run.countryCode,
      run.taxYear ?? Number(run.period.slice(0, 4)),
    );
    const minimumWage = config.minimumWage ?? 0;
    const usedFallbackConfig = !('id' in (config as Record<string, unknown>));

    const compensation = await this.prisma.read.employeeCompensation.findFirst({
      where: {
        userId: user.id,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const prev = await this.prisma.read.payslip.findFirst({
      where: { userId: user.id, period: { lt: run.period }, status: { not: 'DRAFT' } },
      orderBy: { period: 'desc' },
      select: { netSalary: true },
    });

    const conflicting = await this.prisma.read.payslip.findFirst({
      where: { userId: user.id, period: run.period, runId: { not: run.id } },
      select: { id: true },
    });

    return this.detectExceptions({
      period: run.period,
      user,
      compensation,
      result,
      minimumWage,
      usedFallbackConfig,
      prevNetSalary: prev?.netSalary ?? null,
      conflictingPayslip: !!conflicting,
    });
  }

  async resolveTargetUsers(run: {
    scope: unknown;
  }): Promise<Array<{ id: number; fullName: string }>> {
    const scope = (run.scope ?? {}) as { departmentIds?: number[]; userIds?: number[] };
    const where: Prisma.UserWhereInput = { active: true };
    if (scope.userIds?.length) where.id = { in: scope.userIds };
    else if (scope.departmentIds?.length) where.departmentId = { in: scope.departmentIds };
    // NB: User não tem countryCode — um scope vazio abrange todos os utilizadores activos.
    return this.prisma.read.user.findMany({ where, select: { id: true, fullName: true } });
  }

  async processRun(runId: number) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('PayrollRun não encontrado');

    const targets = await this.resolveTargetUsers(run);

    let totalGross = 0,
      totalNet = 0,
      totalDeductions = 0,
      totalEmployerCost = 0;
    let exceptionsCount = 0,
      errorCount = 0;

    await this.prisma.$transaction(async tx => {
      await (tx as unknown as PrismaService).payslipItem.deleteMany({
        where: { payslip: { runId, status: 'DRAFT' } },
      });
      await (tx as unknown as PrismaService).payslip.deleteMany({
        where: { runId, status: 'DRAFT' },
      });

      for (const user of targets) {
        const calc = await this.calculatePayslip(
          { countryCode: run.countryCode, taxYear: run.taxYear, period: run.period },
          user,
        );

        const exceptions = await this.reassessExceptions(
          {
            id: runId,
            countryCode: run.countryCode,
            taxYear: run.taxYear,
            period: run.period,
          },
          user,
          calc.result,
        );
        const hasError = exceptions.some(e => e.severity === 'ERROR');
        exceptionsCount += exceptions.length;
        if (hasError) errorCount += 1;

        try {
          const created = await (tx as unknown as PrismaService).payslip.create({
            data: {
              ...calc.data,
              runId,
              hasExceptions: exceptions.length > 0,
              exceptions: exceptions.length
                ? (exceptions as unknown as Prisma.InputJsonValue)
                : undefined,
            } as unknown as Prisma.PayslipUncheckedCreateInput,
          });
          if (calc.items.length) {
            await (tx as unknown as PrismaService).payslipItem.createMany({
              data: calc.items.map(i => ({ ...i, payslipId: created.id })),
            });
          }
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            errorCount += 1;
            exceptionsCount += 1;
            continue;
          }
          throw e;
        }

        totalGross += calc.data.grossSalary as number;
        totalNet += calc.data.netSalary as number;
        totalDeductions += calc.data.totalDeductions as number;
        totalEmployerCost += calc.data.totalEmployerCost as number;
      }

      await (tx as unknown as PrismaService).payrollRun.update({
        where: { id: runId },
        data: {
          employeeCount: targets.length,
          exceptionsCount,
          errorCount,
          totalGross: money(totalGross),
          totalNet: money(totalNet),
          totalDeductions: money(totalDeductions),
          totalEmployerCost: money(totalEmployerCost),
        },
      });
    });

    return {
      employeeCount: targets.length,
      exceptionsCount,
      errorCount,
      totalGross: money(totalGross),
      totalNet: money(totalNet),
      totalDeductions: money(totalDeductions),
      totalEmployerCost: money(totalEmployerCost),
    };
  }
}
