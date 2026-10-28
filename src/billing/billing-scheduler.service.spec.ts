import { BillingSchedulerService } from './billing-scheduler.service';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const DAY = 864e5;
const now = new Date('2026-11-30T06:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

function setup(overrides: { invoices?: unknown[]; subs?: unknown[]; unpaid?: number } = {}) {
  const prisma = {
    tenantConfig: { findFirst: jest.fn().mockResolvedValue({ contactEmail: 'ops@cliente.test' }) },
    billingInvoice: {
      findMany: jest.fn().mockResolvedValue(overrides.invoices ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(overrides.unpaid ?? 0),
    },
    billingSubscription: {
      findMany: jest.fn().mockResolvedValue(overrides.subs ?? []),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const invoices = {
    issue: jest
      .fn()
      .mockResolvedValue({ fullNumber: 'FT 2026/9', total: 1, currency: 'AOA', dueDate: now }),
  };
  const limits = { invalidate: jest.fn() };
  const mail = { sendNotification: jest.fn().mockResolvedValue(undefined) };
  const svc = new BillingSchedulerService(
    prisma as never,
    invoices as never,
    limits as never,
    mail as never,
  );
  return { svc, prisma, invoices, mail };
}

describe('BillingSchedulerService', () => {
  it('fatura vencida passa a OVERDUE, subscrição a PAST_DUE e envia o 1.º lembrete', async () => {
    const inv = {
      id: 'i1',
      subscriptionId: 's1',
      status: 'ISSUED',
      dueDate: daysAgo(1),
      reminderCount: 0,
      fullNumber: 'FT 2026/1',
      total: 1,
      currency: 'AOA',
    };
    const { svc, prisma, mail } = setup({ invoices: [inv] });
    await svc.markOverdueAndDun(now);
    expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { status: 'OVERDUE' },
    });
    expect(prisma.billingSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PAST_DUE' } }),
    );
    expect(mail.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('não repete o lembrete já enviado nem suspende dentro da graça', async () => {
    const inv = {
      id: 'i1',
      subscriptionId: 's1',
      status: 'OVERDUE',
      dueDate: daysAgo(3),
      reminderCount: 1,
      fullNumber: 'FT 2026/1',
      total: 1,
      currency: 'AOA',
    };
    const { svc, prisma, mail } = setup({ invoices: [inv] });
    await svc.markOverdueAndDun(now);
    expect(mail.sendNotification).not.toHaveBeenCalled();
    expect(prisma.billingSubscription.updateMany).not.toHaveBeenCalled();
  });

  it('passada a graça (14 dias) a subscrição expira', async () => {
    const inv = {
      id: 'i1',
      subscriptionId: 's1',
      status: 'OVERDUE',
      dueDate: daysAgo(15),
      reminderCount: 3,
      fullNumber: 'FT 2026/1',
      total: 1,
      currency: 'AOA',
    };
    const { svc, prisma } = setup({ invoices: [inv] });
    await svc.markOverdueAndDun(now);
    expect(prisma.billingSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
    );
  });

  it('renovação: emite a fatura do período seguinte uma única vez', async () => {
    const sub = {
      id: 's1',
      interval: 'MONTHLY',
      currentPeriodEnd: new Date(now.getTime() + 3 * DAY),
    };
    const first = setup({ subs: [sub] });
    expect(await first.svc.issueRenewals(now)).toBe(1);
    expect(first.invoices.issue).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 's1', periodStart: sub.currentPeriodEnd }),
    );

    const again = setup({ subs: [sub] });
    again.prisma.billingInvoice.findFirst.mockResolvedValue({ id: 'ja-existe' });
    expect(await again.svc.issueRenewals(now)).toBe(0);
    expect(again.invoices.issue).not.toHaveBeenCalled();
  });

  it('teste terminado sem fatura em aberto expira; com fatura em aberto deixa para o dunning', async () => {
    const trial = { id: 's1', trialEndsAt: daysAgo(1) };
    const a = setup({ subs: [trial], unpaid: 0 });
    expect(await a.svc.expireTrials(now)).toBe(1);
    expect(a.prisma.billingSubscription.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'EXPIRED' },
    });

    const b = setup({ subs: [trial], unpaid: 1 });
    expect(await b.svc.expireTrials(now)).toBe(0);
  });

  it('aviso de fim de teste aos 3 dias', async () => {
    const { svc, mail } = setup({
      subs: [{ id: 's1', trialEndsAt: new Date(now.getTime() + 3 * DAY) }],
    });
    await svc.expireTrials(now);
    expect(mail.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('cancelamento agendado executa no fim do período', async () => {
    const { svc, prisma } = setup();
    expect(await svc.finishCancellations(now)).toBe(1);
    expect(prisma.billingSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cancelAtPeriodEnd: true }) }),
    );
  });
});
