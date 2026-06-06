import { Test, TestingModule } from '@nestjs/testing';
import { PayrollEngineService, PayrollContext } from './payroll-engine.service';
import { PrismaService } from '../prisma/prisma.service';

const angolaBrackets = [
  { min: 0, max: 70000, rate: 0, deduction: 0 },
  { min: 70000, max: 100000, rate: 0.07, deduction: 0 },
  { min: 100000, max: 150000, rate: 0.11, deduction: 4000 },
  { min: 150000, max: 200000, rate: 0.14, deduction: 8500 },
  { min: 200000, max: 300000, rate: 0.17, deduction: 14500 },
  { min: 300000, max: 500000, rate: 0.21, deduction: 26500 },
  { min: 500000, max: null, rate: 0.25, deduction: 46500 },
];

const defaultConfig = {
  countryCode: 'AO',
  taxYear: 2026,
  irtBrackets: angolaBrackets,
  socialSecurity: { employeeRate: 0.03, employerRate: 0.08, ceiling: null },
  defaultFoodAllowance: 25000,
  defaultTransportAllowance: 15000,
  healthInsuranceRate: 0,
  unionFeeRate: 0,
  guaranteeFundRate: 0,
};

const mockPrisma = {
  countryConfig: { findFirst: jest.fn() },
  employeeCompensation: { findFirst: jest.fn() },
};

