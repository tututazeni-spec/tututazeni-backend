// src/common/security/enforce-https.spec.ts
import { httpsRedirectTarget, enforceHttpsMiddleware } from './enforce-https';

describe('httpsRedirectTarget', () => {
  it('devolve o URL https quando x-forwarded-proto é http em produção', () => {
    expect(httpsRedirectTarget('http', 'innova.example.com', '/auth/login', true)).toBe(
      'https://innova.example.com/auth/login',
    );
  });

  it('usa o primeiro valor quando o header é lista (proxy encadeado)', () => {
    expect(httpsRedirectTarget('http, https', 'innova.example.com', '/x', true)).toBe(
      'https://innova.example.com/x',
    );
  });

  it('não redirige sem header (healthcheck interno do Docker)', () => {
    expect(httpsRedirectTarget(undefined, 'localhost:4000', '/health/ready', true)).toBeNull();
  });

  it('não redirige quando o protocolo já é https', () => {
    expect(httpsRedirectTarget('https', 'innova.example.com', '/x', true)).toBeNull();
  });

  it('não redirige fora de produção', () => {
    expect(httpsRedirectTarget('http', 'localhost:3000', '/x', false)).toBeNull();
  });

  it('não redirige sem host (não há para onde)', () => {
    expect(httpsRedirectTarget('http', undefined, '/x', true)).toBeNull();
  });
});

describe('enforceHttpsMiddleware', () => {
  function run(isProd: boolean, headers: Record<string, string>, originalUrl = '/cursos') {
    const req = { headers, originalUrl } as never;
    const redirect = jest.fn();
    const next = jest.fn();
    enforceHttpsMiddleware(isProd)(req, { redirect } as never, next);
    return { redirect, next };
  }

  it('responde 308 para https quando o proxy reporta http', () => {
    const { redirect, next } = run(true, {
      'x-forwarded-proto': 'http',
      host: 'innova.example.com',
    });
    expect(redirect).toHaveBeenCalledWith(308, 'https://innova.example.com/cursos');
    expect(next).not.toHaveBeenCalled();
  });

  it('segue em frente no healthcheck interno (sem x-forwarded-proto)', () => {
    const { redirect, next } = run(true, { host: 'localhost:4000' });
    expect(redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
