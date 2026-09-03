// src/payslips/payslips.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PayslipAccessAction } from '@prisma/client';
import {
  CreatePayslipDto,
  UpdatePayslipDto,
  PayslipFilterDto,
  BulkCreatePayslipDto,
  SimulatePayslipDto,
  CreateDisputeDto,
  DisputeFilterDto,
  ResolveDisputeDto,
} from './payslips.dto';
import { randomBytes } from 'crypto';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';

// ─── Validação de editabilidade de recibos ─────────────────────────────────
const LOCKED_PAYSLIP_STATUSES = new Set(['ISSUED', 'ACKNOWLEDGED', 'DISPUTED']);

/** Recibo imutável quando já emitido/confirmado/em-disputa, ou quando o seu run está PUBLISHED. */
export function assertPayslipEditable(payslip: {
  status: string;
  run?: { status: string } | null;
}): void {
  if (LOCKED_PAYSLIP_STATUSES.has(payslip.status) || payslip.run?.status === 'PUBLISHED') {
    throw new ForbiddenException('Recibo não editável no estado actual');
  }
}

// ─── Tabela IRT Angola 2026 (Lei nº 26/2020 + actualização 2026) ─────────────
// Isenção até 150.000 Kz/mês (Portaria 2026)
export interface IrtBracket {
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

// Campos monetários de Payslip usados dinamicamente por sum()/diff() abaixo
// — em vez de `(p as any)[field]`, agora restrito às chaves reais do modelo.
type PayslipAmountField =
  | 'baseSalary'
  | 'mealAllowance'
  | 'vacationAllowance'
  | 'christmasAllowance'
  | 'overtime'
  | 'bonuses'
  | 'otherAllowances'
  | 'grossSalary'
  | 'netSalary'
  | 'incomeTax'
  | 'socialSecurity'
  | 'employerInss'
  | 'totalDeductions';

// Colunas monetárias exportadas no resumo anual (CSV/PDF). Subconjunto de
// PayslipAmountField, mantido como tuple `as const` para derivar os tipos das
// linhas/totais e para o controlador iterar as colunas sem strings soltas.
export const ANNUAL_EXPORT_FIELDS = [
  'baseSalary',
  'mealAllowance',
  'vacationAllowance',
  'christmasAllowance',
  'bonuses',
  'overtime',
  'otherAllowances',
  'grossSalary',
  'incomeTax',
  'socialSecurity',
  'totalDeductions',
  'netSalary',
] as const;
export type AnnualExportField = (typeof ANNUAL_EXPORT_FIELDS)[number];
export interface AnnualExport {
  year: string;
  userId: number;
  months: number;
  rows: Array<{ period: string } & Record<AnnualExportField, number>>;
  totals: Record<AnnualExportField, number>;
}

@Injectable()
export class PayslipsService {
  private readonly logger = new Logger(PayslipsService.name);

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
  async logAccess(payslipId: number, userId: number, action: PayslipAccessAction, ip?: string) {
    try {
      await this.prisma.payslipAccessLog.create({
        data: { payslipId, userId, action, ipAddress: ip ?? 'unknown', accessedAt: new Date() },
      });
    } catch (e: unknown) {
      this.logger.warn({
        payslipId,
        userId,
        action,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar log de acesso ao recibo',
      });
    }
  }

