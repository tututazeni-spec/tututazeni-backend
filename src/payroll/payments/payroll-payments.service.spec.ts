import { ConflictException, BadRequestException } from '@nestjs/common';
import { PayrollPaymentsService } from './payroll-payments.service';

describe('PayrollPaymentsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let svc: PayrollPaymentsService;

  const run = (over: Record<string, unknown> = {}) => ({
    id: 1,
    period: '2026-09',
    status: 'APPROVED',
    expectedPaymentDate: null,
    closure: null,
    ...over,
  });

  beforeEach(() => {
    prisma = {
      payrollRun: { findUnique: jest.fn().mockResolvedValue(run()) },
      payrollPayment: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 5, ...data })),
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 5, runId: 1, ...data })),
      },
      payslip: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { netSalary: 1234.567 }, _count: { _all: 3 } }),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        findMany: jest.fn(),
      },
      payrollClosure: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      read: {},
    };
    audit = { log: jest.fn() };
    svc = new PayrollPaymentsService(prisma, audit as any);
  });

  describe('create', () => {
    it('soma o líquido do run e arredonda a 2 casas', async () => {
      const p = await svc.create({ runId: 1, bankName: 'BAI' }, 9);
      expect(p).toMatchObject({
        runId: 1,
        employeeCount: 3,
        totalAmount: 1234.57,
        bankName: 'BAI',
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entity: 'PayrollPayment' }));
    });

    it('rejeita run que ainda não foi aprovado', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'DRAFT' }));
      await expect(svc.create({ runId: 1 }, 9)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita folha fechada', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(run({ closure: { closedAt: new Date() } }));
      await expect(svc.create({ runId: 1 }, 9)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita segundo pagamento activo para o mesmo run', async () => {
      prisma.payrollPayment.count.mockResolvedValue(1);
      await expect(svc.create({ runId: 1 }, 9)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita data prevista inválida', async () => {
      await expect(svc.create({ runId: 1, expectedDate: 'xx' }, 9)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('updateStatus', () => {
    const payment = (status: string, extra: Record<string, unknown> = {}) => ({
      id: 5,
      runId: 1,
      status,
      bankFileGeneratedAt: new Date(),
      ...extra,
    });

    it('rejeita transição inválida (PENDING -> PAID)', async () => {
      prisma.payrollPayment.findUnique.mockResolvedValue(payment('PENDING'));
      await expect(svc.updateStatus(5, { status: 'PAID' }, 9)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('exige ficheiro bancário antes de PREPARED', async () => {
      prisma.payrollPayment.findUnique.mockResolvedValue(
        payment('PENDING', { bankFileGeneratedAt: null }),
      );
      await expect(svc.updateStatus(5, { status: 'PREPARED' }, 9)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('FAILED exige motivo', async () => {
      prisma.payrollPayment.findUnique.mockResolvedValue(payment('SENT_TO_BANK'));
      await expect(svc.updateStatus(5, { status: 'FAILED' }, 9)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('PAID regista data efectiva e propaga paymentDate aos recibos', async () => {
      prisma.payrollPayment.findUnique.mockResolvedValue(payment('PROCESSED'));
      await svc.updateStatus(5, { status: 'PAID', effectiveDate: '2026-09-28' }, 9);
      expect(prisma.payslip.updateMany).toHaveBeenCalledWith({
        where: { runId: 1 },
        data: { paymentDate: '2026-09-28' },
      });
    });
  });

  describe('bankFile', () => {
    it('exclui colaboradores sem NIB e lista-os em missingNib', async () => {
      prisma.payrollPayment.findUnique.mockResolvedValue({
        id: 5,
        runId: 1,
        status: 'PENDING',
        run: { period: '2026-09' },
      });
      prisma.payslip.findMany.mockResolvedValue([
        { netSalary: 100, user: { fullName: 'Ana', employeeNumber: 'E1', nib: 'AO06 0001' } },
        { netSalary: 200, user: { fullName: 'Rui', employeeNumber: 'E2', nib: null } },
      ]);
      const f = await svc.bankFile(5, 9);
      expect(f.rows).toBe(1);
      expect(f.missingNib).toEqual(['Rui']);
      expect(f.content).toContain('E1;Ana;AO06 0001;100.00');
      expect(f.content).not.toContain('Rui');
      expect(prisma.payrollPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ errorMessage: expect.stringContaining('Sem NIB') }),
        }),
      );
    });
  });

  describe('close', () => {
    const overview = (over: Record<string, unknown> = {}) => ({
      closed: false,
      period: '2026-09',
      hrValidation: { at: 'x', by: 'a' },
      financeValidation: { at: 'x', by: 'b' },
      checklist: [{ label: 'ok', ok: true }],
      totals: { totalNet: 1 },
      ...over,
    });

    it('exige as duas validações', async () => {
      jest
        .spyOn(svc, 'closureOverview')
        .mockResolvedValue(overview({ financeValidation: null }) as any);
      await expect(svc.close(1, 9)).rejects.toBeInstanceOf(ConflictException);
    });

    it('exige a checklist completa', async () => {
      jest
        .spyOn(svc, 'closureOverview')
        .mockResolvedValue(
          overview({ checklist: [{ label: 'Pagamentos concluídos', ok: false }] }) as any,
        );
      await expect(svc.close(1, 9)).rejects.toThrow(/Pagamentos concluídos/);
    });

    it('fecha quando tudo está validado', async () => {
      jest.spyOn(svc, 'closureOverview').mockResolvedValue(overview() as any);
      await svc.close(1, 9);
      expect(prisma.payrollClosure.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { runId: 1 },
          data: expect.objectContaining({ closedById: 9 }),
        }),
      );
    });
  });

  describe('closureOverview checklist', () => {
    const setup = (exceptions: unknown) => {
      prisma.read.payrollRun = {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          period: '2026-09',
          status: 'PUBLISHED',
          errorCount: 0,
          closure: null,
          payments: [],
          approvedById: null,
        }),
      };
      prisma.read.payslip = {
        findMany: jest.fn().mockResolvedValue([
          {
            status: 'ISSUED',
            grossSalary: 10,
            netSalary: 8,
            incomeTax: 1,
            socialSecurity: 1,
            employerInss: 1,
            totalEmployerCost: 11,
            exceptions,
          },
        ]),
      };
      prisma.read.user = { findMany: jest.fn().mockResolvedValue([]) };
    };
    const item = (o: any, code: string) => o.checklist.find((i: any) => i.code === code).ok;

    it('WARNING não bloqueia remunerações/deduções verificadas', async () => {
      setup([{ code: 'NO_NIF', severity: 'WARNING', message: 'x' }]);
      const o = await svc.closureOverview(1);
      expect(item(o, 'EARNINGS_VERIFIED')).toBe(true);
      expect(item(o, 'DEDUCTIONS_VERIFIED')).toBe(true);
    });

    it('ERROR bloqueia', async () => {
      setup([{ code: 'NO_COMP', severity: 'ERROR', message: 'x' }]);
      const o = await svc.closureOverview(1);
      expect(item(o, 'EARNINGS_VERIFIED')).toBe(false);
    });
  });
});
