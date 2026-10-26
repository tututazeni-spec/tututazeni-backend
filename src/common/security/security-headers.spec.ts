// Garante, numa resposta HTTP real, os headers e o bloqueio de downgrade que a
// auditoria A-1 exige. A stack espelha a ordem de main.ts (trust proxy → helmet
// → enforce-https). Se alguém remover um destes middlewares, este spec falha.
import express from 'express';
import request from 'supertest';
import { buildHelmet } from './security-headers';
import { enforceHttpsMiddleware } from './enforce-https';

function buildApp(isProd: boolean) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(buildHelmet());
  app.use(enforceHttpsMiddleware(isProd));
  app.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('security headers (produção, atrás do proxy TLS)', () => {
  const app = buildApp(true);

  it('emite HSTS com preload e includeSubDomains', async () => {
    const res = await request(app).get('/ping').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
  });

  it('emite CSP, X-Frame-Options e nosniff', async () => {
    const res = await request(app).get('/ping').set('X-Forwarded-Proto', 'https');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('emite X-XSS-Protection desligado e Referrer-Policy restritiva', async () => {
    const res = await request(app).get('/ping').set('X-Forwarded-Proto', 'https');
    expect(res.headers['x-xss-protection']).toBe('0');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it.each(['GET', 'POST'] as const)(
    'bloqueia downgrade: %s em http → 308 para https',
    async method => {
      const res = await request(app)
        [method.toLowerCase() as 'get' | 'post']('/ping?a=1')
        .set('Host', 'innova.ao')
        .set('X-Forwarded-Proto', 'http');
      expect(res.status).toBe(308);
      expect(res.headers.location).toBe('https://innova.ao/ping?a=1');
    },
  );

  it('healthcheck directo (sem X-Forwarded-Proto) continua a passar', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
  });
});

describe('fora de produção', () => {
  it('não força https em dev', async () => {
    const res = await request(buildApp(false)).get('/ping').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(200);
  });
});
