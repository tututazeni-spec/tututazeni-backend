// src/payslips/payroll-workflow.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { AuditService } from '../common/services/audit.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { assertPayslipEditable } from './payslips.service';
import {
  CreatePayrollRunDto,
  RejectRunDto,
  CancelRunDto,
  RecalcPayslipInputsDto,
  PayrollRunFilterDto,
} from './payroll.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { money } from './money.util';

const EDIT_LOCKED = new Set(['APPROVED', 'PUBLISHED', 'CANCELLED']);

@Injectable()
export class PayrollWorkflowService {
  private readonly logger = new Logger(PayrollWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: PayrollCalculationService,
    private readonly audit: AuditService,
  ) {}

  private async loadRun(runId: number) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('PayrollRun não encontrado');
    return run;
  }

  private assertTransition(run: { status: string }, from: string[], action: string) {
    if (!from.includes(run.status)) {
      throw new ConflictException(
        `Transição inválida: '${action}' requer estado ${from.join('|')}, run está em ${run.status}.`,
      );
    }
  }

  private assertRunEditable(run: { status: string }) {
    if (EDIT_LOCKED.has(run.status)) {
      throw new ForbiddenException(`Run em ${run.status} é imutável.`);
    }
  }

  async createRun(dto: CreatePayrollRunDto, actorId: number) {
    const scope: Prisma.InputJsonValue = {};
    if (dto.departmentIds?.length)
      (scope as Record<string, unknown>).departmentIds = dto.departmentIds;
    if (dto.userIds?.length) (scope as Record<string, unknown>).userIds = dto.userIds;

    return this.prisma.payrollRun.create({
      data: {
        period: dto.period,
        countryCode: dto.countryCode ?? 'AO',
        taxYear: dto.taxYear ?? Number(dto.period.slice(0, 4)),
        payGroup: dto.payGroup ?? null,
        notes: dto.notes ?? null,
        scope: Object.keys(scope).length ? scope : Prisma.DbNull,
        status: 'DRAFT',
        createdById: actorId,
      },
    });
  }

  async process(runId: number, actorId: number) {
    const run = await this.loadRun(runId);
    // assertRunEditable primeiro: um run APPROVED/PUBLISHED/CANCELLED é imutável
    // (ForbiddenException) — só depois se avalia a validade da transição de estado.
    this.assertRunEditable(run);
    this.assertTransition(run, ['DRAFT', 'SIMULATED'], 'process');

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PROCESSING', processedById: actorId, processedAt: new Date() },
    });
    try {
      const snap = await this.calc.processRun(runId);
      return this.prisma.payrollRun.update({
        where: { id: runId },
        data: { status: 'SIMULATED', ...snap },
      });
    } catch (e) {
      await this.prisma.payrollRun.update({ where: { id: runId }, data: { status: 'DRAFT' } });
      throw e;
    }
  }

  async recalcPayslip(runId: number, payslipId: number, dto: RecalcPayslipInputsDto) {
    const run = await this.loadRun(runId);
    // assertRunEditable primeiro: um run APPROVED/PUBLISHED/CANCELLED é imutável
    // (ForbiddenException) — só depois se avalia a validade da transição de estado.
    this.assertRunEditable(run);
    this.assertTransition(run, ['SIMULATED'], 'recalc');

    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: { run: { select: { status: true } } },
    });
    if (!payslip || payslip.runId !== runId)
      throw new NotFoundException('Recibo não pertence a este run');
    assertPayslipEditable(payslip);

    const calc = await this.calc.calculatePayslip(
      { countryCode: run.countryCode, taxYear: run.taxYear, period: run.period },
      { id: payslip.userId },
      {
        absenceDays: dto.absenceDays,
        overtimeHours: dto.overtimeHours,
        bonusAmount: dto.bonusAmount,
        advanceDeduction: dto.advanceDeduction,
      },
    );

    const result = await this.prisma.$transaction(async tx => {
      await (tx as unknown as PrismaService).payslipItem.deleteMany({ where: { payslipId } });
      const updated = await (tx as unknown as PrismaService).payslip.update({
        where: { id: payslipId },
        data: { ...calc.data, runId } as unknown as Prisma.PayslipUncheckedUpdateInput,
      });
      if (calc.items.length) {
        await (tx as unknown as PrismaService).payslipItem.createMany({
          data: calc.items.map(i => ({ ...i, payslipId })),
        });
      }
      return updated;
    });
    // Efeito colateral: recompõe o snapshot do run a partir dos recibos actuais.
    await this.refreshRunSnapshot(runId);
    return result;
  }

  async excludePayslip(runId: number, payslipId: number) {
    const run = await this.loadRun(runId);
    // assertRunEditable primeiro: um run APPROVED/PUBLISHED/CANCELLED é imutável
    // (ForbiddenException) — só depois se avalia a validade da transição de estado.
    this.assertRunEditable(run);
    this.assertTransition(run, ['SIMULATED'], 'exclude');
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: { run: { select: { status: true } } },
    });
    if (!payslip || payslip.runId !== runId)
      throw new NotFoundException('Recibo não pertence a este run');
    assertPayslipEditable(payslip);
    const result = await this.prisma.payslip.update({
      where: { id: payslipId },
      data: { runId: null },
    });
    // Efeito colateral: recompõe o snapshot do run a partir dos recibos actuais.
    await this.refreshRunSnapshot(runId);
    return result;
  }

  async submit(runId: number, actorId: number) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['SIMULATED'], 'submit');
    if ((run.errorCount ?? 0) > 0) {
      throw new ConflictException(
        `Run tem ${run.errorCount} exceção(ões) de erro — resolver antes de submeter.`,
      );
    }
    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PENDING_APPROVAL', submittedById: actorId, submittedAt: new Date() },
    });
  }

  async approve(runId: number, actor: { id: number }) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['PENDING_APPROVAL'], 'approve');
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'approve',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: {
        period: run.period,
        payGroup: run.payGroup,
        employeeCount: run.employeeCount,
        totalNet: run.totalNet,
        submittedById: run.submittedById,
        approvedById: actor.id,
      },
    });
    return updated;
  }

  async reject(runId: number, actorId: number, dto: RejectRunDto) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['PENDING_APPROVAL'], 'reject');
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'SIMULATED', rejectionReason: dto.reason },
    });
    await this.audit.log({
      userId: actorId,
      action: 'reject',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: { period: run.period, reason: dto.reason },
    });
    return updated;
  }

  async publish(runId: number, actor: { id: number }) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['APPROVED'], 'publish');

    const payslips = await this.prisma.payslip.findMany({
      where: { runId, status: 'DRAFT' },
      select: { id: true, userId: true, period: true },
    });

    const CHUNK = 200;
    for (let i = 0; i < payslips.length; i += CHUNK) {
      const ids = payslips.slice(i, i + CHUNK).map(p => p.id);
      await this.prisma.payslip.updateMany({
        where: { id: { in: ids }, runId, status: 'DRAFT' },
        data: { status: 'ISSUED', issuedAt: new Date() },
      });
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PUBLISHED', publishedById: actor.id, publishedAt: new Date() },
    });

    // PDF é adicionado na Fase 4. Aqui só notificamos.
    for (const p of payslips) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: p.userId,
        type: 'PAYSLIP_ISSUED',
        message: `O seu recibo de ${p.period} está disponível.`,
      });
    }

    await this.audit.log({
      userId: actor.id,
      action: 'publish',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: {
        period: run.period,
        payGroup: run.payGroup,
        employeeCount: run.employeeCount,
        totalNet: run.totalNet,
        approvedById: run.approvedById,
        publishedById: actor.id,
      },
    });
    return updated;
  }

  async cancel(runId: number, actorId: number, dto: CancelRunDto) {
    const run = await this.loadRun(runId);
    if (run.status === 'PUBLISHED') {
      throw new ConflictException('Run publicado não pode ser cancelado.');
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', cancellationReason: dto.reason },
    });
    await this.audit.log({
      userId: actorId,
      action: 'cancel',
      entity: 'PayrollRun',
      entityId: runId,
      metadata: { period: run.period, reason: dto.reason },
    });
    return updated;
  }

  // ─── Leituras ──────────────────────────────────────────────────────────────

  async list(filter: PayrollRunFilterDto) {
    const { page = 1, limit = 20, period, status, payGroup } = filter;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.PayrollRunWhereInput = {};
    if (period) where.period = period;
    if (status) where.status = status as Prisma.PayrollRunWhereInput['status'];
    if (payGroup) where.payGroup = payGroup;
    const [data, total] = await Promise.all([
      this.prisma.read.payrollRun.findMany({
        where,
        skip,
        take,
        orderBy: [{ period: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.read.payrollRun.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async getRun(runId: number) {
    const run = await this.loadRun(runId);
    const ids = [
      run.createdById,
      run.processedById,
      run.submittedById,
      run.approvedById,
      run.publishedById,
    ].filter((x): x is number => typeof x === 'number');
    const users = ids.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullName: true },
        })
      : [];
    const byId = new Map(users.map(u => [u.id, u]));
    const step = (name: string, at: Date | null, uid: number | null) => ({
      step: name,
      at,
      by: uid != null ? (byId.get(uid) ?? null) : null,
    });
    return {
      ...run,
      timeline: [
        step('created', run.createdAt, run.createdById),
        step('processed', run.processedAt, run.processedById),
        step('submitted', run.submittedAt, run.submittedById),
        step('approved', run.approvedAt, run.approvedById),
        step('published', run.publishedAt, run.publishedById),
      ],
    };
  }

  async listPayslips(runId: number, filter: PayrollRunFilterDto) {
    const { page = 1, limit = 50 } = filter;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.PayslipWhereInput = { runId };
    const [data, total] = await Promise.all([
      this.prisma.read.payslip.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, fullName: true, employeeNumber: true } },
          items: true,
        },
        orderBy: { user: { fullName: 'asc' } },
      }),
      this.prisma.read.payslip.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async listExceptions(runId: number) {
    const rows = await this.prisma.read.payslip.findMany({
      where: { runId, hasExceptions: true },
      select: { id: true, userId: true, exceptions: true, user: { select: { fullName: true } } },
    });
    const out: Array<{
      payslipId: number;
      userId: number;
      fullName: string;
      code: string;
      severity: string;
      message: string;
    }> = [];
    for (const r of rows) {
      const list = Array.isArray(r.exceptions)
        ? (r.exceptions as unknown as Array<Record<string, string>>)
        : [];
      for (const e of list) {
        out.push({
          payslipId: r.id,
          userId: r.userId,
          fullName: r.user?.fullName ?? '—',
          code: e.code,
          severity: e.severity,
          message: e.message,
        });
      }
    }
    return out;
  }

  /** Recompõe employeeCount/exceptionsCount/errorCount/totais do run a partir dos recibos actuais. */
  async refreshRunSnapshot(runId: number) {
    const payslips = await this.prisma.read.payslip.findMany({
      where: { runId },
      select: {
        grossSalary: true,
        netSalary: true,
        totalDeductions: true,
        totalEmployerCost: true,
        exceptions: true,
        hasExceptions: true,
      },
    });
    let exceptionsCount = 0;
    let errorCount = 0;
    let totalGross = 0;
    let totalNet = 0;
    let totalDeductions = 0;
    let totalEmployerCost = 0;
    for (const p of payslips) {
      const list = Array.isArray(p.exceptions)
        ? (p.exceptions as unknown as Array<{ severity: string }>)
        : [];
      exceptionsCount += list.length;
      if (list.some(e => e.severity === 'ERROR')) errorCount += 1;
      totalGross += p.grossSalary ?? 0;
      totalNet += p.netSalary ?? 0;
      totalDeductions += p.totalDeductions ?? 0;
      totalEmployerCost += p.totalEmployerCost ?? 0;
    }
    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        employeeCount: payslips.length,
        exceptionsCount,
        errorCount,
        totalGross: money(totalGross),
        totalNet: money(totalNet),
        totalDeductions: money(totalDeductions),
        totalEmployerCost: money(totalEmployerCost),
      },
    });
  }
}
