import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RoleGovernanceGuard } from './role-governance.guard';

function ctx(req: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('RoleGovernanceGuard (menor privilégio na gestão de papéis)', () => {
  const roles: Record<number, { id: number; name: string }> = {
    1: { id: 1, name: 'COLABORADOR' },
    4: { id: 4, name: 'RH' },
    9: { id: 9, name: 'ADMIN' },
  };
  const prisma = { role: { findUnique: jest.fn(async ({ where }) => roles[where.id] ?? null) } };
  const guard = new RoleGovernanceGuard(prisma as never);
  const rh = { id: 5, roleId: 4, role: { name: 'RH' } };
  const admin = { id: 1, roleId: 9, role: { name: 'ADMIN' } };

  it('GET passa sempre (leitura)', async () => {
    await expect(
      guard.canActivate(ctx({ method: 'GET', user: rh, params: { id: '9' } })),
    ).resolves.toBe(true);
  });

  it('ADMIN pode tudo', async () => {
    await expect(
      guard.canActivate(
        ctx({ method: 'POST', user: admin, params: { roleId: '9', userId: '1' }, body: {} }),
      ),
    ).resolves.toBe(true);
  });

  it.each([
    ['atribuir ADMIN por param', { params: { roleId: '9', userId: '7' }, body: {} }],
    ['atribuir ADMIN por body (bulk/assign-role)', { params: {}, body: { roleId: 9, userId: 7 } }],
    ['editar o papel ADMIN', { params: { id: '9' }, body: {} }],
    ['alterar permissões do ADMIN', { params: { roleId: '9' }, body: {} }],
    ['editar o próprio papel (RH)', { params: { id: '4' }, body: {} }],
    ['mexer nas permissões do próprio papel', { params: { roleId: '4' }, body: {} }],
    ['atribuir papel a si próprio', { params: { roleId: '1', userId: '5' }, body: {} }],
    ['incluir-se num bulk-assign', { params: {}, body: { roleId: 1, userIds: [7, 5] } }],
  ])('RH não consegue: %s', async (_n, extra) => {
    await expect(
      guard.canActivate(ctx({ method: 'POST', user: rh, ...(extra as object) })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('RH continua a gerir papéis comuns e a atribuí-los a outros', async () => {
    await expect(
      guard.canActivate(
        ctx({ method: 'POST', user: rh, params: { roleId: '1', userId: '7' }, body: {} }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(ctx({ method: 'PATCH', user: rh, params: { roleId: '1' }, body: {} })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(ctx({ method: 'POST', user: rh, params: {}, body: { name: 'Novo' } })),
    ).resolves.toBe(true);
  });
});
