import { EventsService } from './events.service';

function build(event: Record<string, unknown> | null) {
  const prisma: any = {
    event: { findUnique: jest.fn().mockResolvedValue(event) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
  };
  prisma.read = prisma;
  const svc: any = Object.create(EventsService.prototype);
  svc.prisma = prisma;
  svc.logger = { warn: jest.fn() };
  svc.addParticipants = jest.fn().mockResolvedValue({ success: 2 });
  return { svc: svc as EventsService, prisma, add: svc.addParticipants };
}

describe('EventsService.autoEnrollAudience', () => {
  it('inscreve o departamento/unidade de um evento publicado e obrigatório', async () => {
    const { svc, prisma, add } = build({
      status: 'PUBLISHED',
      mandatory: true,
      departmentId: 4,
      unitId: 9,
    });

    expect(await svc.autoEnrollAudience(5)).toBe(2);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      accountStatus: 'ACTIVE',
      departmentId: 4,
      unitId: 9,
    });
    expect(add).toHaveBeenCalledWith(5, [1, 2]);
  });

  it.each([
    ['rascunho', { status: 'DRAFT', mandatory: true, departmentId: 4, unitId: null }],
    ['não obrigatório', { status: 'PUBLISHED', mandatory: false, departmentId: 4, unitId: null }],
    ['sem público', { status: 'PUBLISHED', mandatory: true, departmentId: null, unitId: null }],
  ])('não inscreve ninguém num evento %s', async (_label, event) => {
    const { svc, add } = build(event);
    expect(await svc.autoEnrollAudience(5)).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });
});
