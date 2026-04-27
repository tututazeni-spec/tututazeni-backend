// ─── src/payslips/payroll-engine.service.ts ──────────────────────────────────
// Motor de cálculo paramétrico — sem hardcode fiscal.
// As tabelas fiscais vêm da base de dados (CountryConfig).
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Internal Types ───────────────────────────────────────────────────────────

export interface PayrollContext {
  userId: number;
  baseSalary: number;
  countryCode: string;
  taxYear: number;
  // Inputs variáveis (podem vir de attendance / leave / inputs manuais)
  overtimeHours?: number;
  overtimeRateMultiplier?: number;  // ex: 1.5 = 150%
  bonusAmount?: number;
  foodAllowance?: number;
  transportAllowance?: number;
  absenceDays?: number;
  workingDaysInMonth?: number;
  advanceDeduction?: number;
  extraComponents?: Array<{ code: string; value: number; isTaxable: boolean }>;
}

export interface PayrollLineItem {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  value: number;
  isTaxable: boolean;
  calcType: string;
  isEmployerCost: boolean;
}

export interface PayrollResult {
  userId: number;
  period: string;
  countryCode: string;
  taxYear: number;
  lines: PayrollLineItem[];
  // Totais
  totalEarnings: number;
  totalTaxableBase: number;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  // Encargos patronais
  employerSocialSecurity: number;
  totalEmployerCost: number;
  // Impostos calculados
  incomeTax: number;
  employeeSocialSecurity: number;
  // Detalhe
  taxBracketApplied?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PayrollEngineService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════
  // ENTRY POINT
  // ══════════════════════════════════════════════════════════════════

