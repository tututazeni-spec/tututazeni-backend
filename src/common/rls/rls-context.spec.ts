import {
  currentRlsSettings,
  privilegedRoleCodes,
  runAsSystem,
  runWithRls,
  setRlsPrivileged,
  setRlsUser,
} from './rls-context';

describe('rls-context', () => {
  afterEach(() => {
    delete process.env.RLS_PRIVILEGED_ROLES;
  });

  it('fora de pedido é privilegiado (processo de confiança)', () => {
    expect(currentRlsSettings()).toEqual({ userId: '', privileged: true });
  });

  it('pedido novo começa sem uid nem privilégios', () => {
    runWithRls(() => expect(currentRlsSettings()).toEqual({ userId: '', privileged: false }));
  });

  it('setRlsUser muta o store partilhado pela cadeia assíncrona', async () => {
    await runWithRls(async () => {
      setRlsUser(10, 'COLABORADOR');
      await new Promise(r => setTimeout(r, 1));
      expect(currentRlsSettings()).toEqual({ userId: '10', privileged: false });
    });
  });

  it('roles configuráveis por RLS_PRIVILEGED_ROLES', () => {
    process.env.RLS_PRIVILEGED_ROLES = ' rh , admin ';
    expect([...privilegedRoleCodes()].sort()).toEqual(['ADMIN', 'RH']);
    runWithRls(() => {
      setRlsUser(1, 'GESTOR');
      expect(currentRlsSettings().privileged).toBe(false);
      setRlsUser(1, 'rh');
      expect(currentRlsSettings().privileged).toBe(true);
    });
  });

  it('runAsSystem não contamina o pedido que o chamou', async () => {
    await runWithRls(async () => {
      setRlsUser(3, 'COLABORADOR');
      await runAsSystem(() =>
        expect(currentRlsSettings()).toEqual({ userId: '', privileged: true }),
      );
      expect(currentRlsSettings()).toEqual({ userId: '3', privileged: false });
    });
  });

  it('runAsSystem executa thenables lazy (Prisma) dentro do contexto', async () => {
    const lazy = {
      then: (res: (v: unknown) => void) => res(currentRlsSettings()),
    } as PromiseLike<unknown>;
    await runWithRls(async () => {
      setRlsUser(3, 'COLABORADOR');
      expect(await runAsSystem(() => lazy)).toEqual({ userId: '', privileged: true });
    });
  });

  it('uid inválido nunca chega ao SQL', () => {
    runWithRls(() => {
      setRlsUser(NaN, 'COLABORADOR');
      expect(currentRlsSettings().userId).toBe('');
      setRlsUser(1.5, 'COLABORADOR');
      expect(currentRlsSettings().userId).toBe('');
    });
  });

  it('setRlsPrivileged sem store é no-op', () => {
    expect(() => setRlsPrivileged(true)).not.toThrow();
  });
});