  // ─── LISTAGEM (ADMIN / RH) ─────────────────────────────────────────────────
  async findAll(filters: PayslipFilterDto) {
    const { page = 1, limit = 20, userId, period, year, status } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.PayslipWhereInput = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (period) where.period = period;
    if (year && !period) where.period = { startsWith: year };

    const [data, total] = await Promise.all([
      this.prisma.read.payslip.findMany({
        where,
        skip,
        take,
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
      this.prisma.read.payslip.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── DETALHE ───────────────────────────────────────────────────────────────
  async findOne(id: number, user?: CurrentUserData) {
    const p = await this.prisma.payslip.findUnique({
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
        disputes: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });

    // Ownership ao nível do dado (A3-1): dono OU ADMIN/RH; senão 404.
    // Quando chamado sem user (contexto interno de confiança), não filtra.
    if (user) assertCanAccess(p, p?.userId, user, [Role.ADMIN, Role.RH]);
    else if (!p) throw new NotFoundException('Recibo não encontrado');

    return p;
  }

  // ─── CRIAR INDIVIDUAL ──────────────────────────────────────────────────────
  async create(dto: CreatePayslipDto) {
    const exists = await this.prisma.payslip.findFirst({
      where: { userId: dto.userId, period: dto.period },
    });
    if (exists) {
      throw new ConflictException(`Recibo de ${dto.period} já existe para este colaborador`);
    }

    const totals = this.computeTotals(dto);
    const code = this.generateReceiptCode(dto.userId, dto.period);

    return this.prisma.payslip.create({
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
    const where: Prisma.UserWhereInput = { active: true };
    if (userIds?.length) where.id = { in: userIds };

    const users = await this.prisma.read.user.findMany({ where });

    const results = { created: 0, skipped: 0, errors: [] as string[], period };

    for (const u of users) {
      try {
        const exists = await this.prisma.payslip.findFirst({
          where: { userId: u.id, period },
        });
        if (exists) {
          results.skipped++;
          continue;
        }

        // Achado real: `(u.position as any)?.baseSalary` — Position NÃO tem
        // (nunca teve) coluna `baseSalary` no schema real (só salaryMin/
        // salaryMax); esta expressão avaliava sempre `undefined ?? 0`, ou
        // seja todos os recibos gerados em massa saíam sempre com
        // baseSalary=0 (e, em cascata, grossSalary/incomeTax/netSalary
        // também errados) — mascarado pelo `any`, nunca apanhado pelos
        // testes unitários porque o mock da suite também inventa
        // `position.baseSalary`. O dado real de salário-base por
        // colaborador vive em EmployeeCompensation (mesmo modelo usado por
        // payroll-engine.service.ts#loadEmployeeCompensation).
        const compensation = await this.prisma.read.employeeCompensation.findFirst({
          where: {
            userId: u.id,
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          },
          orderBy: { effectiveFrom: 'desc' },
        });
        const base = compensation?.baseSalary ?? 0;
        const totals = this.computeTotals({ baseSalary: base });
        const code = this.generateReceiptCode(u.id, period);

        const payslip = await this.prisma.payslip.create({
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
          await createNotificationSafe(this.prisma, this.logger, {
            userId: u.id,
            type: 'PAYSLIP_ISSUED',
            message: `O seu recibo de ${period} está disponível.`,
          });
        }

        results.created++;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        results.errors.push(`User ${u.id}: ${message}`);
        this.logger.error({
          userId: u.id,
          period,
          err: { message },
          msg: 'Falha ao criar recibo em massa para utilizador',
        });
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

    await createNotificationSafe(this.prisma, this.logger, {
      userId: updated.userId,
      type: 'PAYSLIP_ISSUED',
      message: `O seu recibo de ${updated.period} está disponível.`,
    });

    return updated;
  }

  // ─── RECONHECER ────────────────────────────────────────────────────────────
  async acknowledge(id: number, user: CurrentUserData) {
    const p = await this.findOne(id, user);
    if (p.status === 'ACKNOWLEDGED') return p;

    return this.prisma.payslip.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
  }

  // ─── ACTUALIZAR ────────────────────────────────────────────────────────────
  async update(id: number, dto: UpdatePayslipDto) {
    const existing = await this.prisma.payslip.findUnique({
      where: { id },
      include: { run: { select: { status: true } } },
    });
    if (!existing) throw new NotFoundException('Recibo não encontrado');
    assertPayslipEditable(existing);

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
    // limit por omissão é 12 (não 20) — comportamento pré-existente deste
    // endpoint, preservado explicitamente aqui em vez de herdar o omissão do helper.
    const { page = 1, limit = 12, year } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.PayslipWhereInput = { userId, status: { not: 'DRAFT' } };
    if (year) where.period = { startsWith: year };

    const [data, total] = await Promise.all([
      this.prisma.read.payslip.findMany({
        where,
        skip,
        take,
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
      this.prisma.read.payslip.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── RESUMO ANUAL ──────────────────────────────────────────────────────────
  // Um ano sem recibos NÃO é um erro (404) — é um resumo a zeros. Isto alinha
  // com getMyPayslips, que devolve uma página vazia em vez de rebentar, e evita
  // que a vista "Resumo anual" do frontend mostre "recurso não encontrado"
  // quando o colaborador ainda não tem recibos emitidos no ano seleccionado.
  async annualSummary(userId: number, year: string) {
    const payslips = await this.prisma.read.payslip.findMany({
      where: { userId, period: { startsWith: year }, status: { not: 'DRAFT' } },
      orderBy: { period: 'asc' },
    });

    const sum = (field: PayslipAmountField) =>
      payslips.reduce((acc, p) => acc + (p[field] ?? 0), 0);

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
        grossSalary: p.grossSalary,
        netSalary: p.netSalary,
        incomeTax: p.incomeTax,
        socialSecurity: p.socialSecurity,
      })),
    };
  }

  // ─── EXPORTAÇÃO DO RESUMO ANUAL (dados p/ CSV ou PDF) ─────────────────────
  // Devolve dados estruturados com todas as colunas monetárias; a serialização
  // (CSV/PDF) fica no controlador. Um ano sem recibos devolve rows vazio +
  // totais a zero, tal como annualSummary — nunca 404.
  async buildAnnualExport(userId: number, year: string): Promise<AnnualExport> {
    const payslips = await this.prisma.read.payslip.findMany({
      where: { userId, period: { startsWith: year }, status: { not: 'DRAFT' } },
      orderBy: { period: 'asc' },
    });

    const rows = payslips.map(p => {
      const row = { period: p.period } as { period: string } & Record<AnnualExportField, number>;
      for (const f of ANNUAL_EXPORT_FIELDS) row[f] = p[f] ?? 0;
      return row;
    });

    const totals = {} as Record<AnnualExportField, number>;
    for (const f of ANNUAL_EXPORT_FIELDS) {
      totals[f] = payslips.reduce((acc, p) => acc + (p[f] ?? 0), 0);
    }

    return { year, userId, months: payslips.length, rows, totals };
  }

  // ─── COMPARAÇÃO DE 2 MESES ─────────────────────────────────────────────────
  async compare(userId: number, periodA: string, periodB: string) {
    const [a, b] = await Promise.all([
      this.prisma.read.payslip.findFirst({ where: { userId, period: periodA } }),
      this.prisma.read.payslip.findFirst({ where: { userId, period: periodB } }),
    ]);

    if (!a) throw new NotFoundException(`Recibo de ${periodA} não encontrado`);
    if (!b) throw new NotFoundException(`Recibo de ${periodB} não encontrado`);

    const diff = (field: PayslipAmountField) => {
      const va = a[field] ?? 0;
      const vb = b[field] ?? 0;
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
  async createDispute(payslipId: number, user: CurrentUserData, dto: CreateDisputeDto) {
    const p = await this.findOne(payslipId, user);

    const dispute = await this.prisma.payslipDispute.create({
      data: {
        payslipId,
        userId: user.id,
        reason: dto.reason,
        details: dto.details,
        status: 'OPEN',
      },
    });

    await this.prisma.payslip.update({
      where: { id: payslipId },
      data: { status: 'DISPUTED' },
    });

    await createNotificationSafe(this.prisma, this.logger, {
      userId: p.userId,
      type: 'PAYSLIP_DISPUTE',
      message: `Disputa aberta para o recibo ${p.receiptCode}`,
    });

    return dispute;
  }

  // ─── LISTAR DISPUTAS (ADMIN / RH) ─────────────────────────────────────────
  async listDisputes(filters: DisputeFilterDto) {
    const { page = 1, limit = 20, status, userId } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.PayslipDisputeWhereInput = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const [data, total] = await Promise.all([
      this.prisma.read.payslipDispute.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          payslip: {
            select: { id: true, period: true, receiptCode: true, status: true },
          },
          user: { select: { id: true, fullName: true, employeeNumber: true } },
        },
      }),
      this.prisma.read.payslipDispute.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── RESOLVER DISPUTA (ADMIN / RH) ───────────────────────────────────────
  // `reissue: true` → recibo volta a ISSUED (correcção aplicada e reemitida);
  // caso contrário o recibo mantém-se DISPUTED (resolução sem alteração de valor).
  async resolveDispute(disputeId: number, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.payslipDispute.findUnique({
      where: { id: disputeId },
    });
    if (!dispute) throw new NotFoundException('Disputa não encontrada');
    if (dispute.status === 'RESOLVED') {
      throw new ConflictException('Disputa já foi resolvida');
    }

    const updated = await this.prisma.payslipDispute.update({
      where: { id: disputeId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolution: dto.resolution,
      },
    });

    if (dto.reissue) {
      await this.prisma.payslip.update({
        where: { id: dispute.payslipId },
        data: { status: 'ISSUED', issuedAt: new Date() },
      });
    }

    await createNotificationSafe(this.prisma, this.logger, {
      userId: dispute.userId,
      type: 'PAYSLIP_DISPUTE',
      message: dto.reissue
        ? 'A sua disputa foi resolvida e o recibo foi reemitido.'
        : 'A sua disputa foi resolvida.',
    });

    return updated;
  }

  // ─── DASHBOARD RH ─────────────────────────────────────────────────────────
  async hrDashboard(period?: string) {
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);

    const [total, issued, acknowledged, disputed, notViewed] = await Promise.all([
      this.prisma.read.payslip.count({ where: { period: targetPeriod } }),
      this.prisma.read.payslip.count({ where: { period: targetPeriod, status: 'ISSUED' } }),
      this.prisma.read.payslip.count({ where: { period: targetPeriod, status: 'ACKNOWLEDGED' } }),
      this.prisma.read.payslip.count({ where: { period: targetPeriod, status: 'DISPUTED' } }),
      this.prisma.read.payslip.count({
        where: { period: targetPeriod, status: 'ISSUED', acknowledgedAt: null },
      }),
    ]);

    const agg = await this.prisma.read.payslip.aggregate({
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
    return this.prisma.read.payslipAccessLog.findMany({
      where: { payslipId },
      orderBy: { accessedAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
  }
}
