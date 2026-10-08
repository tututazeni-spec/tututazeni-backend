import { BadRequestException } from '@nestjs/common';
import { PayrollInsightsService } from './payroll-insights.service';

const slip = (over: Record<string, unknown> = {}) => ({
  userId: 1,
  period: '2026-09',
  status: 'ISSUED',
  baseSalary: 100000,
  mealAllowance: 0,
  vacationAllowance: 0,
  christmasAllowance: 0,
  otherAllowances: 0,
  overtime: 0,
  bonuses: 0,
  totalEarnings: 100000,
  grossSalary: 100000,
  netSalary: 80000,
  totalDeductions: 20000,
  socialSecurity: 3000,
  incomeTax: 15000,
  healthInsurance: 0,
  loanDeduction: 0,
  advanceDeduction: 2000,
  otherDeductions: 0,
  employerInss: 8000,
  totalEmployerCost: 108000,
  hasExceptions: false,
  taxBracket: '15% (100 000 – 200 000 AOA)',
  user: {
    id: 1,
    fullName: 'Ana',
    department: { id: 1, name: 'RH' },
    unit: null,
    position: { id: 1, name: 'Analista' },
  },
  ...over,
});

describe('PayrollInsightsService', () => {
  let read: any;
  let svc: PayrollInsightsService;

  beforeEach(() => {
    read = {
      payrollRun: { findFirst: jest.fn().mockResolvedValue(null) },
      payslip: { findMany: jest.fn().mockResolvedValue([]) },
      user: { count: jest.fn().mockResolvedValue(10) },
      payrollPayment: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      countryConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    svc = new PayrollInsightsService({ read } as any);
  });

  describe('overview', () => {
    it('rejeita período inválido', async () => {
      await expect(svc.overview('2026-13')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sem run nem recibos devolve alerta NO_RUN e zeros', async () => {
      const o = await svc.overview('2026-09');
      expect(o.alerts.map(a => a.code)).toContain('NO_RUN');
      expect(o.financials.totalNet).toBe(0);
      expect(o.monthlyVariation).toBeNull();
    });

    it('agrega totais, pendentes, variação vs mês anterior e alertas', async () => {
      read.payslip.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.period === '2026-09'
            ? [slip(), slip({ status: 'DRAFT', hasExceptions: true, netSalary: 40000 })]
            : [slip({ netSalary: 100000 })],
        ),
      );
      read.payrollPayment.count.mockResolvedValue(2);
      const o = await svc.overview('2026-09');
      expect(o.employees).toEqual({ total: 10, processed: 2, pending: 8 });
      expect(o.financials.totalNet).toBe(120000);
      expect(o.receipts).toEqual({ issued: 1, pending: 1 });
      expect(o.previous.period).toBe('2026-08');
      expect(o.monthlyVariation).toEqual({ absolute: 20000, pct: 20 });
      expect(o.alerts.map(a => a.code)).toEqual(
        expect.arrayContaining(['EXCEPTIONS', 'PENDING_EMPLOYEES', 'PENDING_PAYMENTS']),
      );
    });

    it('anterior de janeiro é dezembro do ano anterior', async () => {
      const o = await svc.overview('2026-01');
      expect(o.previous.period).toBe('2025-12');
    });
  });

  describe('deductions', () => {
    it('totaliza por tipo e agrupa IRT por taxa', async () => {
      read.payslip.findMany.mockResolvedValue([
        slip(),
        slip({ userId: 2, taxBracket: '10% (0 – 100 000 AOA)', incomeTax: 5000 }),
      ]);
      const d = await svc.deductions('2026-09');
      expect(d.types.find(t => t.code === 'INSS_EMPLOYEE')!.total).toBe(6000);
      expect(d.types.find(t => t.code === 'ADVANCE')!.employeesAffected).toBe(2);
      expect(d.irt.withheld).toBe(20000);
      expect(d.irt.byBracket.map(b => b.bracket)).toEqual([
        '10% (0 – 100 000 AOA)',
        '15% (100 000 – 200 000 AOA)',
      ]);
    });
  });

  describe('report', () => {
    it('rejeita tipo desconhecido', async () => {
      await expect(svc.report('nope', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('year+month filtra pelo período exacto', async () => {
      await svc.report('monthly-payroll', { year: 2026, month: 9 });
      expect(read.payslip.findMany.mock.calls[0][0].where.period).toBe('2026-09');
    });

    it('by-department agrupa e ordena por bruto desc', async () => {
      read.payslip.findMany.mockResolvedValue([
        slip({ userId: 1, grossSalary: 100 }),
        slip({
          userId: 2,
          grossSalary: 500,
          user: {
            id: 2,
            fullName: 'B',
            department: { id: 2, name: 'TI' },
            unit: null,
            position: null,
          },
        }),
      ]);
      const r = await svc.report('by-department', {});
      expect(r.rows.map(x => x.key)).toEqual(['TI', 'RH']);
    });

    it('evolution calcula variação face ao período anterior', async () => {
      read.payslip.findMany.mockResolvedValue([
        slip({ period: '2026-08', netSalary: 100 }),
        slip({ period: '2026-09', netSalary: 150 }),
      ]);
      const r = await svc.report('evolution', {});
      expect(r.rows[0].variationPct).toBeNull();
      expect(r.rows[1].variationPct).toBe(50);
    });

    it('receipts conta por estado', async () => {
      read.payslip.findMany.mockResolvedValue([
        slip(),
        slip({ status: 'DRAFT' }),
        slip({ status: 'DISPUTED' }),
      ]);
      const r = await svc.report('receipts', {});
      expect(r.totals).toEqual({ issued: 2, pending: 1, disputed: 1 });
    });
  });

  describe('upsertTaxConfig', () => {
    const dto = (brackets: unknown[]) =>
      ({
        taxYear: 2026,
        minimumWage: 70000,
        socialSecurity: { employeeRate: 0.03, employerRate: 0.08 },
        irtBrackets: brackets,
      }) as any;

    it('rejeita escalões sobrepostos', async () => {
      await expect(
        svc.upsertTaxConfig(
          dto([
            { min: 0, max: 100, rate: 0 },
            { min: 50, max: null, rate: 0.1 },
          ]),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita escalão intermédio sem limite máximo', async () => {
      await expect(
        svc.upsertTaxConfig(
          dto([
            { min: 0, max: null, rate: 0 },
            { min: 100, max: null, rate: 0.1 },
          ]),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
