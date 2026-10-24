import express from 'express';
import request from 'supertest';
import {
  applyLargeBodyLimits,
  applySmallBodyLimits,
  DEFAULT_BODY_LIMIT,
  SMALL_BODY_PREFIXES,
} from './body-limits';

function makeApp() {
  const app = express();
  applySmallBodyLimits(app);
  applyLargeBodyLimits(app);
  app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
  app.post('*splat', (req, res) => {
    res.json({ size: JSON.stringify(req.body).length });
  });
  return app;
}

const body = (chars: number) => ({ blob: 'a'.repeat(chars) });

describe('applySmallBodyLimits', () => {
  it('limita as rotas de autenticação a 100 KB', async () => {
    expect(SMALL_BODY_PREFIXES).toContain('/auth');
    await request(makeApp()).post('/auth/login').send(body(1000)).expect(200);
    await request(makeApp()).post('/auth/login').send(body(200_000)).expect(413);
    await request(makeApp()).post('/auth/sso/callback').send(body(200_000)).expect(413);
  });

  it('mantém 8 MB só nas rotas de ficheiros inline', async () => {
    await request(makeApp()).post('/users/me/avatar').send(body(3_000_000)).expect(200);
    await request(makeApp()).post('/lessons').send(body(3_000_000)).expect(200);
    await request(makeApp()).post('/lessons').send(body(9_000_000)).expect(413);
  });

  it('limita as restantes rotas a 1 MB', async () => {
    await request(makeApp()).post('/users').send(body(500_000)).expect(200);
    await request(makeApp()).post('/users').send(body(2_000_000)).expect(413);
  });

  it('não confunde prefixos parecidos (/authors)', async () => {
    await request(makeApp()).post('/authors').send(body(200_000)).expect(200);
  });
});
