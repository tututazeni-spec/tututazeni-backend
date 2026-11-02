import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  EXTERNAL_LIVE_CLASS_SCOPE_KEY,
  ExternalLiveClassScopeGuard,
} from './external-live-class-scope.guard';

const EXT = { id: 9, role: { name: 'INSTRUCTOR_EXTERNO' } };
const ADMIN = { id: 1, role: { name: 'ADMIN' } };

function build(opts: {
  spec?: unknown;
  user?: unknown;
  params?: Record<string, string>;
  profile?: { id: number } | null;
  ownsClass?: boolean;
  sessionOk?: boolean;
  attendanceOk?: boolean;
}) {
  const prisma = {
    trainingInstructorProfile: { findUnique: jest.fn().mockResolvedValue(opts.profile ?? null) },
    liveClass: { findFirst: jest.fn().mockResolvedValue(opts.ownsClass ? { id: 1 } : null) },
    liveClassSession: { findFirst: jest.fn().mockResolvedValue(opts.sessionOk ? { id: 2 } : null) },
    liveAttendance: {
      findFirst: jest.fn().mockResolvedValue(opts.attendanceOk ? { id: 3 } : null),
    },
  };
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === EXTERNAL_LIVE_CLASS_SCOPE_KEY ? opts.spec : undefined,
    ),
  } as unknown as Reflector;
  const guard = new ExternalLiveClassScopeGuard(reflector, prisma as never);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: opts.user, params: opts.params ?? {} }) }),
  } as never;
  return { guard, prisma, ctx };
}

describe('ExternalLiveClassScopeGuard', () => {
  it('sem metadados ou para quem não é externo: passa sem consultar a BD', async () => {
    const a = build({ spec: undefined, user: EXT });
    await expect(a.guard.canActivate(a.ctx)).resolves.toBe(true);
    const b = build({ spec: { key: 'id' }, user: ADMIN, params: { id: '5' } });
    await expect(b.guard.canActivate(b.ctx)).resolves.toBe(true);
    expect(b.prisma.liveClass.findFirst).not.toHaveBeenCalled();
  });

  it('aula própria (instrutor ou co-instrutor) passa', async () => {
    const t = build({
      spec: { key: 'id' },
      user: EXT,
      params: { id: '5' },
      profile: { id: 4 },
      ownsClass: true,
    });
    await expect(t.guard.canActivate(t.ctx)).resolves.toBe(true);
    expect(t.prisma.liveClass.findFirst.mock.calls[0][0].where).toEqual({
      id: 5,
      OR: [{ instructorId: 4 }, { coInstructorId: 4 }],
    });
  });

  it('aula alheia, sem perfil de instrutor ou id inválido → 404', async () => {
    const alheia = build({
      spec: { key: 'id' },
      user: EXT,
      params: { id: '5' },
      profile: { id: 4 },
      ownsClass: false,
    });
    await expect(alheia.guard.canActivate(alheia.ctx)).rejects.toBeInstanceOf(NotFoundException);
    const semPerfil = build({ spec: { key: 'id' }, user: EXT, params: { id: '5' }, profile: null });
    await expect(semPerfil.guard.canActivate(semPerfil.ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const invalido = build({
      spec: { key: 'id' },
      user: EXT,
      params: { id: 'x' },
      profile: { id: 4 },
    });
    await expect(invalido.guard.canActivate(invalido.ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('sessão: tem de pertencer à aula do pedido', async () => {
    const ok = build({
      spec: { key: 'id', sessionKey: 'sessionId' },
      user: EXT,
      params: { id: '5', sessionId: '8' },
      profile: { id: 4 },
      ownsClass: true,
      sessionOk: true,
    });
    await expect(ok.guard.canActivate(ok.ctx)).resolves.toBe(true);
    expect(ok.prisma.liveClassSession.findFirst.mock.calls[0][0].where).toEqual({
      id: 8,
      liveClassId: 5,
    });
    const no = build({
      spec: { key: 'id', sessionKey: 'sessionId' },
      user: EXT,
      params: { id: '5', sessionId: '8' },
      profile: { id: 4 },
      ownsClass: true,
      sessionOk: false,
    });
    await expect(no.guard.canActivate(no.ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('presença: tem de pertencer à aula do pedido', async () => {
    const no = build({
      spec: { key: 'id', attendanceKey: 'attendanceId' },
      user: EXT,
      params: { id: '5', attendanceId: '9' },
      profile: { id: 4 },
      ownsClass: true,
      attendanceOk: false,
    });
    await expect(no.guard.canActivate(no.ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(no.prisma.liveAttendance.findFirst.mock.calls[0][0].where).toEqual({
      id: 9,
      liveClassId: 5,
    });
  });
});
