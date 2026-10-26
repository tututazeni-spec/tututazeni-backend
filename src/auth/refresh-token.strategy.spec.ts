// src/auth/refresh-token.strategy.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { KeyObject } from 'crypto';
import * as jwt from 'jsonwebtoken';
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

describe('RefreshTokenStrategy — chave de verificação', () => {
  const build = async () => {
    const { RefreshTokenStrategy } = await import('./refresh-token.strategy');
    return new RefreshTokenStrategy({ get: () => 'test-refresh-secret' } as any);
  };
  const run = (strat: unknown, token: string) =>
    new Promise<string>(resolve => {
      const s = Object.create(strat as object);
      s.success = () => resolve('success');
      s.fail = () => resolve('fail');
      s.error = () => resolve('error');
      s.authenticate({ headers: {}, cookies: { refresh_token: token } });
    });

  it('entrega ao jsonwebtoken um KeyObject pré-criado, não o segredo em texto', async () => {
    const strat = await build();
    let key: unknown;
    (strat as any)._secretOrKeyProvider(null, null, (_e: unknown, k: unknown) => (key = k));
    expect(key).toBeInstanceOf(KeyObject);
    expect((key as KeyObject).type).toBe('secret');
  });

  it('aceita um refresh token válido e rejeita um assinado com outro segredo', async () => {
    const strat = await build();
    const ok = jwt.sign({ sub: 9, email: 'u@i.com' }, 'test-refresh-secret', { expiresIn: '7d' });
    const bad = jwt.sign({ sub: 9, email: 'u@i.com' }, 'outro', { expiresIn: '7d' });
    await expect(run(strat, ok)).resolves.toBe('success');
    await expect(run(strat, bad)).resolves.toBe('fail');
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