  async calculate(ctx: PayrollContext, period: string): Promise<PayrollResult> {
    const config = await this.loadCountryConfig(ctx.countryCode, ctx.taxYear);
    const compensation = await this.loadEmployeeCompensation(ctx.userId);

    // Resolver base salary: compensação específica do colaborador > input
    const baseSalary = compensation?.baseSalary ?? ctx.baseSalary;
    const workDays   = ctx.workingDaysInMonth ?? 22;

    // ── Construir linhas de rendimento ────────────────────────────────
    const lines: PayrollLineItem[] = [];

    // 1. Salário base
    const dailyRate = baseSalary / workDays;
    const absenceDays = ctx.absenceDays ?? 0;
    const workedBaseSalary = baseSalary - (absenceDays * dailyRate);

    lines.push({
      code: 'BASE_SALARY', name: 'Salário Base',
      type: 'EARNING', value: +workedBaseSalary.toFixed(2),
      isTaxable: true, calcType: 'FIXED', isEmployerCost: false,
    });

    if (absenceDays > 0) {
      lines.push({
        code: 'ABSENCE_DEDUCTION', name: `Desconto por Faltas (${absenceDays}d)`,
        type: 'DEDUCTION', value: +(absenceDays * dailyRate).toFixed(2),
        isTaxable: false, calcType: 'FIXED', isEmployerCost: false,
      });
    }

    // 2. Subsídio alimentação (não tributável em Angola)
    const food = ctx.foodAllowance ?? compensation?.foodAllowance ?? config.defaultFoodAllowance ?? 0;
    if (food > 0) {
      lines.push({
        code: 'ALLOWANCE_FOOD', name: 'Subsídio de Alimentação',
        type: 'EARNING', value: +food.toFixed(2),
        isTaxable: false, calcType: 'FIXED', isEmployerCost: false,
      });
    }

    // 3. Subsídio transporte (não tributável)
    const transport = ctx.transportAllowance ?? compensation?.transportAllowance ?? config.defaultTransportAllowance ?? 0;
    if (transport > 0) {
      lines.push({
        code: 'ALLOWANCE_TRANSPORT', name: 'Subsídio de Transporte',
        type: 'EARNING', value: +transport.toFixed(2),
        isTaxable: false, calcType: 'FIXED', isEmployerCost: false,
      });
    }

    // 4. Horas extras (tributáveis)
    if (ctx.overtimeHours && ctx.overtimeHours > 0) {
      const hourlyRate    = baseSalary / (workDays * 8);
      const multiplier    = ctx.overtimeRateMultiplier ?? 1.5;
      const overtimeValue = ctx.overtimeHours * hourlyRate * multiplier;
      lines.push({
        code: 'OVERTIME', name: `Horas Extras (${ctx.overtimeHours}h)`,
        type: 'EARNING', value: +overtimeValue.toFixed(2),
        isTaxable: true, calcType: 'FORMULA', isEmployerCost: false,
      });
    }

    // 5. Bónus (tributável)
    if (ctx.bonusAmount && ctx.bonusAmount > 0) {
      lines.push({
        code: 'BONUS', name: 'Bónus',
        type: 'EARNING', value: +ctx.bonusAmount.toFixed(2),
        isTaxable: true, calcType: 'FIXED', isEmployerCost: false,
      });
    }

    // 6. Componentes extra do colaborador
    for (const ec of ctx.extraComponents ?? []) {
      lines.push({
        code: ec.code, name: ec.code,
        type: 'EARNING', value: +ec.value.toFixed(2),
        isTaxable: ec.isTaxable, calcType: 'FIXED', isEmployerCost: false,
      });
    }

    // ── Totais brutos ─────────────────────────────────────────────────
    const earnings       = lines.filter(l => l.type === 'EARNING');
    const totalEarnings  = earnings.reduce((a, l) => a + l.value, 0);
    const taxableBase    = earnings.filter(l => l.isTaxable).reduce((a, l) => a + l.value, 0);
    const grossSalary    = totalEarnings;

    // ── INSS Colaborador ──────────────────────────────────────────────
    // Angola LGT: 3% colaborador (Lei 7/04 — usando 3% conforme legislação vigente)
    const ssRate       = config.socialSecurity?.employeeRate ?? 0.03;
    const ssCeiling    = config.socialSecurity?.ceiling;
    const ssBase       = ssCeiling ? Math.min(taxableBase, ssCeiling) : taxableBase;
    const ssEmployee   = +(ssBase * ssRate).toFixed(2);

    lines.push({
      code: 'INSS_EMPLOYEE', name: `INSS Colaborador (${(ssRate * 100).toFixed(0)}%)`,
      type: 'DEDUCTION', value: ssEmployee,
      isTaxable: false, calcType: 'PERCENT', isEmployerCost: false,
    });

    // ── Base tributável IRT = bruto tributável - INSS colaborador ────
    const irtBase    = Math.max(0, taxableBase - ssEmployee);
    const { irt, bracketLabel } = this.calculateIRT(irtBase, config.irtBrackets ?? []);

    if (irt > 0) {
      lines.push({
        code: 'IRT', name: 'IRT (Imposto Rendimento Trabalho)',
        type: 'DEDUCTION', value: +irt.toFixed(2),
        isTaxable: false, calcType: 'TABLE', isEmployerCost: false,
      });
    }

    // ── Seguro de saúde ────────────────────────────────────────────────
    const healthRate = config.healthInsuranceRate ?? 0;
    if (healthRate > 0) {
      const healthVal = +(grossSalary * healthRate).toFixed(2);
      lines.push({
        code: 'HEALTH_INSURANCE', name: `Seguro de Saúde (${(healthRate * 100).toFixed(0)}%)`,
        type: 'DEDUCTION', value: healthVal,
        isTaxable: false, calcType: 'PERCENT', isEmployerCost: false,
      });
    }

    // ── Sindicato ─────────────────────────────────────────────────────
    const unionRate = config.unionFeeRate ?? 0;
    if (unionRate > 0) {
      const unionVal = +(grossSalary * unionRate).toFixed(2);
      lines.push({
        code: 'UNION_FEE', name: 'Quota Sindical',
        type: 'DEDUCTION', value: unionVal,
        isTaxable: false, calcType: 'PERCENT', isEmployerCost: false,
      });
    }

    // ── Adiantamento ──────────────────────────────────────────────────
    if (ctx.advanceDeduction && ctx.advanceDeduction > 0) {
      lines.push({
        code: 'ADVANCE', name: 'Adiantamento',
        type: 'DEDUCTION', value: +ctx.advanceDeduction.toFixed(2),
        isTaxable: false, calcType: 'FIXED', isEmployerCost: false,
      });
    }

    // ── Encargos patronais (não afectam net do colaborador) ───────────
    const empSsRate  = config.socialSecurity?.employerRate ?? 0.08;
    const empSsBase  = ssCeiling ? Math.min(taxableBase, ssCeiling) : taxableBase;
    const empSs      = +(empSsBase * empSsRate).toFixed(2);

    const gfRate     = config.guaranteeFundRate ?? 0;
    const gfVal      = +(grossSalary * gfRate).toFixed(2);

    // ── Totais finais ──────────────────────────────────────────────────
    const deductionLines   = lines.filter(l => l.type === 'DEDUCTION' && !l.isEmployerCost);
    const totalDeductions  = deductionLines.reduce((a, l) => a + l.value, 0);
    const netSalary        = +(grossSalary - totalDeductions).toFixed(2);
    const totalEmployerCost = +(grossSalary + empSs + gfVal).toFixed(2);

    return {
      userId:        ctx.userId,
      period,
      countryCode:   ctx.countryCode,
      taxYear:       ctx.taxYear,
      lines,
      totalEarnings: +totalEarnings.toFixed(2),
      totalTaxableBase: +taxableBase.toFixed(2),
      grossSalary:   +grossSalary.toFixed(2),
      totalDeductions: +totalDeductions.toFixed(2),
      netSalary,
      incomeTax:     +irt.toFixed(2),
      employeeSocialSecurity: ssEmployee,
      employerSocialSecurity: empSs,
      totalEmployerCost,
      taxBracketApplied: bracketLabel,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // IRT TABLE CALCULATOR (Paramétrico — não hardcoded)
  // ══════════════════════════════════════════════════════════════════

  calculateIRT(base: number, brackets: Array<{ min: number; max?: number | null; rate: number; deduction?: number | null }>): { irt: number; bracketLabel: string } {
    if (!brackets.length) return { irt: 0, bracketLabel: 'Isento' };

    const sorted = [...brackets].sort((a, b) => a.min - b.min);

    for (const bracket of sorted) {
      const max = bracket.max ?? Infinity;
      if (base >= bracket.min && base < max) {
        const excess = base - bracket.min;
        const baseTax = bracket.deduction ?? 0; // pré-calculado para o escalão
        const tax     = baseTax + (excess * bracket.rate);
        const label   = `${(bracket.rate * 100).toFixed(0)}% (${bracket.min.toLocaleString('pt-AO')} – ${max === Infinity ? '∞' : max.toLocaleString('pt-AO')} AOA)`;
        return { irt: Math.max(0, tax), bracketLabel: label };
      }
    }

    // Último escalão (sem max)
    const last   = sorted[sorted.length - 1];
    const excess = base - last.min;
    const tax    = (last.deduction ?? 0) + excess * last.rate;
    return {
      irt: Math.max(0, tax),
      bracketLabel: `${(last.rate * 100).toFixed(0)}% (acima de ${last.min.toLocaleString('pt-AO')} AOA)`,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // LOADERS
  // ══════════════════════════════════════════════════════════════════

  async loadCountryConfig(countryCode: string, taxYear: number) {
    const config = await this.prisma.countryConfig.findFirst({
      where: { countryCode, taxYear, active: true },
      include: { irtBrackets: { orderBy: { min: 'asc' } } },
    });

    if (!config) {
      // Seed automático com defaults Angola 2026 se não existir
      return this.getDefaultAngolaConfig(taxYear);
    }

    return {
      ...config,
      socialSecurity: config.socialSecurity as any,
    };
  }

  async loadEmployeeCompensation(userId: number) {
    return this.prisma.employeeCompensation.findFirst({
      where: {
        userId,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      include: { components: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  // ── Angola 2026 defaults (seed) ───────────────────────────────────────────
  getDefaultAngolaConfig(taxYear: number) {
    return {
      countryCode: 'AO',
      name: 'Angola',
      currency: 'AOA',
      locale: 'pt-AO',
      taxYear,
      minimumWage: 70000,
      defaultFoodAllowance: 25000,
      defaultTransportAllowance: 15000,

      // Tabela IRT Angola 2026 (Lei 18/14 e actualizações)
      // ⚠️ Confirmar tabela actualizada com AGT antes de produção
      irtBrackets: [
        { min: 0,       max: 70000,   rate: 0,    deduction: 0      },
        { min: 70000,   max: 100000,  rate: 0.07, deduction: 0      },
        { min: 100000,  max: 150000,  rate: 0.11, deduction: 4000   },
        { min: 150000,  max: 200000,  rate: 0.14, deduction: 8500   },
        { min: 200000,  max: 300000,  rate: 0.17, deduction: 14500  },
        { min: 300000,  max: 500000,  rate: 0.21, deduction: 26500  },
        { min: 500000,  max: null,    rate: 0.25, deduction: 46500  },
      ],

      // INSS Angola: 3% colaborador, 8% empregador (Lei 7/04)
      socialSecurity: { employeeRate: 0.03, employerRate: 0.08, ceiling: null },

      healthInsuranceRate: 0.02,
      unionFeeRate:        0.01,
      guaranteeFundRate:   0.005,
    };
  }
}