// src/payslips/payroll-payments.service.ts
// Pagamentos (docs/payroll.md §7) e Fecho Salarial (§8).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { money } from '../taxes/money.util';
import { CreatePayrollPaymentDto, UpdatePaymentStatusDto } from '../payroll.dto';

type PaymentStatus = UpdatePaymentStatusDto['status'];

const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['PREPARED', 'CANCELLED'],
  PREPARED: ['SENT_TO_BANK', 'FAILED', 'CANCELLED'],
  SENT_TO_BANK: ['PROCESSED', 'FAILED', 'CANCELLED'],
  PROCESSED: ['PAID', 'FAILED'],
  PAID: [],
  FAILED: ['PENDING', 'CANCELLED'],
  CANCELLED: [],
};

const PAYABLE_RUN_STATES = ['APPROVED', 'PUBLISHED'];

function parseDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} inválida`);
  return d;
}

/** Só excepções de severidade ERROR bloqueiam o fecho (WARNING não bloqueia o submit nem o fecho). */
function hasBlockingException(p: { exceptions: unknown }): boolean {
  return (
    Array.isArray(p.exceptions) &&
    p.exceptions.some(e => (e as { severity?: string } | null)?.severity === 'ERROR')
  );
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

@Injectable()
export class PayrollPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Pagamentos ────────────────────────────────────────────────────────────

  async list(filter: { runId?: number; status?: string; period?: string }) {
    const where: Prisma.PayrollPaymentWhereInput = {};
    if (filter.runId) where.runId = filter.runId;
    if (filter.status) where.status = filter.status as Prisma.PayrollPaymentWhereInput['status'];
    if (filter.period) where.run = { period: filter.period };
    const rows = await this.prisma.read.payrollPayment.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 200,
      include: { run: { select: { period: true, payGroup: true } } },
    });
    const users = await this.userNames(rows.map(r => r.responsibleId));
    return rows.map(r => ({
      ...r,
      period: r.run.period,
      responsibleName: r.responsibleId ? (users.get(r.responsibleId) ?? null) : null,
    }));
  }

  async create(dto: CreatePayrollPaymentDto, actorId: number) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: dto.runId },
      include: { closure: true },
    });
    if (!run) throw new NotFoundException('PayrollRun não encontrado');
    if (!PAYABLE_RUN_STATES.includes(run.status))
      throw new ConflictException(
        `Só runs APPROVED/PUBLISHED podem ser pagos (actual: ${run.status}).`,
      );
    if (run.closure?.closedAt) throw new ConflictException('Folha fechada.');
    const active = await this.prisma.payrollPayment.count({
      where: { runId: run.id, status: { notIn: ['CANCELLED'] } },
    });
    if (active > 0) throw new ConflictException('Já existe um pagamento activo para este run.');

    const agg = await this.prisma.payslip.aggregate({
      where: { runId: run.id },
      _sum: { netSalary: true },
      _count: { _all: true },
    });
    if (!agg._count._all) throw new BadRequestException('O run não tem recibos.');

    const payment = await this.prisma.payrollPayment.create({
      data: {
        runId: run.id,
        bankName: dto.bankName ?? null,
        paymentAccount: dto.paymentAccount ?? null,
        employeeCount: agg._count._all,
        totalAmount: money(agg._sum.netSalary ?? 0),
        expectedDate:
          parseDate(dto.expectedDate, 'expectedDate') ?? run.expectedPaymentDate ?? null,
        responsibleId: actorId,
        reference: `PAG-${run.period.replace('-', '')}-${run.id}`,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'create',
      entity: 'PayrollPayment',
      entityId: payment.id,
      metadata: { runId: run.id, totalAmount: payment.totalAmount },
    });
    return payment;
  }

  async updateStatus(id: number, dto: UpdatePaymentStatusDto, actorId: number) {
    const payment = await this.prisma.payrollPayment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado');
    const from = payment.status as PaymentStatus;
    if (!TRANSITIONS[from].includes(dto.status))
      throw new ConflictException(`Transição inválida: ${from} → ${dto.status}.`);
    if (dto.status === 'FAILED' && !dto.errorMessage)
      throw new BadRequestException('Indique o motivo da falha (errorMessage).');
    if (dto.status === 'PREPARED' && !payment.bankFileGeneratedAt)
      throw new ConflictException('Gere o ficheiro bancário antes de marcar como Preparado.');

    const updated = await this.prisma.payrollPayment.update({
      where: { id },
      data: {
        status: dto.status,
        reference: dto.reference ?? undefined,
        errorMessage:
          dto.status === 'FAILED' ? dto.errorMessage : dto.status === 'PENDING' ? null : undefined,
        effectiveDate:
          dto.status === 'PAID'
            ? (parseDate(dto.effectiveDate, 'effectiveDate') ?? new Date())
            : undefined,
        responsibleId: actorId,
      },
    });
    if (dto.status === 'PAID') {
      // Reflecte a data efectiva nos recibos do run (paymentDate é AAAA-MM-DD).
      await this.prisma.payslip.updateMany({
        where: { runId: payment.runId },
        data: { paymentDate: (updated.effectiveDate ?? new Date()).toISOString().slice(0, 10) },
      });
    }
    await this.audit.log({
      userId: actorId,
      action: 'status',
      entity: 'PayrollPayment',
      entityId: id,
      metadata: { from, to: dto.status },
    });
    return updated;
  }

  /** Ficheiro bancário (CSV) com os colaboradores que têm NIB; lista os que não têm. */
  async bankFile(id: number, actorId: number) {
    const payment = await this.prisma.payrollPayment.findUnique({
      where: { id },
      include: { run: { select: { period: true } } },
    });
    if (!payment) throw new NotFoundException('Pagamento não encontrado');
    if (['CANCELLED', 'FAILED'].includes(payment.status))
      throw new ConflictException(`Pagamento em ${payment.status}.`);
    const payslips = await this.prisma.payslip.findMany({
      where: { runId: payment.runId },
      select: {
        netSalary: true,
        user: { select: { fullName: true, employeeNumber: true, nib: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });
    const lines = ['employee_number;full_name;nib;amount'];
    const missing: string[] = [];
    for (const p of payslips) {
      if (!p.user.nib) {
        missing.push(p.user.fullName);
        continue;
      }
      lines.push(
        [p.user.employeeNumber ?? '', p.user.fullName, p.user.nib, p.netSalary.toFixed(2)]
          .map(csvCell)
          .join(';'),
      );
    }
    await this.prisma.payrollPayment.update({
      where: { id },
      data: {
        bankFileGeneratedAt: new Date(),
        errorMessage: missing.length ? `Sem NIB: ${missing.length} colaborador(es)` : null,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'export',
      entity: 'PayrollPayment',
      entityId: id,
      metadata: { rows: lines.length - 1, missingNib: missing.length },
    });
    return {
      filename: `pagamento-${payment.run.period}-${id}.csv`,
      content: lines.join('\n'),
      rows: lines.length - 1,
      missingNib: missing,
    };
  }

  // ─── Fecho salarial ────────────────────────────────────────────────────────

  async closureOverview(runId: number) {
    const run = await this.prisma.read.payrollRun.findUnique({
      where: { id: runId },
      include: { closure: true, payments: true },
    });
    if (!run) throw new NotFoundException('PayrollRun não encontrado');
    const payslips = await this.prisma.read.payslip.findMany({
      where: { runId },
      select: {
        status: true,
        grossSalary: true,
        netSalary: true,
        incomeTax: true,
        socialSecurity: true,
        employerInss: true,
        totalEmployerCost: true,
        exceptions: true,
      },
    });
    const live = run.payments.filter(p => p.status !== 'CANCELLED');
    const checklist = [
      {
        code: 'EMPLOYEES_PROCESSED',
        label: 'Colaboradores processados',
        ok: payslips.length > 0 && !run.errorCount,
      },
      {
        code: 'EARNINGS_VERIFIED',
        label: 'Remunerações verificadas',
        ok: payslips.length > 0 && !payslips.some(hasBlockingException),
      },
      {
        code: 'DEDUCTIONS_VERIFIED',
        label: 'Deduções verificadas',
        ok: payslips.length > 0 && !payslips.some(hasBlockingException),
      },
      {
        code: 'INSS_CALCULATED',
        label: 'INSS calculado',
        ok: payslips.length > 0 && payslips.every(p => p.socialSecurity >= 0),
      },
      {
        code: 'IRT_CALCULATED',
        label: 'IRT calculado',
        ok: payslips.length > 0 && payslips.every(p => p.incomeTax >= 0),
      },
      {
        code: 'RECEIPTS_ISSUED',
        label: 'Recibos emitidos',
        ok: payslips.length > 0 && payslips.every(p => p.status !== 'DRAFT'),
      },
      {
        code: 'RUN_APPROVED',
        label: 'Folha aprovada',
        ok: PAYABLE_RUN_STATES.includes(run.status),
      },
      {
        code: 'PAYMENTS_PREPARED',
        label: 'Pagamentos preparados',
        ok: live.length > 0 && live.every(p => p.status !== 'PENDING'),
      },
      {
        code: 'PAYMENTS_DONE',
        label: 'Pagamentos concluídos',
        ok: live.length > 0 && live.every(p => p.status === 'PAID'),
      },
    ];
    const names = await this.userNames([
      run.closure?.hrValidatedById,
      run.closure?.financeValidatedById,
      run.closure?.closedById,
      run.approvedById,
    ]);
    const c = run.closure;
    return {
      runId,
      period: run.period,
      status: run.status,
      closed: !!c?.closedAt,
      hrValidation: c?.hrValidatedAt
        ? { at: c.hrValidatedAt, by: names.get(c.hrValidatedById ?? -1) ?? null }
        : null,
      financeValidation: c?.financeValidatedAt
        ? { at: c.financeValidatedAt, by: names.get(c.financeValidatedById ?? -1) ?? null }
        : null,
      approval: run.approvedAt
        ? { at: run.approvedAt, by: names.get(run.approvedById ?? -1) ?? null }
        : null,
      closedAt: c?.closedAt ?? null,
      closedBy: c?.closedById ? (names.get(c.closedById) ?? null) : null,
      totals: {
        employees: payslips.length,
        totalGross: money(payslips.reduce((a, p) => a + p.grossSalary, 0)),
        totalNet: money(payslips.reduce((a, p) => a + p.netSalary, 0)),
        totalTaxes: money(payslips.reduce((a, p) => a + p.incomeTax + p.socialSecurity, 0)),
        totalEmployerCharges: money(payslips.reduce((a, p) => a + p.employerInss, 0)),
        receiptsIssued: payslips.filter(p => p.status !== 'DRAFT').length,
        paymentsProcessed: live.filter(p => p.status === 'PAID').length,
      },
      checklist,
      canClose:
        checklist.every(i => i.ok) && !!c?.hrValidatedAt && !!c?.financeValidatedAt && !c?.closedAt,
    };
  }

  async validate(runId: number, kind: 'hr' | 'finance', actorId: number) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { closure: true },
    });
    if (!run) throw new NotFoundException('PayrollRun não encontrado');
    if (run.closure?.closedAt) throw new ConflictException('Folha já fechada.');
    if (!PAYABLE_RUN_STATES.includes(run.status))
      throw new ConflictException('A validação requer o run aprovado.');
    const now = new Date();
    const data =
      kind === 'hr'
        ? { hrValidatedAt: now, hrValidatedById: actorId }
        : { financeValidatedAt: now, financeValidatedById: actorId };
    await this.prisma.payrollClosure.upsert({
      where: { runId },
      update: data,
      create: { runId, ...data },
    });
    await this.audit.log({
      userId: actorId,
      action: `validate_${kind}`,
      entity: 'PayrollRun',
      entityId: runId,
      metadata: { period: run.period },
    });
    return this.closureOverview(runId);
  }

  async close(runId: number, actorId: number) {
    const overview = await this.closureOverview(runId);
    if (overview.closed) throw new ConflictException('Folha já fechada.');
    if (!overview.hrValidation || !overview.financeValidation)
      throw new ConflictException('Faltam as validações de RH e financeira.');
    const pending = overview.checklist.filter(i => !i.ok).map(i => i.label);
    if (pending.length) throw new ConflictException(`Checklist incompleta: ${pending.join('; ')}.`);
    await this.prisma.payrollClosure.update({
      where: { runId },
      data: { closedAt: new Date(), closedById: actorId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'close',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: { period: overview.period, totalNet: overview.totals.totalNet },
    });
    return this.closureOverview(runId);
  }

  /** Um run fechado fica protegido contra alterações normais. */
  async assertNotClosed(runId: number) {
    const closure = await this.prisma.payrollClosure.findUnique({
      where: { runId },
      select: { closedAt: true },
    });
    if (closure?.closedAt) throw new ConflictException('Folha fechada — alterações bloqueadas.');
  }

  private async userNames(ids: Array<number | null | undefined>) {
    const clean = [...new Set(ids.filter((i): i is number => typeof i === 'number'))];
    if (!clean.length) return new Map<number, string>();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: clean } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map(u => [u.id, u.fullName]));
  }
}
