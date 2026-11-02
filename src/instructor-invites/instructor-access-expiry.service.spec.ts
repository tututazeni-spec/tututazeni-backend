import { InstructorAccessExpiryService } from './instructor-access-expiry.service';

function build(candidates: { id: number }[], results: Record<number, boolean | Error>) {
  const prisma = { user: { findMany: jest.fn() } };
  prisma.user.findMany.mockResolvedValueOnce(candidates).mockResolvedValue([]);
  const invites = {
    deactivateUser: jest.fn(async (id: number) => {
      const r = results[id];
      if (r instanceof Error) throw r;
      return r;
    }),
  };
  const svc = new InstructorAccessExpiryService(prisma as never, invites as never);
  return { svc, prisma, invites };
}

describe('InstructorAccessExpiryService.runExpiryJob', () => {
  const now = new Date('2026-11-02T12:00:00Z');

  it('procura só contas ativas do perfil INSTRUCTOR_EXTERNO com prazo ultrapassado', async () => {
    const { svc, prisma } = build([], {});
    await svc.runExpiryJob(now);
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      active: true,
      role: { name: 'INSTRUCTOR_EXTERNO' },
      accessExpiresAt: { lt: now },
    });
  });

  it('desativa cada conta com motivo EXPIRED e conta só as que realmente mudaram', async () => {
    const { svc, invites } = build([{ id: 1 }, { id: 2 }, { id: 3 }], {
      1: true,
      2: false,
      3: true,
    });
    const out = await svc.runExpiryJob(now);
    expect(invites.deactivateUser).toHaveBeenCalledWith(1, null, 'EXPIRED');
    expect(out).toEqual({ deactivated: 2 });
  });

  it('um erro numa conta não interrompe as restantes', async () => {
    const { svc, invites } = build([{ id: 1 }, { id: 2 }], { 1: new Error('boom'), 2: true });
    const out = await svc.runExpiryJob(now);
    expect(invites.deactivateUser).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ deactivated: 1 });
  });
});
