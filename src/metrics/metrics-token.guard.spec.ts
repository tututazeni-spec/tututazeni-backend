import { UnauthorizedException } from '@nestjs/common';
import { MetricsTokenGuard } from './metrics-token.guard';

function contextWithAuth(authorization?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as any;
}

describe('MetricsTokenGuard', () => {
  const guard = new MetricsTokenGuard();
  const original = process.env.METRICS_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = original;
  });

  it('token correto → permite', () => {
    process.env.METRICS_TOKEN = 'segredo';
    expect(guard.canActivate(contextWithAuth('Bearer segredo'))).toBe(true);
  });

  it('token errado → 401', () => {
    process.env.METRICS_TOKEN = 'segredo';
    expect(() => guard.canActivate(contextWithAuth('Bearer outro'))).toThrow(UnauthorizedException);
  });

  it('sem header → 401', () => {
    process.env.METRICS_TOKEN = 'segredo';
    expect(() => guard.canActivate(contextWithAuth(undefined))).toThrow(UnauthorizedException);
  });

  it('METRICS_TOKEN não definido → 401 (fail-closed)', () => {
    delete process.env.METRICS_TOKEN;
    expect(() => guard.canActivate(contextWithAuth('Bearer qualquer'))).toThrow(
      UnauthorizedException,
    );
  });
});
