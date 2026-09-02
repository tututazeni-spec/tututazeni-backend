// src/payslips/payslip-pdf.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';

interface PdfPayslipInput {
  employeeName: string;
  employeeId: string;
  period: string;
  baseSalary: number;
  allowances: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  netSalary: number;
  companyName?: string;
  currencySymbol?: string;
  receiptCode?: string;
  issuedAt?: string | Date;
  stampHash?: string;
}

interface SlipForPdf {
  userId: number;
  period: string;
  baseSalary: number;
  netSalary: number;
  mealAllowance: number;
  vacationAllowance: number;
  christmasAllowance: number;
  overtime: number;
  bonuses: number;
  otherAllowances: number;
  incomeTax: number;
  socialSecurity: number;
  healthInsurance: number;
  loanDeduction: number;
  advanceDeduction: number;
  otherDeductions: number;
  receiptCode?: string | null;
  issuedAt?: string | Date | null;
  user?: { fullName?: string | null; employeeNumber?: string | null } | null;
  items?: Array<{
    name: string;
    type: 'EARNING' | 'DEDUCTION';
    value: number;
    isEmployerCost: boolean;
  }>;
}

export function buildPdfInput(p: SlipForPdf): PdfPayslipInput {
  let allowances: { label: string; amount: number }[];
  let deductions: { label: string; amount: number }[];

  if (p.items && p.items.length > 0) {
    const visible = p.items.filter(i => !i.isEmployerCost && i.value > 0);
    allowances = visible
      .filter(i => i.type === 'EARNING' && i.name !== 'Salário Base')
      .map(i => ({ label: i.name, amount: i.value }));
    deductions = visible
      .filter(i => i.type === 'DEDUCTION')
      .map(i => ({ label: i.name, amount: i.value }));
  } else {
    allowances = [
      { label: 'Subsídio de Alimentação', amount: p.mealAllowance },
      { label: 'Subsídio de Férias', amount: p.vacationAllowance },
      { label: 'Subsídio de Natal', amount: p.christmasAllowance },
      { label: 'Horas Extra', amount: p.overtime },
      { label: 'Prémios', amount: p.bonuses },
      { label: 'Outros Abonos', amount: p.otherAllowances },
    ].filter(a => a.amount > 0);
    deductions = [
      { label: 'IRT', amount: p.incomeTax },
      { label: 'INSS (3%)', amount: p.socialSecurity },
      { label: 'Seguro de Saúde', amount: p.healthInsurance },
      { label: 'Empréstimo', amount: p.loanDeduction },
      { label: 'Adiantamento', amount: p.advanceDeduction },
      { label: 'Outros Descontos', amount: p.otherDeductions },
    ].filter(d => d.amount > 0);
  }

  return {
    employeeName: p.user?.fullName ?? '—',
    employeeId: p.user?.employeeNumber ?? String(p.userId),
    period: p.period,
    baseSalary: p.baseSalary,
    allowances,
    deductions,
    netSalary: p.netSalary,
    currencySymbol: 'Kz',
    companyName: 'INNOVA',
    receiptCode: p.receiptCode ?? undefined,
    issuedAt: (p as { issuedAt?: string | Date }).issuedAt ?? undefined,
  };
}

@Injectable()
export class PayslipPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  async render(payslipId: number): Promise<Buffer> {
    const payslip = await this.prisma.read.payslip.findUnique({
      where: { id: payslipId },
      include: {
        items: true,
        user: { select: { fullName: true, employeeNumber: true, nif: true, nib: true } },
      },
    });
    if (!payslip) throw new NotFoundException('Recibo não encontrado');

    const input = buildPdfInput(payslip as unknown as SlipForPdf);

    if (payslip.receiptCode) {
      input.stampHash = createHash('sha256')
        .update(`${payslip.receiptCode}|${payslip.netSalary}|${payslip.issuedAt ?? ''}`)
        .digest('hex')
        .slice(0, 12);
    }

    return this.pdf.generatePayslip(input);
  }
}
