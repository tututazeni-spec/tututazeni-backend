import { Test, TestingModule } from '@nestjs/testing';
import { PayrollEngineService } from './payroll-engine.service';
import type { PayrollContext } from './payroll-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { money } from './money.util';

const mockPrisma = {
  countryConfig: {
    findFirst: jest.fn().mockResolvedValue({
      countryCode: 'AO',
      taxYear: 2024,
      irtBrackets: [],
      inssRate: 3,
      inssEmployerRate: 8,
    }),
  },
  employeeCompensation: {
    findFirst: jest.fn().mockResolvedValue({ baseSalary: 5000, currency: 'AOA' }),
  },
};

describe('PayrollEngineService', () => {
  let service: PayrollEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollEngineService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<PayrollEngineService>(PayrollEngineService);
  });

  describe('loadCountryConfig', () => {
    it('deve carregar configuração do país', async () => {
      const result = await service.loadCountryConfig('AO', 2024);
      expect(result).toBeDefined();
    });
  });

  describe('loadEmployeeCompensation', () => {
    it('deve carregar remuneração do colaborador', async () => {
      const result = await service.loadEmployeeCompensation(1);
      expect(result).toBeDefined();
    });
  });

  describe('invariants', () => {
    const BASE_SALARIES = [70000, 150000, 300000, 800000];
    const WORK_DAYS = 22;

    beforeEach(() => {
      // Sem CountryConfig em BD ⇒ getDefaultAngolaConfig (tabela IRT + INSS completos).
      mockPrisma.countryConfig.findFirst.mockResolvedValue(null);
      // Sem compensação registada ⇒ o motor usa ctx.baseSalary directamente.
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue(null);
    });

    afterAll(() => {
      mockPrisma.countryConfig.findFirst.mockResolvedValue({
        countryCode: 'AO',
        taxYear: 2024,
        irtBrackets: [],
        inssRate: 3,
        inssEmployerRate: 8,
      });
      mockPrisma.employeeCompensation.findFirst.mockResolvedValue({
        baseSalary: 5000,
        currency: 'AOA',
      });
    });

    const ctxFor = (baseSalary: number, extra: Partial<PayrollContext> = {}): PayrollContext => ({
      userId: 1,
      baseSalary,
      countryCode: 'AO',
      taxYear: 2026,
      workingDaysInMonth: WORK_DAYS,
      ...extra,
    });

    it('gross − deductions − net closes to the cent for every base salary', async () => {
      for (const baseSalary of BASE_SALARIES) {
        const r = await service.calculate(ctxFor(baseSalary), '2026-09');
        expect(Math.abs(r.grossSalary - r.totalDeductions - r.netSalary)).toBeLessThanOrEqual(0.01);
      }
    });

    it('picks the right IRT bracket at the exact bracket edges (100000, 150000)', () => {
      const brackets = service.getDefaultAngolaConfig(2026).irtBrackets;
      expect(service.calculateIRT(100000, brackets).irt).toBe(4000);
      expect(service.calculateIRT(150000, brackets).irt).toBe(8500);
    });

    it('employee social security equals money(taxableBase * 0.03)', async () => {
      for (const baseSalary of BASE_SALARIES) {
        const r = await service.calculate(ctxFor(baseSalary), '2026-09');
        expect(r.employeeSocialSecurity).toBe(money(r.totalTaxableBase * 0.03));
      }
    });

    it('reduces the BASE_SALARY line proportionally to absence days', async () => {
      const baseSalary = 150000;
      const absenceDays = 3;
      const r = await service.calculate(ctxFor(baseSalary, { absenceDays }), '2026-09');
      const baseLine = r.lines.find(l => l.code === 'BASE_SALARY');
      expect(baseLine?.value).toBe(
        +(baseSalary - absenceDays * (baseSalary / WORK_DAYS)).toFixed(2),
      );
    });

    it('computes the OVERTIME line as overtimeHours * (baseSalary / (workDays * 8)) * 1.5', async () => {
      const baseSalary = 300000;
      const overtimeHours = 10;
      const r = await service.calculate(ctxFor(baseSalary, { overtimeHours }), '2026-09');
      const otLine = r.lines.find(l => l.code === 'OVERTIME');
      expect(otLine?.value).toBe(
        +(overtimeHours * (baseSalary / (WORK_DAYS * 8)) * 1.5).toFixed(2),
      );
    });
  });
});
