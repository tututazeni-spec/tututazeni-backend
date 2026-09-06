import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as http from 'http';
import { AppModule } from '../../../src/app.module';

// Fase J J-c: a entrega de webhooks passou para a fila Bull `webhooks` +
// WebhooksProcessor. Este teste arranca a app real (fila ligada ao Redis) e
// confirma que um job `deliver` é efectivamente entregue por HTTP e que um
// 5xx faz o Bull reagendar até ter sucesso.
describe('Webhooks queue → WebhooksProcessor — Integration', () => {
  let app: INestApplication;
  let queue: Queue;
  let server: http.Server;
  let baseUrl: string;

  let received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  let failFirstN = 0;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    queue = app.get<Queue>(getQueueToken('webhooks'));

    server = http.createServer((req, res) => {
      let data = '';
      req.on('data', c => (data += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body: data });
        if (failFirstN > 0) {
          failFirstN--;
          res.statusCode = 500;
          res.end('boom');
        } else {
          res.statusCode = 200;
          res.end('ok');
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });

  afterEach(async () => {
    received = [];
    failFirstN = 0;
    await queue.empty().catch(() => undefined);
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await app.close();
  });

  const waitFor = async (pred: () => boolean, ms = 10000) => {
    const start = Date.now();
    while (!pred() && Date.now() - start < ms) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!pred()) throw new Error('timeout à espera da condição do webhook');
  };

  it('um job "deliver" faz o POST ao endpoint com o corpo e os headers de evento/assinatura', async () => {
    await queue.add(
      'deliver',
      {
        url: `${baseUrl}/hook`,
        event: 'course.completed',
        body: JSON.stringify({ event: 'course.completed', data: { x: 1 } }),
        signature: 'sha256=deadbeef',
        webhookId: 1,
      },
      { attempts: 1, removeOnComplete: true },
    );

    await waitFor(() => received.length === 1);
    expect(received[0].headers['x-innova-event']).toBe('course.completed');
    expect(received[0].headers['x-innova-signature']).toBe('sha256=deadbeef');
    expect(received[0].headers['x-innova-delivery']).toBeDefined();
    expect(JSON.parse(received[0].body)).toEqual({ event: 'course.completed', data: { x: 1 } });
  });

  it('endpoint 500 → o Bull reagenda (attempts>1) e a entrega acaba por ter sucesso', async () => {
    failFirstN = 1;
    await queue.add(
      'deliver',
      { url: `${baseUrl}/hook`, event: 'retry.me', body: '{}', webhookId: 2 },
      { attempts: 3, backoff: { type: 'fixed', delay: 200 }, removeOnComplete: true },
    );

    // 1ª tentativa devolve 500, a 2ª (após backoff) devolve 200.
    await waitFor(() => received.length >= 2, 15000);
    expect(received.length).toBeGreaterThanOrEqual(2);
  });
});
