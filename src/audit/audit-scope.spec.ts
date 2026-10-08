import { ForbiddenException } from '@nestjs/common';
import {
  GESTOR_SCOPE_MODULES,
  RH_SCOPE_MODULES,
  resolveAuditScope,
  withScope,
} from './audit-scope';

const db = (dept: number | null, team: number[]) =>
  ({
    user: {
      findUnique: jest.fn().mockResolvedValue({ departmentId: dept }),
      findMany: jest.fn().mockResolvedValue(team.map(id => ({ id }))),
    },
  }) as any;

const viewer = (name: string, id = 7) => ({ id, role: { name } });

describe('resolveAuditScope (§16)', () => {
  it.each(['ADMIN', 'AUDITOR'])('%s tem consulta global (null)', async role => {
    await expect(resolveAuditScope(viewer(role), db(null, []))).resolves.toBeNull();
  });

  it('RH fica limitado aos módulos de RH e sem eventos de autenticação', async () => {
    const scope = await resolveAuditScope(viewer('RH'), db(null, []));
    expect(scope).toMatchObject({ module: { in: [...RH_SCOPE_MODULES] } });
    expect(JSON.stringify(scope)).toContain('"Auth"');
    expect(RH_SCOPE_MODULES).not.toContain('Roles & Permissions');
    expect(RH_SCOPE_MODULES).not.toContain('Integrations / API');
    expect(RH_SCOPE_MODULES).not.toContain('Audit');
  });

  it('GESTOR fica limitado à sua equipa/unidade e a módulos operacionais (inclui o próprio)', async () => {
    const d = db(3, [11, 12]);
    const scope = await resolveAuditScope(viewer('GESTOR', 7), d);
    expect(scope).toMatchObject({
      module: { in: [...GESTOR_SCOPE_MODULES] },
      userId: { in: [7, 11, 12] },
    });
    expect(d.user.findMany).toHaveBeenCalledWith({
      where: { OR: [{ managerId: 7 }, { departmentId: 3 }] },
      select: { id: true },
    });
    expect(GESTOR_SCOPE_MODULES).not.toContain('Payroll');
  });

  it('GESTOR sem departamento só usa a hierarquia directa', async () => {
    const d = db(null, []);
    await resolveAuditScope(viewer('GESTOR', 7), d);
    expect(d.user.findMany).toHaveBeenCalledWith({
      where: { OR: [{ managerId: 7 }] },
      select: { id: true },
    });
  });

  it.each(['COLABORADOR', 'INSTRUCTOR', 'LIDER', 'DIRECTOR', undefined])(
    'perfil %s não consulta auditoria → 403',
    async role => {
      await expect(
        resolveAuditScope({ id: 1, role: role ? { name: role } : null }, db(null, [])),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});

describe('withScope', () => {
  it('sem âmbito devolve o filtro intacto', () => {
    expect(withScope({ id: 1 }, null)).toEqual({ id: 1 });
  });
  it('com âmbito combina em AND (o âmbito vem primeiro e nunca é sobreposto)', () => {
    expect(withScope({ id: 1 }, { module: 'Leave' })).toEqual({
      AND: [{ module: 'Leave' }, { id: 1 }],
    });
  });
});
