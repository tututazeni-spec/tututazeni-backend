import { LiveClassesService } from './live-classes.service';

function build() {
  const prisma: any = {
    user: { findMany: jest.fn() },
    liveAttendance: { findMany: jest.fn(), createMany: jest.fn() },
  };
  prisma.read = prisma;
  const svc: any = Object.create(LiveClassesService.prototype);
  svc.prisma = prisma;
  svc.logger = { warn: jest.fn() };
  svc.notifyAddedToLiveClass = jest.fn().mockResolvedValue(undefined);
  return { svc: svc as LiveClassesService, prisma, notify: svc.notifyAddedToLiveClass };
}

const lc = {
  id: 7,
  topic: 'Aula',
  status: 'AGENDADA' as const,
  enrollmentMode: 'AUTO' as const,
  maxParticipants: null,
  targetDeptIds: [3],
  targetUnitIds: [] as number[],
  targetPositionIds: [] as number[],
};

describe('LiveClassesService.autoEnrollTargets', () => {
  it('inscreve os colaboradores activos do público-alvo que ainda não estão inscritos', async () => {
    const { svc, prisma, notify } = build();
    prisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    prisma.liveAttendance.findMany.mockResolvedValue([{ userId: 2 }]);

    const n = await svc.autoEnrollTargets(lc);

    expect(n).toBe(2);
    expect(prisma.liveAttendance.createMany).toHaveBeenCalledWith({
      data: [
        { liveClassId: 7, userId: 1, sessionId: null },
        { liveClassId: 7, userId: 3, sessionId: null },
      ],
    });
    expect(notify).toHaveBeenCalledWith([1, 3], 'Aula', 7, null);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      accountStatus: 'ACTIVE',
      OR: [{ departmentId: { in: [3] } }],
    });
  });

  it('não faz nada fora do modo AUTO, sem público-alvo ou com a aula ainda em preparação', async () => {
    const { svc, prisma } = build();
    expect(await svc.autoEnrollTargets({ ...lc, enrollmentMode: 'MANUAL' })).toBe(0);
    expect(await svc.autoEnrollTargets({ ...lc, targetDeptIds: [] })).toBe(0);
    expect(await svc.autoEnrollTargets({ ...lc, status: 'EM_PREPARACAO' })).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('respeita o limite de participantes', async () => {
    const { svc, prisma } = build();
    prisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    prisma.liveAttendance.findMany.mockResolvedValue([{ userId: 9 }]);

    const n = await svc.autoEnrollTargets({ ...lc, maxParticipants: 3 });

    expect(n).toBe(2);
  });
});
