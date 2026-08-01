import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';

describe('Metrics Integration (full AppModule — não apenas MetricsModule isolado)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /metrics sem qualquer header → 401 (fail-closed, mesmo com @Public no JwtAuthGuard global)', async () => {
    await request(app.getHttpServer()).get('/metrics').expect(401);
  });

  it('GET /metrics com token errado → 401', async () => {
    await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', 'Bearer token-errado')
      .expect(401);
  });

  it('GET /metrics sem Authorization mas com JWT normal de utilizador não serve — token do METRICS_TOKEN é distinto', async () => {
    // Confirma que o MetricsTokenGuard não aceita acidentalmente um JWT válido de
    // login como se fosse o token estático — são mecanismos de auth diferentes.
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'int.admin@innova-test.com', password: 'Test@1234' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });

  it('GET /metrics com METRICS_TOKEN correcto → 200, texto Prometheus real (@Public bypassa o JwtAuthGuard global de facto)', async () => {
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`)
      .expect(200);
    expect(res.text).toContain('process_cpu_seconds_total');
    expect(res.text).toContain('http_request_duration_seconds');
  });

  it('pedidos reais feitos à app ficam registados no histograma http_request_duration_seconds (MetricsInterceptor está de facto ligado globalmente)', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);

    const res = await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`)
      .expect(200);
    expect(res.text).toMatch(/http_request_duration_seconds_count\{[^}]*method="POST"/);
  });
});
