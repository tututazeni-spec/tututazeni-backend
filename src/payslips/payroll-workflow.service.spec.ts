import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PayrollWorkflowService } from './payroll-workflow.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PayrollWorkflowService transitions', () => {
  let svc: PayrollWorkflowService;
  let prisma: any;
  let calc: any;
  let audit: any;

  const run = (over: Partial<any> = {}) => ({
    id: 1,
    period: '2026-09',
    payGroup: 'Mensais',
    status: 'DRAFT',
    countryCode: 'AO',
    taxYear: 2026,
    scope: {},
    errorCount: 0,
    employeeCount: 3,
    totalNet: 300000,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      payrollRun: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(run()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(run(data))),
      },
      payslip: {
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (cb: any) =>
        typeof cb === 'function' ? cb(prisma) : Promise.all(cb),
      ),
    };
    calc = {
      processRun: jest.fn().mockResolvedValue({
        employeeCount: 3,
        exceptionsCount: 0,
        errorCount: 0,
        totalGross: 0,
        totalNet: 300000,
        totalDeductions: 0,
        totalEmployerCost: 0,
      }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const mod = await Test.createTestingModule({
      providers: [
        PayrollWorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayrollCalculationService, useValue: calc },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    svc = mod.get(PayrollWorkflowService);
  });

  it('process: DRAFT -> SIMULATED, delegates to calc.processRun', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'DRAFT' }));
    await svc.process(1, 99);
    expect(calc.processRun).toHaveBeenCalledWith(1);
    const statuses = prisma.payrollRun.update.mock.calls.map((c: any) => c[0].data.status);
    expect(statuses).toContain('SIMULATED');
  });

  it('process: rejects an APPROVED run', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'APPROVED' }));
    await expect(svc.process(1, 99)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('submit: SIMULATED -> PENDING_APPROVAL', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'SIMULATED', errorCount: 0 }));
    await svc.submit(1, 99);
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_APPROVAL', submittedById: 99 }),
      }),
    );
  });

  it('submit: 409 when errorCount > 0', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'SIMULATED', errorCount: 2 }));
    await expect(svc.submit(1, 99)).rejects.toBeInstanceOf(ConflictException);
  });

  it('approve: PENDING_APPROVAL -> APPROVED + audit', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'PENDING_APPROVAL' }));
    await svc.approve(1, { id: 7 });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', approvedById: 7 }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'approve', entity: 'PayrollRun', entityId: 1, userId: 7 }),
    );
  });

  it('approve: 409 when not submitted', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'SIMULATED' }));
    await expect(svc.approve(1, { id: 7 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('publish: APPROVED -> PUBLISHED, issues payslips + audit', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'APPROVED' }));
    prisma.payslip.findMany.mockResolvedValue([
      { id: 10, userId: 1, period: '2026-09', status: 'DRAFT' },
    ]);
    await svc.publish(1, { id: 7 });
    expect(prisma.payslip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ runId: 1, status: 'DRAFT' }),
        data: expect.objectContaining({ status: 'ISSUED' }),
      }),
    );
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PUBLISHED', publishedById: 7 }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'publish' }));
  });

  it('publish: 409 when not approved', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'PENDING_APPROVAL' }));
    await expect(svc.publish(1, { id: 7 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('reject: PENDING_APPROVAL -> SIMULATED with reason + audit', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'PENDING_APPROVAL' }));
    await svc.reject(1, 7, { reason: 'valores errados' });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SIMULATED', rejectionReason: 'valores errados' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject' }));
  });

  it('cancel: any non-PUBLISHED -> CANCELLED + audit; PUBLISHED -> 409', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'SIMULATED' }));
    await svc.cancel(1, 7, { reason: 'engano' });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED', cancellationReason: 'engano' }),
      }),
    );
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'PUBLISHED' }));
    await expect(svc.cancel(1, 7, { reason: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });
});