describe('PayrollEngineService (additional)', () => {
  let service: PayrollEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollEngineService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayrollEngineService>(PayrollEngineService);
  });

  // ─── calculateIRT ─────────────────────────────────────────────────

  describe('calculateIRT', () => {
    it('deve retornar isento para base 0 com brackets vazios', () => {
      const { irt, bracketLabel } = service.calculateIRT(0, []);
      expect(irt).toBe(0);
      expect(bracketLabel).toBe('Isento');
    });

    it('deve aplicar escalão 0% (isento até 70000)', () => {
      const { irt } = service.calculateIRT(50000, angolaBrackets);
      expect(irt).toBe(0);
    });

    it('deve aplicar escalão 7% (70000-100000)', () => {
      const { irt } = service.calculateIRT(80000, angolaBrackets);
      expect(irt).toBeCloseTo((80000 - 70000) * 0.07, 1);
    });

    it('deve aplicar escalão 11% (100000-150000)', () => {
      const { irt } = service.calculateIRT(120000, angolaBrackets);
      const expected = 4000 + (120000 - 100000) * 0.11;
      expect(irt).toBeCloseTo(expected, 1);
    });

    it('deve aplicar escalão 17% (200000-300000)', () => {
      const { irt } = service.calculateIRT(250000, angolaBrackets);
      const expected = 14500 + (250000 - 200000) * 0.17;
      expect(irt).toBeCloseTo(expected, 1);
    });

    it('deve aplicar último escalão 25% (acima de 500000)', () => {
      const { irt, bracketLabel } = service.calculateIRT(600000, angolaBrackets);
      const expected = 46500 + (600000 - 500000) * 0.25;
      expect(irt).toBeCloseTo(expected, 1);
      expect(bracketLabel).toContain('25%');
    });

    it('não deve retornar IRT negativo', () => {
      const { irt } = service.calculateIRT(0, angolaBrackets);
      expect(irt).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── getDefaultAngolaConfig ───────────────────────────────────────

  describe('getDefaultAngolaConfig', () => {
    it('deve retornar config padrão Angola para 2026', () => {
      const config = service.getDefaultAngolaConfig(2026);
      expect(config.countryCode).toBe('AO');
      expect(config.taxYear).toBe(2026);
      expect(config.irtBrackets).toHaveLength(7);
      expect(config.socialSecurity.employeeRate).toBe(0.03);
      expect(config.socialSecurity.employerRate).toBe(0.08);
      expect(config.defaultFoodAllowance).toBe(25000);
      expect(config.defaultTransportAllowance).toBe(15000);
    });

    it('deve aceitar qualquer taxYear', () => {
      const config = service.getDefaultAngolaConfig(2025);
      expect(config.taxYear).toBe(2025);
    });
  });

  // ─── loadCountryConfig ────────────────────────────────────────────

  describe('loadCountryConfig', () => {
    it('deve retornar config da BD quando existe', async () => {
      const dbConfig = { ...defaultConfig, id: 1, active: true };
      mockPrisma.countryConfig.findFirst.mockResolvedValue(dbConfig);
      const result = await service.loadCountryConfig('AO', 2026);
      expect(result.countryCode).toBe('AO');
    });

    it('deve retornar config padrão quando não existe na BD', async () => {
      mockPrisma.countryConfig.findFirst.mockResolvedValue(null);
      const result = await service.loadCountryConfig('AO', 2026);
      expect(result.countryCode).toBe('AO');
      expect(result.irtBrackets).toHaveLength(7);
    });
  });

  // ─── loadEmployeeCompensation ─────────────────────────────────────

  describe('loadEmployeeCompensation', () => {
    it('deve retornar compensação do colaborador', async () => {
      const comp = { id: 1, userId: 1, baseSalary: 150000, foodAllowance: 25000, transportAllowance: 15000, components: [] };
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue(comp);
      const result = await service.loadEmployeeCompensation(1);
      expect(result).toBeDefined();
      expect(result!.baseSalary).toBe(150000);
    });

    it('deve retornar null se não encontrar compensação', async () => {
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue(null);
      const result = await service.loadEmployeeCompensation(99);
      expect(result).toBeNull();
    });
  });

  // ─── calculate ────────────────────────────────────────────────────

  describe('calculate', () => {
    beforeEach(() => {
      mockPrisma.countryConfig.findFirst.mockResolvedValue(null); // usa default config
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue(null);
    });

    it('deve calcular salário líquido básico', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      expect(result.userId).toBe(1);
      expect(result.grossSalary).toBeGreaterThan(0);
      expect(result.netSalary).toBeLessThanOrEqual(result.grossSalary);
      expect(result.period).toBe('2026-06');
      expect(result.countryCode).toBe('AO');
    });

    it('deve incluir linha BASE_SALARY nas linhas', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      const baseLine = result.lines.find(l => l.code === 'BASE_SALARY');
      expect(baseLine).toBeDefined();
      expect(baseLine!.type).toBe('EARNING');
      expect(baseLine!.isTaxable).toBe(true);
    });

    it('deve calcular subsídio de alimentação do ctx', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026, foodAllowance: 30000 };
      const result = await service.calculate(ctx, '2026-06');
      const foodLine = result.lines.find(l => l.code === 'ALLOWANCE_FOOD');
      expect(foodLine).toBeDefined();
      expect(foodLine!.value).toBe(30000);
      expect(foodLine!.isTaxable).toBe(false);
    });

    it('deve calcular subsídio de transporte', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026, transportAllowance: 20000 };
      const result = await service.calculate(ctx, '2026-06');
      const transportLine = result.lines.find(l => l.code === 'ALLOWANCE_TRANSPORT');
      expect(transportLine).toBeDefined();
      expect(transportLine!.value).toBe(20000);
    });

    it('deve calcular horas extras', async () => {
      const ctx: PayrollContext = {
        userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026,
        overtimeHours: 10, overtimeRateMultiplier: 1.5,
      };
      const result = await service.calculate(ctx, '2026-06');
      const overtimeLine = result.lines.find(l => l.code === 'OVERTIME');
      expect(overtimeLine).toBeDefined();
      expect(overtimeLine!.isTaxable).toBe(true);
    });

    it('deve calcular bónus', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026, bonusAmount: 50000 };
      const result = await service.calculate(ctx, '2026-06');
      const bonusLine = result.lines.find(l => l.code === 'BONUS');
      expect(bonusLine).toBeDefined();
      expect(bonusLine!.value).toBe(50000);
    });

    it('deve deduzir faltas do salário base', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026, absenceDays: 2, workingDaysInMonth: 22 };
      const result = await service.calculate(ctx, '2026-06');
      const absenceLine = result.lines.find(l => l.code === 'ABSENCE_DEDUCTION');
      expect(absenceLine).toBeDefined();
      expect(absenceLine!.type).toBe('DEDUCTION');
    });

    it('deve calcular adiantamento', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026, advanceDeduction: 10000 };
      const result = await service.calculate(ctx, '2026-06');
      const advanceLine = result.lines.find(l => l.code === 'ADVANCE');
      expect(advanceLine).toBeDefined();
      expect(advanceLine!.value).toBe(10000);
    });

    it('deve calcular componentes extra', async () => {
      const ctx: PayrollContext = {
        userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026,
        extraComponents: [{ code: 'SPECIAL_BONUS', value: 20000, isTaxable: true }],
      };
      const result = await service.calculate(ctx, '2026-06');
      const extraLine = result.lines.find(l => l.code === 'SPECIAL_BONUS');
      expect(extraLine).toBeDefined();
      expect(extraLine!.value).toBe(20000);
    });

    it('deve usar baseSalary da compensação BD quando disponível', async () => {
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue({
        baseSalary: 200000, foodAllowance: null, transportAllowance: null, components: [],
      });
      const ctx: PayrollContext = { userId: 1, baseSalary: 100000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      const baseLine = result.lines.find(l => l.code === 'BASE_SALARY');
      expect(baseLine!.value).toBeCloseTo(200000, 0);
    });

    it('deve calcular INSS colaborador (3%)', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      const inssLine = result.lines.find(l => l.code === 'INSS_EMPLOYEE');
      expect(inssLine).toBeDefined();
      expect(inssLine!.type).toBe('DEDUCTION');
      expect(result.employeeSocialSecurity).toBeGreaterThan(0);
      expect(result.employerSocialSecurity).toBeGreaterThan(0);
    });

    it('deve calcular IRT para salário acima do limiar', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      expect(result.incomeTax).toBeGreaterThanOrEqual(0);
    });

    it('deve aplicar health insurance quando configurado', async () => {
      mockPrisma.countryConfig.findFirst.mockResolvedValue({
        ...defaultConfig,
        healthInsuranceRate: 0.02,
        irtBrackets: angolaBrackets,
      });
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      const healthLine = result.lines.find(l => l.code === 'HEALTH_INSURANCE');
      expect(healthLine).toBeDefined();
    });

    it('deve aplicar quota sindical quando configurada', async () => {
      mockPrisma.countryConfig.findFirst.mockResolvedValue({
        ...defaultConfig,
        unionFeeRate: 0.01,
        irtBrackets: angolaBrackets,
      });
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      const unionLine = result.lines.find(l => l.code === 'UNION_FEE');
      expect(unionLine).toBeDefined();
    });

    it('deve retornar resultado completo com todos os campos', async () => {
      const ctx: PayrollContext = { userId: 1, baseSalary: 150000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      expect(result).toHaveProperty('totalEarnings');
      expect(result).toHaveProperty('totalTaxableBase');
      expect(result).toHaveProperty('grossSalary');
      expect(result).toHaveProperty('totalDeductions');
      expect(result).toHaveProperty('netSalary');
      expect(result).toHaveProperty('employerSocialSecurity');
      expect(result).toHaveProperty('totalEmployerCost');
      expect(result).toHaveProperty('incomeTax');
      expect(result).toHaveProperty('employeeSocialSecurity');
    });

    it('deve aplicar ceiling do INSS quando configurado', async () => {
      mockPrisma.countryConfig.findFirst.mockResolvedValue({
        ...defaultConfig,
        socialSecurity: { employeeRate: 0.03, employerRate: 0.08, ceiling: 100000 },
        irtBrackets: angolaBrackets,
      });
      const ctx: PayrollContext = { userId: 1, baseSalary: 500000, countryCode: 'AO', taxYear: 2026 };
      const result = await service.calculate(ctx, '2026-06');
      expect(result.employeeSocialSecurity).toBeCloseTo(100000 * 0.03, 1);
    });
  });
});
