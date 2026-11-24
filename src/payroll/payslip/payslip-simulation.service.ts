// src/payroll/payslip/payslip-simulation.service.ts
// Simulador salarial: usa o MESMO motor e as MESMAS regras fiscais (BD) que os
// processamentos reais, para o líquido simulado coincidir com o do recibo.
import { Injectable } from '@nestjs/common';
import { PayrollContext, PayrollEngineService } from '../taxes/payroll-engine.service';
import { SimulatePayslipDto } from './payslips.dto';

const COUNTRY = 'AO';

@Injectable()
export class PayslipSimulationService {
  constructor(private readonly engine: PayrollEngineService) {}

  /** Regras fiscais do ano (BD; por omissão as de Angola) no formato do editor de regras. */
  async taxRules(year?: number) {
    const taxYear = year ?? new Date().getFullYear();
    const cfg = await this.engine.loadCountryConfig(COUNTRY, taxYear);
    const brackets = [...(cfg.irtBrackets ?? [])].sort((a, b) => a.min - b.min);
    return {
      id: (cfg as { id?: number }).id ?? 0,
      taxYear,
      countryCode: COUNTRY,
      minimumWage: cfg.minimumWage,
      socialSecurity: {
        employeeRate: cfg.socialSecurity?.employeeRate ?? 0.03,
        employerRate: cfg.socialSecurity?.employerRate ?? 0.08,
        ceiling: cfg.socialSecurity?.ceiling ?? null,
      },
      irtBrackets: brackets.map((b, i) => ({
        id: (b as { id?: number }).id ?? i,
        min: b.min,
        max: b.max ?? null,
        rate: b.rate,
        deduction: b.deduction ?? null,
      })),
    };
  }

  async simulate(dto: SimulatePayslipDto, year?: number) {
    const taxYear = year ?? new Date().getFullYear();
    const extra: NonNullable<PayrollContext['extraComponents']> = [];
    // Tal como nos processamentos, componentes extra entram como tributáveis.
    if ((dto.overtime ?? 0) > 0)
      extra.push({ code: 'OVERTIME', value: dto.overtime, isTaxable: true });
    if ((dto.otherAllowances ?? 0) > 0)
      extra.push({ code: 'OTHER_ALLOWANCES', value: dto.otherAllowances, isTaxable: true });

    const result = await this.engine.calculate(
      {
        userId: 0,
        baseSalary: dto.baseSalary,
        countryCode: COUNTRY,
        taxYear,
        // 0 (e não undefined) impede o motor de usar o subsídio por omissão do país.
        foodAllowance: dto.mealAllowance ?? 0,
        transportAllowance: dto.transportAllowance ?? 0,
        bonusAmount: dto.bonuses,
        extraComponents: extra,
        ignoreCompensation: true,
      },
      `${taxYear}-01`,
    );

    const bracket = result.taxBracket ?? { min: 0, max: null, rate: 0, deduction: 0 };
    const irtBase = result.irtBase ?? 0;
    const formula = result.taxBracket
      ? `${bracket.deduction.toLocaleString('pt-AO')} + (${irtBase.toLocaleString('pt-AO')} − ${bracket.min.toLocaleString('pt-AO')}) × ${(bracket.rate * 100).toFixed(0)}% = ${result.incomeTax.toLocaleString('pt-AO')} AOA`
      : `Isento (${irtBase.toLocaleString('pt-AO')} AOA)`;

    return {
      input: dto,
      grossSalary: result.grossSalary,
      incomeTax: result.incomeTax,
      socialSecurity: result.employeeSocialSecurity,
      employerInss: result.employerSocialSecurity,
      totalDeductions: result.totalDeductions,
      netSalary: result.netSalary,
      deductionLines: result.lines
        .filter(l => l.type === 'DEDUCTION' && !l.isEmployerCost)
        .map(l => ({ code: l.code, name: l.name, value: l.value })),
      irtDetails: {
        bracket,
        base: irtBase,
        formula,
        effectiveRate: result.grossSalary > 0 ? (result.incomeTax / result.grossSalary) * 100 : 0,
      },
    };
  }
}
