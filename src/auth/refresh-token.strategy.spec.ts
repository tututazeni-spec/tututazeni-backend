// src/auth/refresh-token.strategy.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { refreshCookieExtractor } from './refresh-token.strategy';

describe('refreshCookieExtractor', () => {
  it('extrai o refresh_token do cookie', () => {
    const req = { cookies: { refresh_token: 'abc' } } as any;
    expect(refreshCookieExtractor(req)).toBe('abc');
  });

  it('devolve null quando não há cookie', () => {
    expect(refreshCookieExtractor({ cookies: {} } as any)).toBeNull();
    expect(refreshCookieExtractor({} as any)).toBeNull();
  });
});

describe('RefreshTokenStrategy.validate', () => {
  it('devolve id/email/refreshToken a partir do payload e do cookie', async () => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    const { RefreshTokenStrategy } = await import('./refresh-token.strategy');
    const strat = new RefreshTokenStrategy({ get: () => 'test-refresh-secret' } as any);
    const req = { cookies: { refresh_token: 'the-token' } } as any;
    const out = await strat.validate(req, { sub: 9, email: 'u@i.com' });
    expect(out).toEqual({ id: 9, email: 'u@i.com', refreshToken: 'the-token' });
  });

  it('recusa quando o cookie desapareceu entre a verificação e o validate', async () => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    const { RefreshTokenStrategy } = await import('./refresh-token.strategy');
    const strat = new RefreshTokenStrategy({ get: () => 'test-refresh-secret' } as any);
    await expect(
      strat.validate({ cookies: {} } as any, { sub: 9, email: 'u@i.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
