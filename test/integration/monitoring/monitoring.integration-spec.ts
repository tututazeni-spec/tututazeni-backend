import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Monitoring Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  let indicatorId: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

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

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    rhToken = await getToken(app.getHttpServer(), 'rh');
  });

  afterAll(async () => {
    if (indicatorId) {
      await (prisma as any).monitoringRecord
        .deleteMany({ where: { indicatorId } })
        .catch(() => undefined);
      await (prisma as any).monitoringIndicator
        .deleteMany({ where: { id: indicatorId } })
        .catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Indicadores de monitoria', () => {
    it('RH cria indicador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitoring/indicators')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ code: 'IND-INT-001', name: 'Indicador Integração', target: 100 })
        .expect(201);
      indicatorId = res.body.id;
    });

    it('código de indicador duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/monitoring/indicators')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ code: 'IND-INT-001', name: 'Duplicado' })
        .expect(409);
    });

    it('regista valor do indicador → variance calculada', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitoring/indicators/${indicatorId}/records`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ value: 80, period: '2026-07' })
        .expect(201);
      expect(res.body.variance).toBe(-20);
      expect(res.body.variancePct).toBe(-20);
    });

    it('registar valor para indicador inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/monitoring/indicators/nao-existe/records')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ value: 10, period: '2026-07' })
        .expect(404);
    });

    it('histórico do indicador inclui o registo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitoring/indicators/${indicatorId}/history`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.records.length).toBeGreaterThan(0);
    });

    it('lista indicadores (paginado) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitoring/indicators?page=1&limit=20')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('Dashboard', () => {
    it('RH acede ao dashboard de monitoria → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitoring/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/monitoring/dashboard').expect(401);
    });
  });
});
