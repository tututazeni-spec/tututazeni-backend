import { PayslipSimulationService } from './payslip-simulation.service';
import { PayrollEngineService } from '../taxes/payroll-engine.service';

// Usa o motor real (regras por omissão de Angola, sem BD) para garantir que o
// simulador devolve exactamente o que um processamento real calcularia.
describe('PayslipSimulationService', () => {
  const prisma = {
    read: {
      countryConfig: { findFirst: jest.fn().mockResolvedValue(null) },
      employeeCompensation: { findFirst: jest.fn() },
    },
  };
  let engine: PayrollEngineService;
  let service: PayslipSimulationService;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new PayrollEngineService(prisma as any);
    service = new PayslipSimulationService(engine);
  });

  it('simulate: coincide com o motor dos processamentos (mesmo líquido, IRT e INSS)', async () => {
    const out = await service.simulate({
      baseSalary: 500_000,
      mealAllowance: 25_000,
      otherAllowances: 15_000,
    });
    const real = await engine.calculate(
      {
        userId: 1,
        baseSalary: 500_000,
        countryCode: 'AO',
        taxYear: new Date().getFullYear(),
        foodAllowance: 25_000,
        transportAllowance: 0,
        extraComponents: [{ code: 'OTHER_ALLOWANCES', value: 15_000, isTaxable: true }],
      },
      '2026-01',
    );
    // o motor real consulta a compensação gravada (ausente neste teste)
    expect(out.grossSalary).toBe(real.grossSalary);
    expect(out.incomeTax).toBe(real.incomeTax);
    expect(out.socialSecurity).toBe(real.employeeSocialSecurity);
    expect(out.totalDeductions).toBe(real.totalDeductions);
    expect(out.netSalary).toBe(real.netSalary);
  });

  it('simulate: não lê a compensação gravada (ignoreCompensation)', async () => {
    await service.simulate({ baseSalary: 100_000 });
    expect(prisma.read.employeeCompensation.findFirst).not.toHaveBeenCalled();
  });

  it('simulate: subsídios de alimentação/transporte não tributáveis e extras tributáveis', async () => {
    const out = await service.simulate({
      baseSalary: 200_000,
      mealAllowance: 30_000,
      transportAllowance: 20_000,
      otherAllowances: 10_000,
    });
    expect(out.grossSalary).toBe(260_000);
    // INSS 3% sobre a base tributável (base + extras) = 210 000
    expect(out.socialSecurity).toBeCloseTo(6_300);
    expect(out.irtDetails.base).toBeCloseTo(203_700);
  });

  it('simulate: devolve as linhas de dedução e o escalão aplicado', async () => {
    const out = await service.simulate({ baseSalary: 250_000 });
    expect(out.deductionLines.map(l => l.code)).toEqual(
      expect.arrayContaining(['INSS_EMPLOYEE', 'IRT']),
    );
    expect(out.irtDetails.bracket.rate).toBeGreaterThan(0);
    expect(out.irtDetails.formula).toContain('AOA');
  });

  it('simulate: effectiveRate é 0 quando o bruto é 0', async () => {
    const out = await service.simulate({ baseSalary: 0 });
    expect(out.irtDetails.effectiveRate).toBe(0);
  });

  it('taxRules: devolve escalões ordenados e no formato do editor de regras', async () => {
    const rules = await service.taxRules(2026);
    expect(rules.taxYear).toBe(2026);
    expect(rules.countryCode).toBe('AO');
    expect(rules.irtBrackets.length).toBeGreaterThan(0);
    const mins = rules.irtBrackets.map(b => b.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(rules.socialSecurity.employeeRate).toBe(0.03);
  });

  it('taxRules: usa as regras guardadas na BD quando existem', async () => {
    prisma.read.countryConfig.findFirst.mockResolvedValueOnce({
      id: 9,
      minimumWage: 80_000,
      socialSecurity: { employeeRate: 0.04, employerRate: 0.09, ceiling: null },
      irtBrackets: [
        { id: 2, min: 100_000, max: null, rate: 0.2, deduction: 1000 },
        { id: 1, min: 0, max: 100_000, rate: 0, deduction: 0 },
      ],
    });
    const rules = await service.taxRules(2026);
    expect(rules.id).toBe(9);
    expect(rules.minimumWage).toBe(80_000);
    expect(rules.socialSecurity.employeeRate).toBe(0.04);
    expect(rules.irtBrackets.map(b => b.id)).toEqual([1, 2]);
  });
});
