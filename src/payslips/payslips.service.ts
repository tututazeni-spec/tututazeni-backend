// src/payslips/payslips.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePayslipDto,
  UpdatePayslipDto,
  PayslipFilterDto,
  BulkCreatePayslipDto,
  SimulatePayslipDto,
  CreateDisputeDto,
} from './payslips.dto';
import { randomBytes } from 'crypto';

// ─── Tabela IRT Angola 2026 (Lei nº 26/2020 + actualização 2026) ─────────────
// Isenção até 150.000 Kz/mês (Portaria 2026)
interface IrtBracket {
  min: number;
  max: number | null;
  rate: number;
  deduction: number;
}

const IRT_TABLE_2026: IrtBracket[] = [
  { min: 0, max: 150_000, rate: 0.0, deduction: 0 },
  { min: 150_001, max: 200_000, rate: 0.1, deduction: 15_000 },
  { min: 200_001, max: 300_000, rate: 0.13, deduction: 21_000 },
  { min: 300_001, max: 500_000, rate: 0.16, deduction: 30_000 },
  { min: 500_001, max: 1_000_000, rate: 0.18, deduction: 40_000 },
  { min: 1_000_001, max: 1_500_000, rate: 0.19, deduction: 50_000 },
  { min: 1_500_001, max: null, rate: 0.25, deduction: 140_000 },
];

const INSS_EMPLOYEE_RATE = 0.03; // 3%
const INSS_EMPLOYER_RATE = 0.08; // 8%

@Injectable()
export class PayslipsService {
  private readonly logger = new Logger(PayslipsService.name);

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  // ─── Cálculo IRT Angola 2026 (método progressivo) ─────────────────────────
  calcIRT(grossSalary: number): { tax: number; bracket: IrtBracket; formula: string } {
    const bracket = IRT_TABLE_2026.find(
      b => grossSalary >= b.min && (b.max === null || grossSalary <= b.max),
    );
    const tax = Math.max(0, grossSalary * bracket.rate - bracket.deduction);
    const formula = `${grossSalary.toLocaleString('pt-AO')} × ${(bracket.rate * 100).toFixed(0)}% − ${bracket.deduction.toLocaleString('pt-AO')} = ${tax.toLocaleString('pt-AO')} Kz`;
    return { tax, bracket, formula };
  }

  // ─── Calcular totais ────────────────────────────────────────────────────────
  private computeTotals(dto: Partial<CreatePayslipDto>) {
    const grossSalary =
      (dto.baseSalary ?? 0) +
      (dto.mealAllowance ?? 0) +
      (dto.vacationAllowance ?? 0) +
      (dto.christmasAllowance ?? 0) +
      (dto.overtime ?? 0) +
      (dto.bonuses ?? 0) +
      (dto.otherAllowances ?? 0);

    const irtResult = this.calcIRT(dto.baseSalary ?? 0); // IRT aplica-se ao salário base
    const incomeTax = dto.irtOverride ?? irtResult.tax;
    const socialSecurity = dto.inssOverride ?? (dto.baseSalary ?? 0) * INSS_EMPLOYEE_RATE;
    const employerInss = (dto.baseSalary ?? 0) * INSS_EMPLOYER_RATE;

    const totalDeductions =
      incomeTax +
      socialSecurity +
      (dto.healthInsurance ?? 0) +
      (dto.loanDeduction ?? 0) +
      (dto.advanceDeduction ?? 0) +
      (dto.otherDeductions ?? 0);

    const netSalary = grossSalary - totalDeductions;

    return {
      grossSalary,
      incomeTax,
      socialSecurity,
      employerInss,
      totalDeductions,
      netSalary,
      irtBracketRate: irtResult.bracket.rate,
      irtFormula: irtResult.formula,
    };
  }

  // ─── Gerar código único de recibo ─────────────────────────────────────────
  private generateReceiptCode(userId: number, period: string): string {
    const hash = randomBytes(4).toString('hex').toUpperCase();
    const p = period.replace('-', '');
    return `REC-${p}-${String(userId).padStart(4, '0')}-${hash}`;
  }

  // ─── Registar acesso ────────────────────────────────────────────────────────
  async logAccess(payslipId: number, userId: number, action: string, ip?: string) {
    try {
      await (this.prisma as any).payslipAccessLog.create({
        data: { payslipId, userId, action, ip: ip ?? 'unknown', accessedAt: new Date() },
      });
    } catch (e) {
      this.logger.warn(`Falha ao registar log de acesso: ${e.message}`);
    }
  }

