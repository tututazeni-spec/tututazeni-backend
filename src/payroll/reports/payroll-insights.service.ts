// src/payslips/payroll-insights.service.ts
// Leituras agregadas do Payroll (docs/payroll.md §1, §3, §5, §9): visão geral,
// colaboradores do processamento, deduções & impostos e relatórios. Só lê —
// nunca duplica dados de outros módulos (Users, Departments, Leave).
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculatePagination,
  buildPaginatedResponse,
} from '../../common/helpers/pagination.helper';
import { money } from '../taxes/money.util';
import {
  PayrollReportFilterDto,
  PayrollEmployeesFilterDto,
  UpsertTaxConfigDto,
} from '../payroll.dto';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const REPORT_TYPES = [
  'monthly-payroll',
  'earnings',
  'deductions',
  'by-department',
  'by-unit',
  'by-position',
  'evolution',
  'receipts',
  'payments',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

type PayslipForReport = Prisma.PayslipGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        fullName: true;
        department: { select: { id: true; name: true } };
        unit: { select: { id: true; name: true } };
        position: { select: { id: true; name: true } };
      };
    };
  };
}>;

function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function sum<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  return money(rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0));
}

@Injectable()
export class PayrollInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── §1 Visão Geral ────────────────────────────────────────────────────────
  async overview(period?: string) {
    const target = period ?? new Date().toISOString().slice(0, 7);
    if (!PERIOD_RE.test(target)) throw new BadRequestException('Período inválido (AAAA-MM)');
    const prev = previousPeriod(target);

    const [run, payslips, prevPayslips, activeEmployees, pendingPayments] = await Promise.all([
      this.prisma.read.payrollRun.findFirst({
        where: { period: target, status: { not: 'CANCELLED' } },
        orderBy: { id: 'desc' },
        include: { closure: true },
      }),
      this.prisma.read.payslip.findMany({
        where: { period: target },
        select: {
          status: true,
          totalEarnings: true,
          grossSalary: true,
          netSalary: true,
          totalDeductions: true,
          socialSecurity: true,
          incomeTax: true,
          employerInss: true,
          totalEmployerCost: true,
          hasExceptions: true,
        },
      }),
      this.prisma.read.payslip.findMany({
        where: { period: prev },
        select: { grossSalary: true, netSalary: true, totalEmployerCost: true },
      }),
      this.prisma.read.user.count({ where: { hrStatus: 'ACTIVE' } }),
      this.prisma.read.payrollPayment.count({
        where: {
          run: { period: target },
          status: { in: ['PENDING', 'PREPARED', 'SENT_TO_BANK'] },
        },
      }),
    ]);

    const processed = payslips.length;
    const issued = payslips.filter(p => p.status !== 'DRAFT').length;
    const disputed = payslips.filter(p => p.status === 'DISPUTED').length;
    const exceptions = payslips.filter(p => p.hasExceptions).length;
    const totalNet = sum(payslips, p => p.netSalary);
    const prevNet = sum(prevPayslips, p => p.netSalary);
    const prevGross = sum(prevPayslips, p => p.grossSalary);
    const pendingEmployees = Math.max(activeEmployees - processed, 0);

    const alerts: Array<{ code: string; severity: 'info' | 'warning' | 'error'; message: string }> =
      [];
    if (!run && processed === 0)
      alerts.push({
        code: 'NO_RUN',
        severity: 'warning',
        message: `Ainda não existe processamento para ${target}.`,
      });
    if (exceptions > 0)
      alerts.push({
        code: 'EXCEPTIONS',
        severity: 'warning',
        message: `${exceptions} recibo(s) com excepções por validar.`,
      });
    if (disputed > 0)
      alerts.push({
        code: 'DISPUTES',
        severity: 'warning',
        message: `${disputed} recibo(s) em disputa.`,
      });
    if (pendingEmployees > 0 && processed > 0)
      alerts.push({
        code: 'PENDING_EMPLOYEES',
        severity: 'info',
        message: `${pendingEmployees} colaborador(es) activo(s) sem recibo neste período.`,
      });
    if (pendingPayments > 0)
      alerts.push({
        code: 'PENDING_PAYMENTS',
        severity: 'info',
        message: `${pendingPayments} pagamento(s) por concluir.`,
      });

    return {
      period: target,
      run: run
        ? {
            id: run.id,
            status: run.status,
            payGroup: run.payGroup,
            closed: !!run.closure?.closedAt,
          }
        : null,
      employees: { total: activeEmployees, processed, pending: pendingEmployees },
      financials: {
        totalGross: sum(payslips, p => p.grossSalary),
        totalNet,
        totalEarnings: sum(payslips, p => p.totalEarnings),
        totalDeductions: sum(payslips, p => p.totalDeductions),
        totalInss: sum(payslips, p => p.socialSecurity),
        totalIrt: sum(payslips, p => p.incomeTax),
        employerCharges: sum(payslips, p => p.employerInss),
        totalPersonnelCost: sum(payslips, p => p.totalEmployerCost),
        totalPayable: totalNet,
      },
      previous: { period: prev, totalGross: prevGross, totalNet: prevNet },
      monthlyVariation:
        prevNet > 0
          ? {
              absolute: money(totalNet - prevNet),
              pct: money(((totalNet - prevNet) / prevNet) * 100),
            }
          : null,
      pendingPayments,
      receipts: { issued, pending: processed - issued },
      alerts,
    };
  }

  // ─── §3 Colaboradores do processamento ────────────────────────────────────
  async runEmployees(runId: number, filter: PayrollEmployeesFilterDto) {
    const run = await this.prisma.read.payrollRun.findUnique({
      where: { id: runId },
      select: { id: true, status: true, period: true },
    });
    if (!run) throw new NotFoundException('PayrollRun não encontrado');
    const { page = 1, limit = 50, search, departmentId } = filter;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.PayslipWhereInput = { runId };
    const userWhere: Prisma.UserWhereInput = {};
    if (departmentId) userWhere.departmentId = departmentId;
    if (search)
      userWhere.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { employeeNumber: { contains: search, mode: 'insensitive' } },
      ];
    if (Object.keys(userWhere).length) where.user = userWhere;

    const [rows, total] = await Promise.all([
      this.prisma.read.payslip.findMany({
        where,
        skip,
        take,
        orderBy: { user: { fullName: 'asc' } },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeNumber: true,
              nif: true,
              department: { select: { name: true } },
              position: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.read.payslip.count({ where }),
    ]);

    const data = rows.map(p => {
      const inputs = (p.calcInputs ?? {}) as Record<string, unknown>;
      return {
        payslipId: p.id,
        userId: p.userId,
        fullName: p.user.fullName,
        employeeNumber: p.user.employeeNumber,
        nif: p.user.nif,
        department: p.user.department?.name ?? null,
        position: p.user.position?.name ?? null,
        baseSalary: p.baseSalary,
        allowances: money(
          p.mealAllowance + p.vacationAllowance + p.christmasAllowance + p.otherAllowances,
        ),
        overtime: p.overtime,
        bonuses: p.bonuses,
        absenceDays: typeof inputs.absenceDays === 'number' ? inputs.absenceDays : 0,
        inss: p.socialSecurity,
        irt: p.incomeTax,
        otherDeductions: money(
          p.healthInsurance + p.loanDeduction + p.advanceDeduction + p.otherDeductions,
        ),
        grossSalary: p.grossSalary,
        netSalary: p.netSalary,
        employerCost: p.totalEmployerCost,
        status: p.status,
        hasExceptions: p.hasExceptions,
      };
    });
    return buildPaginatedResponse(data, total, page, limit);
  }

  /** Ficha do colaborador: dados contratuais, componentes, histórico salarial, recibos e pagamentos. */
  async employeeProfile(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        employeeNumber: true,
        nif: true,
        nib: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
        unit: { select: { name: true } },
      },
    });
    if (!user) throw new NotFoundException('Colaborador não encontrado');
    const [compensations, payslips] = await Promise.all([
      this.prisma.read.employeeCompensation.findMany({
        where: { userId },
        orderBy: { effectiveFrom: 'desc' },
        take: 24,
        include: { components: true },
      }),
      this.prisma.read.payslip.findMany({
        where: { userId },
        orderBy: { period: 'desc' },
        take: 24,
        select: {
          id: true,
          period: true,
          receiptCode: true,
          grossSalary: true,
          netSalary: true,
          status: true,
          runId: true,
          paymentDate: true,
        },
      }),
    ]);
    const current = compensations.find(c => !c.effectiveTo) ?? compensations[0] ?? null;
    return {
      user: { ...user, nib: user.nib ? `••••${user.nib.slice(-4)}` : null },
      compensation: current,
      salaryHistory: compensations.map(c => ({
        id: c.id,
        baseSalary: c.baseSalary,
        effectiveFrom: c.effectiveFrom,
        effectiveTo: c.effectiveTo,
      })),
      payslips,
      payments: payslips
        .filter(p => p.paymentDate)
        .map(p => ({ period: p.period, paymentDate: p.paymentDate, netSalary: p.netSalary })),
    };
  }

  // ─── §5 Deduções & Impostos ───────────────────────────────────────────────
  async deductions(period?: string) {
    const target = period ?? new Date().toISOString().slice(0, 7);
    if (!PERIOD_RE.test(target)) throw new BadRequestException('Período inválido (AAAA-MM)');
    const [payslips, config] = await Promise.all([
      this.prisma.read.payslip.findMany({
        where: { period: target },
        select: {
          socialSecurity: true,
          employerInss: true,
          incomeTax: true,
          healthInsurance: true,
          loanDeduction: true,
          advanceDeduction: true,
          otherDeductions: true,
          totalDeductions: true,
          grossSalary: true,
          taxBracket: true,
        },
      }),
      this.taxConfig(Number(target.slice(0, 4))),
    ]);
    const types = [
      {
        code: 'INSS_EMPLOYEE',
        name: 'INSS trabalhador',
        pick: (p: (typeof payslips)[number]) => p.socialSecurity,
        mandatory: true,
      },
      {
        code: 'INSS_EMPLOYER',
        name: 'INSS patronal (encargo)',
        pick: (p: (typeof payslips)[number]) => p.employerInss,
        mandatory: true,
      },
      {
        code: 'IRT',
        name: 'IRT retido',
        pick: (p: (typeof payslips)[number]) => p.incomeTax,
        mandatory: true,
      },
      {
        code: 'HEALTH',
        name: 'Seguro de saúde',
        pick: (p: (typeof payslips)[number]) => p.healthInsurance,
        mandatory: false,
      },
      {
        code: 'LOAN',
        name: 'Empréstimos',
        pick: (p: (typeof payslips)[number]) => p.loanDeduction,
        mandatory: false,
      },
      {
        code: 'ADVANCE',
        name: 'Adiantamentos salariais',
        pick: (p: (typeof payslips)[number]) => p.advanceDeduction,
        mandatory: false,
      },
      {
        code: 'OTHER',
        name: 'Outros descontos',
        pick: (p: (typeof payslips)[number]) => p.otherDeductions,
        mandatory: false,
      },
    ];
    // IRT por escalão (nº de colaboradores e imposto). O motor grava o rótulo do
    // escalão em Payslip.taxBracket (ex.: "17% (200 000 – 300 000 AOA)"); irtBracketRate
    // só é preenchido por recibos criados manualmente.
    const byBracket = new Map<string, { bracket: string; employees: number; irt: number }>();
    for (const p of payslips) {
      const bracket = p.taxBracket ?? 'Sem escalão';
      const row = byBracket.get(bracket) ?? { bracket, employees: 0, irt: 0 };
      row.employees += 1;
      row.irt = money(row.irt + p.incomeTax);
      byBracket.set(bracket, row);
    }
    return {
      period: target,
      employees: payslips.length,
      types: types.map(t => ({
        code: t.code,
        name: t.name,
        mandatory: t.mandatory,
        total: sum(payslips, t.pick),
        employeesAffected: payslips.filter(p => (t.pick(p) ?? 0) > 0).length,
      })),
      inss: {
        contributoryBase: sum(payslips, p => p.grossSalary),
        employeeTotal: sum(payslips, p => p.socialSecurity),
        employerTotal: sum(payslips, p => p.employerInss),
      },
      irt: {
        taxableIncome: sum(payslips, p => p.grossSalary),
        withheld: sum(payslips, p => p.incomeTax),
        byBracket: [...byBracket.values()].sort(
          (a, b) =>
            parseFloat(a.bracket) - parseFloat(b.bracket) || a.bracket.localeCompare(b.bracket),
        ),
      },
      config,
    };
  }

  /** Regras fiscais/contributivas por ano — configuráveis (nunca hardcoded). */
  async taxConfig(taxYear: number, countryCode = 'AO') {
    return this.prisma.read.countryConfig.findFirst({
      where: { countryCode, taxYear },
      include: { irtBrackets: { orderBy: { order: 'asc' } } },
    });
  }

  async upsertTaxConfig(dto: UpsertTaxConfigDto) {
    const countryCode = dto.countryCode ?? 'AO';
    const brackets = [...dto.irtBrackets].sort((a, b) => a.min - b.min);
    for (let i = 1; i < brackets.length; i++) {
      const prevMax = brackets[i - 1].max;
      if (prevMax == null || prevMax > brackets[i].min)
        throw new BadRequestException('Escalões IRT sobrepostos ou sem limite intermédio.');
    }
    const data = {
      name: dto.name ?? 'Angola',
      currency: dto.currency ?? 'AOA',
      locale: dto.locale ?? 'pt-AO',
      minimumWage: dto.minimumWage,
      socialSecurity: dto.socialSecurity as unknown as Prisma.InputJsonValue,
    };
    return this.prisma.$transaction(async tx => {
      const cfg = await tx.countryConfig.upsert({
        where: { countryCode_taxYear: { countryCode, taxYear: dto.taxYear } },
        update: data,
        create: { countryCode, taxYear: dto.taxYear, ...data },
      });
      await tx.irtBracket.deleteMany({ where: { configId: cfg.id } });
      await tx.irtBracket.createMany({
        data: brackets.map((b, order) => ({
          configId: cfg.id,
          min: b.min,
          max: b.max ?? null,
          rate: b.rate,
          deduction: b.deduction ?? null,
          order,
        })),
      });
      return tx.countryConfig.findUnique({
        where: { id: cfg.id },
        include: { irtBrackets: { orderBy: { order: 'asc' } } },
      });
    });
  }

  // ─── §9 Relatórios ─────────────────────────────────────────────────────────
  async report(type: string, f: PayrollReportFilterDto) {
    if (!REPORT_TYPES.includes(type as ReportType))
      throw new BadRequestException(
        `Relatório desconhecido. Disponíveis: ${REPORT_TYPES.join(', ')}`,
      );
    if (type === 'payments') return this.paymentsReport(f);

    const where: Prisma.PayslipWhereInput = {};
    if (f.period) where.period = f.period;
    else if (f.year) {
      where.period = f.month
        ? `${f.year}-${String(f.month).padStart(2, '0')}`
        : { startsWith: `${f.year}-` };
    }
    if (f.status) where.status = f.status as Prisma.PayslipWhereInput['status'];
    if (f.userId) where.userId = f.userId;
    const userWhere: Prisma.UserWhereInput = {};
    if (f.departmentId) userWhere.departmentId = f.departmentId;
    if (f.unitId) userWhere.unitId = f.unitId;
    if (f.positionId) userWhere.positionId = f.positionId;
    if (Object.keys(userWhere).length) where.user = userWhere;

    const rows: PayslipForReport[] = await this.prisma.read.payslip.findMany({
      where,
      orderBy: { period: 'asc' },
      take: 50000,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            department: { select: { id: true, name: true } },
            unit: { select: { id: true, name: true } },
            position: { select: { id: true, name: true } },
          },
        },
      },
    });

    const totals = this.totals(rows);
    switch (type as ReportType) {
      case 'by-department':
        return {
          type,
          totals,
          rows: this.groupBy(rows, r => r.user.department?.name ?? 'Sem departamento'),
        };
      case 'by-unit':
        return { type, totals, rows: this.groupBy(rows, r => r.user.unit?.name ?? 'Sem unidade') };
      case 'by-position':
        return {
          type,
          totals,
          rows: this.groupBy(rows, r => r.user.position?.name ?? 'Sem cargo'),
        };
      case 'receipts': {
        const grouped = this.groupBy(rows, r => r.period);
        return {
          type,
          totals: {
            issued: rows.filter(r => r.status !== 'DRAFT').length,
            pending: rows.filter(r => r.status === 'DRAFT').length,
            disputed: rows.filter(r => r.status === 'DISPUTED').length,
          },
          rows: grouped.map(g => {
            const own = rows.filter(r => r.period === g.key);
            return {
              key: g.key,
              total: own.length,
              issued: own.filter(r => r.status === 'ISSUED').length,
              acknowledged: own.filter(r => r.status === 'ACKNOWLEDGED').length,
              disputed: own.filter(r => r.status === 'DISPUTED').length,
              pending: own.filter(r => r.status === 'DRAFT').length,
            };
          }),
        };
      }
      case 'earnings':
        return {
          type,
          totals,
          rows: this.periodRows(rows, own => ({
            baseSalary: sum(own, r => r.baseSalary),
            allowances: sum(
              own,
              r => r.mealAllowance + r.vacationAllowance + r.christmasAllowance + r.otherAllowances,
            ),
            overtime: sum(own, r => r.overtime),
            bonuses: sum(own, r => r.bonuses),
            totalEarnings: sum(own, r => r.totalEarnings),
          })),
        };
      case 'deductions':
        return {
          type,
          totals,
          rows: this.periodRows(rows, own => ({
            inss: sum(own, r => r.socialSecurity),
            irt: sum(own, r => r.incomeTax),
            other: sum(
              own,
              r => r.healthInsurance + r.loanDeduction + r.advanceDeduction + r.otherDeductions,
            ),
            totalDeductions: sum(own, r => r.totalDeductions),
          })),
        };
      case 'evolution': {
        const periods = this.periodRows(rows, own => ({
          employees: own.length,
          totalGross: sum(own, r => r.grossSalary),
          totalNet: sum(own, r => r.netSalary),
          totalEmployerCost: sum(own, r => r.totalEmployerCost),
        }));
        return {
          type,
          totals,
          rows: periods.map((p, i) => {
            const prev = i > 0 ? periods[i - 1].totalNet : 0;
            return {
              ...p,
              variationPct: prev > 0 ? money(((p.totalNet - prev) / prev) * 100) : null,
            };
          }),
        };
      }
      case 'monthly-payroll':
      default:
        return {
          type,
          totals,
          rows: this.periodRows(rows, own => ({
            employees: own.length,
            totalGross: sum(own, r => r.grossSalary),
            totalDeductions: sum(own, r => r.totalDeductions),
            totalNet: sum(own, r => r.netSalary),
            totalEmployerCost: sum(own, r => r.totalEmployerCost),
          })),
        };
    }
  }

  private totals(rows: PayslipForReport[]) {
    return {
      employees: new Set(rows.map(r => r.userId)).size,
      payslips: rows.length,
      totalGross: sum(rows, r => r.grossSalary),
      totalNet: sum(rows, r => r.netSalary),
      totalDeductions: sum(rows, r => r.totalDeductions),
      totalInss: sum(rows, r => r.socialSecurity),
      totalIrt: sum(rows, r => r.incomeTax),
      totalEmployerCost: sum(rows, r => r.totalEmployerCost),
    };
  }

  private groupBy(rows: PayslipForReport[], key: (r: PayslipForReport) => string) {
    const map = new Map<string, PayslipForReport[]>();
    for (const r of rows) {
      const k = key(r);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()]
      .map(([k, own]) => ({
        key: k,
        employees: new Set(own.map(r => r.userId)).size,
        totalGross: sum(own, r => r.grossSalary),
        totalNet: sum(own, r => r.netSalary),
        totalDeductions: sum(own, r => r.totalDeductions),
        totalEmployerCost: sum(own, r => r.totalEmployerCost),
      }))
      .sort((a, b) => b.totalGross - a.totalGross);
  }

  private periodRows<T extends object>(
    rows: PayslipForReport[],
    build: (own: PayslipForReport[]) => T,
  ): Array<{ key: string } & T> {
    const periods = [...new Set(rows.map(r => r.period))].sort();
    return periods.map(p => ({ key: p, ...build(rows.filter(r => r.period === p)) }));
  }

  private async paymentsReport(f: PayrollReportFilterDto) {
    const where: Prisma.PayrollPaymentWhereInput = {};
    if (f.period) where.run = { period: f.period };
    else if (f.year) where.run = { period: { startsWith: `${f.year}-` } };
    if (f.status) where.status = f.status as Prisma.PayrollPaymentWhereInput['status'];
    const rows = await this.prisma.read.payrollPayment.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 1000,
      include: { run: { select: { period: true } } },
    });
    return {
      type: 'payments',
      totals: {
        payments: rows.length,
        totalAmount: sum(rows, r => r.totalAmount),
        paid: rows.filter(r => r.status === 'PAID').length,
        failed: rows.filter(r => r.status === 'FAILED').length,
      },
      rows: rows.map(r => ({
        key: String(r.id),
        period: r.run.period,
        bankName: r.bankName,
        employeeCount: r.employeeCount,
        totalAmount: r.totalAmount,
        expectedDate: r.expectedDate,
        effectiveDate: r.effectiveDate,
        status: r.status,
        reference: r.reference,
      })),
    };
  }
}
