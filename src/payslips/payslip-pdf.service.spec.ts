import { buildPdfInput } from './payslip-pdf.service';
import { PdfService } from '../pdf/pdf.service';

const baseSlip = {
  userId: 3,
  period: '2026-09',
  baseSalary: 100000,
  netSalary: 118770,
  mealAllowance: 25000,
  vacationAllowance: 0,
  christmasAllowance: 0,
  overtime: 0,
  bonuses: 0,
  otherAllowances: 0,
  incomeTax: 3230,
  socialSecurity: 3000,
  healthInsurance: 0,
  loanDeduction: 0,
  advanceDeduction: 0,
  otherDeductions: 0,
  receiptCode: 'REC-202609-0003-ABCD',
  user: { fullName: 'Ana', employeeNumber: 'E-3' },
};

describe('buildPdfInput', () => {
  it('uses PayslipItem lines when present (excludes employer-cost lines)', () => {
    const input = buildPdfInput({
      ...baseSlip,
      items: [
        {
          code: 'BASE_SALARY',
          name: 'Salário Base',
          type: 'EARNING',
          value: 100000,
          isEmployerCost: false,
        },
        {
          code: 'ALLOWANCE_FOOD',
          name: 'Subsídio de Alimentação',
          type: 'EARNING',
          value: 25000,
          isEmployerCost: false,
        },
        {
          code: 'INSS_EMPLOYEE',
          name: 'INSS Colaborador',
          type: 'DEDUCTION',
          value: 3000,
          isEmployerCost: false,
        },
        {
          code: 'INSS_EMPLOYER',
          name: 'INSS Patronal',
          type: 'DEDUCTION',
          value: 8000,
          isEmployerCost: true,
        },
        {
          code: 'ALLOWANCE_TRANSPORT',
          name: 'Subsídio de Transporte',
          type: 'EARNING',
          value: 0,
          isEmployerCost: false,
        },
      ],
    });
    expect(input.allowances).toEqual([{ label: 'Subsídio de Alimentação', amount: 25000 }]);
    expect(input.allowances).not.toContainEqual(
      expect.objectContaining({ label: 'Subsídio de Transporte' }),
    );
    expect(input.deductions).toEqual([{ label: 'INSS Colaborador', amount: 3000 }]);
    expect(input.currencySymbol).toBe('Kz');
    expect(input.employeeName).toBe('Ana');
  });

  it('falls back to fixed columns when there are no items', () => {
    const input = buildPdfInput({ ...baseSlip, items: [] });
    expect(input.allowances).toContainEqual({ label: 'Subsídio de Alimentação', amount: 25000 });
    expect(input.deductions).toContainEqual({ label: 'IRT', amount: 3230 });
    expect(input.deductions).toContainEqual({ label: 'INSS (3%)', amount: 3000 });
    // zero-value rows (vacation/christmas/overtime/bonuses/other + zero deductions) are dropped
    expect(input.allowances).toHaveLength(1);
    expect(input.deductions).toHaveLength(2);
  });

  it('forwards receiptCode and issuedAt to the pdf input', () => {
    const input = buildPdfInput({
      ...baseSlip,
      issuedAt: '2026-09-30T00:00:00.000Z',
      items: [],
    });
    expect(input.receiptCode).toBe('REC-202609-0003-ABCD');
    expect(input.issuedAt).toBe('2026-09-30T00:00:00.000Z');
  });
});

describe('PdfService.generatePayslip digital stamp', () => {
  const base = {
    employeeName: 'Ana',
    employeeId: 'E-3',
    period: '2026-09',
    baseSalary: 100000,
    allowances: [{ label: 'Subsídio de Alimentação', amount: 25000 }],
    deductions: [{ label: 'IRT', amount: 3230 }],
    netSalary: 118770,
  };

  it('produces a larger buffer when a receiptCode stamp is supplied', async () => {
    const pdf = new PdfService();
    const plain = await pdf.generatePayslip({ ...base });
    const stamped = await pdf.generatePayslip({
      ...base,
      receiptCode: 'REC-202609-0003-ABCD',
      issuedAt: '2026-09-30T00:00:00.000Z',
      stampHash: 'abcdef123456',
    });
    expect(stamped.length).toBeGreaterThan(plain.length);
  });
});
