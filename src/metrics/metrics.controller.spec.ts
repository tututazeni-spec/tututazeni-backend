import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { register } from 'prom-client';
import request from 'supertest';
import { MetricsModule } from './metrics.module';

jest.setTimeout(120000);

describe('GET /metrics (integração)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.METRICS_TOKEN = 'segredo-teste';
    register.clear();
    const moduleRef = await Test.createTestingModule({ imports: [MetricsModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    register.clear();
  });

  it('401 sem token', () => request(app.getHttpServer()).get('/metrics').expect(401));

  it('200 com token devolve texto Prometheus (processo + cache counter)', () =>
    request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', 'Bearer segredo-teste')
      .expect(200)
      .expect(res => {
        expect(res.text).toContain('process_cpu_seconds_total');
        expect(res.text).toContain('cache_requests_total');
      }));
});
