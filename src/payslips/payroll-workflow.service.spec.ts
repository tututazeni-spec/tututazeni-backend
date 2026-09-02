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

describe('PayrollWorkflowService reads', () => {
  let svc: PayrollWorkflowService;
  let prisma: any;
  let calc: any;
  let audit: any;

  const baseRun = (over: Partial<any> = {}) => ({
    id: 1,
    period: '2026-09',
    payGroup: 'Mensais',
    status: 'SIMULATED',
    countryCode: 'AO',
    taxYear: 2026,
    scope: {},
    errorCount: 1,
    exceptionsCount: 2,
    employeeCount: 3,
    totalGross: 0,
    totalNet: 300000,
    totalDeductions: 0,
    totalEmployerCost: 0,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    processedAt: new Date('2026-09-02T10:00:00.000Z'),
    submittedAt: new Date('2026-09-03T10:00:00.000Z'),
    approvedAt: null,
    publishedAt: null,
    createdById: 10,
    processedById: 11,
    submittedById: 10,
    approvedById: null,
    publishedById: null,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      payrollRun: {
        findUnique: jest.fn().mockResolvedValue(baseRun()),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...baseRun(), ...data })),
      },
      payslip: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payslipItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) =>
        typeof cb === 'function' ? cb(prisma) : Promise.all(cb),
      ),
      read: {
        payrollRun: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        user: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        payslip: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      },
    };
    calc = { calculatePayslip: jest.fn() };
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

  describe('getRun', () => {
    it('resolves actor names into the timeline via a single user.findMany', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(
        baseRun({
          createdById: 10,
          processedById: 11,
          submittedById: 10,
          approvedById: null,
          publishedById: null,
        }),
      );
      prisma.read.user.findMany.mockResolvedValue([
        { id: 10, fullName: 'Ana Gestora' },
        { id: 11, fullName: 'Bruno Processador' },
      ]);

      const res: any = await svc.getRun(1);

      expect(prisma.read.user.findMany).toHaveBeenCalledTimes(1);
      const arg = prisma.read.user.findMany.mock.calls[0][0];
      expect(arg.select).toEqual({ id: true, fullName: true });
      expect(arg.where.id.in).toEqual(expect.arrayContaining([10, 11]));

      expect(res.timeline.map((t: any) => t.step)).toEqual([
        'created',
        'processed',
        'submitted',
        'approved',
        'published',
      ]);
      const created = res.timeline.find((t: any) => t.step === 'created');
      const processed = res.timeline.find((t: any) => t.step === 'processed');
      const submitted = res.timeline.find((t: any) => t.step === 'submitted');
      const approved = res.timeline.find((t: any) => t.step === 'approved');
      const published = res.timeline.find((t: any) => t.step === 'published');

      expect(created.by).toEqual({ id: 10, fullName: 'Ana Gestora' });
      expect(processed.by).toEqual({ id: 11, fullName: 'Bruno Processador' });
      expect(submitted.by).toEqual({ id: 10, fullName: 'Ana Gestora' });
      expect(approved.by).toBeNull();
      expect(approved.at).toBeNull();
      expect(published.by).toBeNull();
      expect(published.at).toBeNull();
    });

    it('does not query users when there are no actor ids', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(
        baseRun({
          createdById: null,
          processedById: null,
          submittedById: null,
          approvedById: null,
          publishedById: null,
        }),
      );

      const res: any = await svc.getRun(1);

      expect(prisma.read.user.findMany).not.toHaveBeenCalled();
      expect(res.timeline.every((t: any) => t.by === null)).toBe(true);
    });
  });

  describe('listExceptions', () => {
    it('flattens the exceptions JSON of two payslips into 3 rows with fullName filled', async () => {
      prisma.read.payslip.findMany.mockResolvedValue([
        {
          id: 100,
          userId: 5,
          exceptions: [
            { code: 'NEGATIVE_NET', severity: 'ERROR', message: 'Líquido negativo' },
            { code: 'MISSING_BANK_DETAILS', severity: 'WARNING', message: 'Sem IBAN' },
          ],
          user: { fullName: 'Carlos Silva' },
        },
        {
          id: 101,
          userId: 6,
          exceptions: [{ code: 'NO_COMPENSATION', severity: 'ERROR', message: 'Sem compensação' }],
          user: { fullName: 'Diana Costa' },
        },
      ]);

      const rows = await svc.listExceptions(1);

      expect(prisma.read.payslip.findMany).toHaveBeenCalledWith({
        where: { runId: 1, hasExceptions: true },
        select: {
          id: true,
          userId: true,
          exceptions: true,
          user: { select: { fullName: true } },
        },
      });
      expect(rows).toHaveLength(3);
      expect(rows).toEqual([
        {
          payslipId: 100,
          userId: 5,
          fullName: 'Carlos Silva',
          code: 'NEGATIVE_NET',
          severity: 'ERROR',
          message: 'Líquido negativo',
        },
        {
          payslipId: 100,
          userId: 5,
          fullName: 'Carlos Silva',
          code: 'MISSING_BANK_DETAILS',
          severity: 'WARNING',
          message: 'Sem IBAN',
        },
        {
          payslipId: 101,
          userId: 6,
          fullName: 'Diana Costa',
          code: 'NO_COMPENSATION',
          severity: 'ERROR',
          message: 'Sem compensação',
        },
      ]);
      expect(rows.every(r => !!r.fullName)).toBe(true);
    });
  });

  describe('list', () => {
    it('builds where from filters and returns a paginated response ordered period desc, id desc', async () => {
      const runs = [baseRun({ id: 2, period: '2026-09' }), baseRun({ id: 1, period: '2026-08' })];
      prisma.read.payrollRun.findMany.mockResolvedValue(runs);
      prisma.read.payrollRun.count.mockResolvedValue(2);

      const res = await svc.list({
        page: 1,
        limit: 20,
        status: 'SIMULATED',
        period: '2026-09',
      } as any);

      expect(prisma.read.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { period: '2026-09', status: 'SIMULATED' },
          skip: 0,
          take: 20,
          orderBy: [{ period: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(res).toEqual({
        data: runs,
        meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
      });
    });
  });

  describe('listPayslips', () => {
    it('paginates run payslips with user + items includes, ordered by user.fullName asc, default limit 50', async () => {
      const ps = [{ id: 1 }, { id: 2 }];
      prisma.read.payslip.findMany.mockResolvedValue(ps);
      prisma.read.payslip.count.mockResolvedValue(2);

      const res = await svc.listPayslips(7, {} as any);

      expect(prisma.read.payslip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { runId: 7 },
          skip: 0,
          take: 50,
          include: {
            user: { select: { id: true, fullName: true, employeeNumber: true } },
            items: true,
          },
          orderBy: { user: { fullName: 'asc' } },
        }),
      );
      expect(res.meta).toEqual({ total: 2, page: 1, limit: 50, totalPages: 1 });
      expect(res.data).toBe(ps);
    });
  });

  describe('refreshRunSnapshot side effects', () => {
    it('recalcPayslip refreshes the run snapshot with errorCount 0 once the only ERROR is cleared', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(baseRun({ status: 'SIMULATED' }));
      prisma.payslip.findUnique.mockResolvedValue({
        id: 100,
        runId: 1,
        userId: 5,
        status: 'DRAFT',
        run: { status: 'SIMULATED' },
      });
      calc.calculatePayslip.mockResolvedValue({
        data: {
          grossSalary: 200000,
          netSalary: 180000,
          totalDeductions: 20000,
          totalEmployerCost: 210000,
          hasExceptions: false,
          exceptions: [],
        },
        items: [],
      });
      prisma.payslip.update.mockResolvedValue({ id: 100, netSalary: 180000 });
      // após o recalc, os recibos persistidos do run já não têm exceções ERROR
      prisma.read.payslip.findMany.mockResolvedValue([
        {
          grossSalary: 200000,
          netSalary: 180000,
          totalDeductions: 20000,
          totalEmployerCost: 210000,
          exceptions: [],
          hasExceptions: false,
        },
      ]);

      const result = await svc.recalcPayslip(1, 100, {} as any);

      expect(result).toEqual({ id: 100, netSalary: 180000 });
      expect(prisma.payrollRun.update).toHaveBeenCalledTimes(1);
      expect(prisma.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            employeeCount: 1,
            errorCount: 0,
            exceptionsCount: 0,
            totalGross: 200000,
            totalNet: 180000,
            totalDeductions: 20000,
            totalEmployerCost: 210000,
          }),
        }),
      );
    });

    it('excludePayslip of the last payslip refreshes the snapshot with employeeCount 0', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(baseRun({ status: 'SIMULATED' }));
      prisma.payslip.findUnique.mockResolvedValue({
        id: 100,
        runId: 1,
        userId: 5,
        status: 'DRAFT',
        run: { status: 'SIMULATED' },
      });
      prisma.payslip.update.mockResolvedValue({ id: 100, runId: null });
      prisma.read.payslip.findMany.mockResolvedValue([]); // nenhum recibo resta no run

      const result = await svc.excludePayslip(1, 100);

      expect(result).toEqual({ id: 100, runId: null });
      expect(prisma.payslip.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { runId: null },
      });
      expect(prisma.payrollRun.update).toHaveBeenCalledTimes(1);
      expect(prisma.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            employeeCount: 0,
            errorCount: 0,
            exceptionsCount: 0,
            totalGross: 0,
            totalNet: 0,
            totalDeductions: 0,
            totalEmployerCost: 0,
          }),
        }),
      );
    });
  });
});
