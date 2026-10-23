import { sign } from 'jsonwebtoken';
import { logIdentityMiddleware } from './identity.middleware';
import { getRequestContext, runWithRequestContext } from './request-context';

const SECRET = 'test-secret';

function run(req: Record<string, unknown>, secret: string | null = SECRET) {
  let userId: unknown;
  runWithRequestContext({ reqId: 'r1' }, () => {
    logIdentityMiddleware(secret ?? undefined)(req as never, {} as never, () => {
      userId = getRequestContext().userId;
    });
  });
  return userId;
}

describe('logIdentityMiddleware', () => {
  it('usa o sub de um token válido no cookie', () => {
    expect(run({ cookies: { token: sign({ sub: 7 }, SECRET) }, headers: {} })).toBe(7);
  });

  it('usa o sub de um Bearer válido', () => {
    const t = sign({ sub: 9 }, SECRET);
    expect(run({ headers: { authorization: `Bearer ${t}` } })).toBe(9);
  });

  it('ignora token com assinatura errada (sub forjado)', () => {
    expect(run({ cookies: { token: sign({ sub: 1 }, 'outro') }, headers: {} })).toBeUndefined();
  });

  it('ignora token expirado e nunca rebenta', () => {
    const t = sign({ sub: 3 }, SECRET, { expiresIn: -10 });
    expect(run({ cookies: { token: t }, headers: {} })).toBeUndefined();
  });

  it('sem token ou sem segredo segue sem userId', () => {
    expect(run({ headers: {} })).toBeUndefined();
    expect(
      run({ cookies: { token: sign({ sub: 7 }, SECRET) }, headers: {} }, null),
    ).toBeUndefined();
  });
});
