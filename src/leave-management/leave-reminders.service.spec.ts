// Lembretes e escalonamento de aprovações em atraso (§10/§11).
import { LeaveRemindersService } from './leave-reminders.service';
import { DEFAULT_LEAVE_SETTINGS, LeaveSettings } from './leave-settings.dto';

const NOW = new Date('2026-11-10T08:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function harness(settings: Partial<LeaveSettings> = {}) {
  const prisma: Record<string, Record<string, jest.Mock> | jest.Mock> = {
    leaveApproval: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
    leaveApprovalReassignment: { create: jest.fn().mockResolvedValue({}) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 40 }) },
    notificationLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  Object.defineProperty(prisma, 'read', { get: () => prisma });
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const cfg = { ...DEFAULT_LEAVE_SETTINGS, ...settings };
  const svc = new LeaveRemindersService(
    prisma as never,
    audit as never,
    { current: jest.fn().mockResolvedValue(cfg) } as never,
  );
  const approvals = prisma.leaveApproval as Record<string, jest.Mock>;
  const notifs = (prisma.notificationLog as Record<string, jest.Mock>).create;
  return { svc, prisma, approvals, notifs, audit };
}

const overdue = (lateDays: number, over: Record<string, unknown> = {}) => ({
  id: 1,
  requestId: 100,
  approverId: 2,
  level: 1,
  dueAt: daysAgo(lateDays),
  request: { userId: 10, requestNumber: 'LV-2026-000100' },
  ...over,
});

describe('LeaveRemindersService.remindOverdueApprovals', () => {
  it('lembra o aprovador quando está em atraso e não há escalonamento', async () => {
    const { svc, approvals, notifs } = harness();
    approvals.findMany.mockResolvedValue([overdue(2)]);
    const r = await svc.remindOverdueApprovals(NOW);
    expect(r).toEqual({ reminded: 1, escalated: 0 });
    expect(notifs).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 2, type: 'LEAVE_APPROVAL_OVERDUE' }),
      }),
    );
  });

  it('escala para o RH quando o atraso passa o limite — e regista o histórico', async () => {
    const { svc, approvals, prisma, audit } = harness({ escalationAfterDays: 3 });
    approvals.findMany.mockResolvedValue([overdue(4)]);

    const r = await svc.remindOverdueApprovals(NOW);

    expect(r).toEqual({ reminded: 0, escalated: 1 });
    expect(
      (prisma.leaveApprovalReassignment as Record<string, jest.Mock>).create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'ESCALATE', fromApproverId: 2, toApproverId: 40 }),
    });
    expect(approvals.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { approverId: 40 } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEAVE_APPROVAL_ESCALATED' }),
    );
  });

  it('só considera etapas ainda não escaladas (nunca escala duas vezes)', async () => {
    const { svc, approvals } = harness({ escalationAfterDays: 3 });
    await svc.remindOverdueApprovals(NOW);
    expect(approvals.findMany.mock.calls[0][0].where.reassignments).toEqual({
      none: { kind: 'ESCALATE' },
    });
  });

  it('sem RH disponível cai para o simples lembrete', async () => {
    const { svc, approvals, prisma } = harness({ escalationAfterDays: 3 });
    (prisma.user as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
    approvals.findMany.mockResolvedValue([overdue(5)]);
    expect(await svc.remindOverdueApprovals(NOW)).toEqual({ reminded: 1, escalated: 0 });
  });

  it('ignora etapas cuja etapa anterior ainda não decidiu', async () => {
    const { svc, approvals, notifs } = harness();
    approvals.findMany.mockResolvedValue([overdue(5, { level: 2 })]);
    approvals.count.mockResolvedValue(1);
    expect(await svc.remindOverdueApprovals(NOW)).toEqual({ reminded: 0, escalated: 0 });
    expect(notifs).not.toHaveBeenCalled();
  });
});