  // ─── LISTAGEM (ADMIN / RH) ─────────────────────────────────────────────────
  async findAll(filters: PayslipFilterDto) {
    const { page = 1, limit = 20, userId, period, year, status } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (period) where.period = period;
    if (year && !period) where.period = { startsWith: year };

    const [data, total] = await Promise.all([
      this.prismaRead.payslip.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeNumber: true,
              position: true,
              department: true,
            },
          },
        },
        orderBy: [{ period: 'desc' }, { userId: 'asc' }],
      }),
      this.prismaRead.payslip.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── DETALHE ───────────────────────────────────────────────────────────────
  async findOne(id: number, requestingUserId?: number, requestingRole?: string) {
    const p = await (this.prisma as any).payslip.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            employeeNumber: true,
            nif: true,
            nib: true,
            hireDate: true,
          },
        },
      },
    });

    if (!p) throw new NotFoundException('Recibo não encontrado');

    // Colaborador só vê os seus próprios recibos
    if (requestingRole === 'EMPLOYEE' && p.userId !== requestingUserId) {
      throw new ForbiddenException('Acesso não autorizado a este recibo');
    }

    return p;
  }

  // ─── CRIAR INDIVIDUAL ──────────────────────────────────────────────────────
  async create(dto: CreatePayslipDto) {
    const exists = await this.prismaRead.payslip.findFirst({
      where: { userId: dto.userId, period: dto.period },
    });
    if (exists) {
      throw new ConflictException(`Recibo de ${dto.period} já existe para este colaborador`);
    }

    const totals = this.computeTotals(dto);
    const code = this.generateReceiptCode(dto.userId, dto.period);

    return (this.prisma as any).payslip.create({
      data: {
        ...dto,
        receiptCode: code,
        grossSalary: totals.grossSalary,
        incomeTax: totals.incomeTax,
        socialSecurity: totals.socialSecurity,
        employerInss: totals.employerInss,
        totalDeductions: totals.totalDeductions,
        netSalary: totals.netSalary,
        irtBracketRate: totals.irtBracketRate,
        irtFormula: totals.irtFormula,
        status: 'DRAFT',
      },
      include: { user: { select: { id: true, fullName: true, employeeNumber: true } } },
    });
  }

  // ─── CRIAR EM MASSA ────────────────────────────────────────────────────────
  async bulkCreate(dto: BulkCreatePayslipDto) {
    const { period, paymentDate, userIds, issueImmediately = false } = dto;
    const where: any = { active: true };
    if (userIds?.length) where.id = { in: userIds };

    const users = await this.prismaRead.user.findMany({
      where,
      include: { position: true },
    });

    const results = { created: 0, skipped: 0, errors: [] as string[], period };

    for (const u of users) {
      try {
        const exists = await this.prismaRead.payslip.findFirst({
          where: { userId: u.id, period },
        });
        if (exists) {
          results.skipped++;
          continue;
        }

        const base = (u.position as any)?.baseSalary ?? 0;
        const totals = this.computeTotals({ baseSalary: base });
        const code = this.generateReceiptCode(u.id, period);

        const payslip = await (this.prisma as any).payslip.create({
          data: {
            userId: u.id,
            period,
            paymentDate,
            receiptCode: code,
            baseSalary: base,
            grossSalary: totals.grossSalary,
            incomeTax: totals.incomeTax,
            socialSecurity: totals.socialSecurity,
            employerInss: totals.employerInss,
            totalDeductions: totals.totalDeductions,
            netSalary: totals.netSalary,
            irtBracketRate: totals.irtBracketRate,
            irtFormula: totals.irtFormula,
            status: issueImmediately ? 'ISSUED' : 'DRAFT',
            issuedAt: issueImmediately ? new Date() : null,
          },
        });

        if (issueImmediately) {
          await this.prisma.notificationLog.create({
            data: {
              userId: u.id,
              type: 'PAYSLIP_ISSUED',
              message: `O seu recibo de ${period} está disponível.`,
              metadata: JSON.stringify({}),
            },
          });
        }

        results.created++;
      } catch (e) {
        results.errors.push(`User ${u.id}: ${e.message}`);
        this.logger.error(`Erro ao criar recibo para user ${u.id}: ${e.message}`);
      }
    }

    return results;
  }

  // ─── EMITIR (NOTIFICA) ─────────────────────────────────────────────────────
  async issue(id: number) {
    const p = await this.findOne(id);
    if (p.status === 'ISSUED' || p.status === 'ACKNOWLEDGED') {
      throw new ConflictException('Recibo já foi emitido');
    }

    const updated = await this.prisma.payslip.update({
      where: { id },
      data: { status: 'ISSUED', issuedAt: new Date() },
    });

    await this.prisma.notificationLog.create({
      data: {
        userId: updated.userId,
        type: 'PAYSLIP_ISSUED',
        message: `O seu recibo de ${updated.period} está disponível.`,
        metadata: JSON.stringify({}),
      },
    });

    return updated;
  }

  // ─── RECONHECER ────────────────────────────────────────────────────────────
  async acknowledge(id: number, userId: number) {
    const p = await this.findOne(id, userId, 'EMPLOYEE');
    if (p.status === 'ACKNOWLEDGED') return p;

    return this.prisma.payslip.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
  }

  // ─── ACTUALIZAR ────────────────────────────────────────────────────────────
  async update(id: number, dto: UpdatePayslipDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'ACKNOWLEDGED') {
      throw new ForbiddenException(
        'Não é possível editar um recibo já confirmado pelo colaborador',
      );
    }

    const merged = {
      baseSalary: dto.baseSalary ?? existing.baseSalary,
      mealAllowance: dto.mealAllowance ?? existing.mealAllowance,
      vacationAllowance: dto.vacationAllowance ?? existing.vacationAllowance,
      christmasAllowance: dto.christmasAllowance ?? existing.christmasAllowance,
      overtime: dto.overtime ?? existing.overtime,
      bonuses: dto.bonuses ?? existing.bonuses,
      otherAllowances: dto.otherAllowances ?? existing.otherAllowances,
      healthInsurance: dto.healthInsurance ?? existing.healthInsurance,
      loanDeduction: dto.loanDeduction ?? existing.loanDeduction,
      advanceDeduction: dto.advanceDeduction ?? existing.advanceDeduction,
      otherDeductions: dto.otherDeductions ?? existing.otherDeductions,
      irtOverride: dto.irtOverride,
      inssOverride: dto.inssOverride,
    };

    const totals = this.computeTotals(merged);

    return this.prisma.payslip.update({
      where: { id },
      data: {
        ...dto,
        grossSalary: totals.grossSalary,
        incomeTax: totals.incomeTax,
        socialSecurity: totals.socialSecurity,
        employerInss: totals.employerInss,
        totalDeductions: totals.totalDeductions,
        netSalary: totals.netSalary,
        irtBracketRate: totals.irtBracketRate,
        irtFormula: totals.irtFormula,
        status: 'DRAFT', // volta a draft ao editar
      },
    });
  }

  // ─── MEUS RECIBOS (colaborador) ────────────────────────────────────────────
  async getMyPayslips(userId: number, filters: PayslipFilterDto) {
    const { page = 1, limit = 12, year } = filters;
    const skip = (page - 1) * limit;

    const where: any = { userId, status: { not: 'DRAFT' } };
    if (year) where.period = { startsWith: year };

    const [data, total] = await Promise.all([
      (this.prisma as any).payslip.findMany({
        where,
        skip,
        take: limit,
        orderBy: { period: 'desc' },
        select: {
          id: true,
          receiptCode: true,
          period: true,
          paymentDate: true,
          netSalary: true,
          grossSalary: true,
          status: true,
          issuedAt: true,
          acknowledgedAt: true,
        },
      }),
      this.prismaRead.payslip.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── RESUMO ANUAL ──────────────────────────────────────────────────────────
  async annualSummary(userId: number, year: string) {
    const payslips = await this.prismaRead.payslip.findMany({
      where: { userId, period: { startsWith: year }, status: { not: 'DRAFT' } },
      orderBy: { period: 'asc' },
    });

    if (!payslips.length) {
      throw new NotFoundException(`Sem recibos para ${year}`);
    }

    const sum = (field: string) => payslips.reduce((acc, p) => acc + ((p as any)[field] ?? 0), 0);

    return {
      year,
      userId,
      months: payslips.length,
      totalGross: sum('grossSalary'),
      totalNet: sum('netSalary'),
      totalIRT: sum('incomeTax'),
      totalINSSEmployee: sum('socialSecurity'),
      totalINSSEmployer: sum('employerInss'),
      totalMealAllowance: sum('mealAllowance'),
      totalVacationAllowance: sum('vacationAllowance'),
      totalChristmasAllowance: sum('christmasAllowance'),
      totalBonuses: sum('bonuses'),
      totalDeductions: sum('totalDeductions'),
      monthlySeries: payslips.map(p => ({
        period: p.period,
        grossSalary: (p as any).grossSalary,
        netSalary: (p as any).netSalary,
        incomeTax: (p as any).incomeTax,
        socialSecurity: (p as any).socialSecurity,
      })),
    };
  }

  // ─── COMPARAÇÃO DE 2 MESES ─────────────────────────────────────────────────
  async compare(userId: number, periodA: string, periodB: string) {
    const [a, b] = await Promise.all([
      this.prismaRead.payslip.findFirst({ where: { userId, period: periodA } }),
      this.prismaRead.payslip.findFirst({ where: { userId, period: periodB } }),
    ]);

    if (!a) throw new NotFoundException(`Recibo de ${periodA} não encontrado`);
    if (!b) throw new NotFoundException(`Recibo de ${periodB} não encontrado`);

    const diff = (field: string) => {
      const va = (a as any)[field] ?? 0;
      const vb = (b as any)[field] ?? 0;
      return { a: va, b: vb, delta: vb - va, pct: va ? ((vb - va) / va) * 100 : null };
    };

    return {
      periodA,
      periodB,
      baseSalary: diff('baseSalary'),
      grossSalary: diff('grossSalary'),
      netSalary: diff('netSalary'),
      incomeTax: diff('incomeTax'),
      socialSecurity: diff('socialSecurity'),
      bonuses: diff('bonuses'),
      overtime: diff('overtime'),
      totalDeductions: diff('totalDeductions'),
    };
  }

  // ─── SIMULAÇÃO ─────────────────────────────────────────────────────────────
  simulate(dto: SimulatePayslipDto) {
    const totals = this.computeTotals(dto);
    const irtInfo = this.calcIRT(dto.baseSalary);

    return {
      input: dto,
      grossSalary: totals.grossSalary,
      incomeTax: totals.incomeTax,
      socialSecurity: totals.socialSecurity,
      employerInss: totals.employerInss,
      totalDeductions: totals.totalDeductions,
      netSalary: totals.netSalary,
      irtDetails: {
        bracket: irtInfo.bracket,
        formula: irtInfo.formula,
        effectiveRate: totals.grossSalary > 0 ? (totals.incomeTax / totals.grossSalary) * 100 : 0,
      },
    };
  }

  // ─── ABRIR DISPUTA ─────────────────────────────────────────────────────────
  async createDispute(payslipId: number, userId: number, dto: CreateDisputeDto) {
    const p = await this.findOne(payslipId, userId, 'EMPLOYEE');

    const dispute = await this.prisma.payslipDispute.create({
      data: { payslipId, userId, reason: dto.reason, details: dto.details, status: 'OPEN' },
    });

    await this.prisma.payslip.update({
      where: { id: payslipId },
      data: { status: 'DISPUTED' },
    });

    await this.prisma.notificationLog.create({
      data: {
        userId: p.userId,
        type: 'PAYSLIP_DISPUTE',
        message: `Disputa aberta para o recibo ${p.receiptCode}`,
        metadata: JSON.stringify({}),
      },
    });

    return dispute;
  }

  // ─── DASHBOARD RH ─────────────────────────────────────────────────────────
  async hrDashboard(period?: string) {
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);

    const [total, issued, acknowledged, disputed, notViewed] = await Promise.all([
      this.prismaRead.payslip.count({ where: { period: targetPeriod } }),
      this.prismaRead.payslip.count({ where: { period: targetPeriod, status: 'ISSUED' } }),
      this.prismaRead.payslip.count({ where: { period: targetPeriod, status: 'ACKNOWLEDGED' } }),
      this.prismaRead.payslip.count({ where: { period: targetPeriod, status: 'DISPUTED' } }),
      this.prismaRead.payslip.count({
        where: { period: targetPeriod, status: 'ISSUED', acknowledgedAt: null },
      }),
    ]);

    const agg = await this.prismaRead.payslip.aggregate({
      where: { period: targetPeriod },
      _sum: {
        grossSalary: true,
        netSalary: true,
        incomeTax: true,
        socialSecurity: true,
        employerInss: true,
      },
      _avg: { netSalary: true },
    });

    return {
      period: targetPeriod,
      counts: {
        total,
        issued,
        acknowledged,
        disputed,
        notViewed,
        draft: total - issued - acknowledged - disputed,
      },
      financials: {
        totalGross: agg._sum.grossSalary ?? 0,
        totalNet: agg._sum.netSalary ?? 0,
        totalIRT: agg._sum.incomeTax ?? 0,
        totalINSSEmployee: agg._sum.socialSecurity ?? 0,
        totalINSSEmployer: agg._sum.employerInss ?? 0,
        avgNet: agg._avg.netSalary ?? 0,
      },
      compliance: {
        viewRate: total > 0 ? ((acknowledged / total) * 100).toFixed(1) + '%' : '0%',
        pendingAcknowledgement: notViewed,
      },
    };
  }

  // ─── LOGS DE ACESSO ────────────────────────────────────────────────────────
  async getAccessLogs(payslipId: number) {
    return this.prismaRead.payslipAccessLog.findMany({
      where: { payslipId },
      orderBy: { accessedAt: 'desc' },
      take: 50,
    });
  }
}
