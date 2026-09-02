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
} from './payroll.dto';

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

    return this.prisma.$transaction(async tx => {
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
    return this.prisma.payslip.update({ where: { id: payslipId }, data: { runId: null } });
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
}
