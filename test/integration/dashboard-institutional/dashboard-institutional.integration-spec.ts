import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Dashboard Institutional Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const snapshotPeriod1 = '2026-01';
  const snapshotPeriod2 = '2026-02';
  let widgetId: string;

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
    await (prisma as any).institutionalSnapshot
      .deleteMany({ where: { period: { in: [snapshotPeriod1, snapshotPeriod2] } } })
      .catch(() => undefined);
    if (widgetId)
      await (prisma as any).dashboardWidget
        .deleteMany({ where: { id: widgetId } })
        .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Leitura / agregação (ADMIN/RH/GESTOR)', () => {
    it('colaborador não acede ao resumo executivo → 403', async () => {
      await request(app.getHttpServer())
        .get('/dashboard-institutional/summary')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH acede ao resumo executivo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-institutional/summary')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('people');
      expect(res.body).toHaveProperty('learning');
    });

    it('RH vê a tendência de crescimento (12 meses por omissão) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-institutional/growth-trend')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('RH vê a distribuição geográfica → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-institutional/geographic')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('RH vê os alertas institucionais → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-institutional/alerts')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Snapshots — histórico de KPIs', () => {
    it('colaborador não pode criar snapshot → 403', async () => {
      await request(app.getHttpServer())
        .post('/dashboard-institutional/snapshots')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ period: snapshotPeriod1 })
        .expect(403);
    });

    it('RH cria snapshot do período → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/dashboard-institutional/snapshots')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ period: snapshotPeriod1 })
        .expect(201);
      expect(res.body).toHaveProperty('period', snapshotPeriod1);
    });

    it('snapshot duplicado para o mesmo período+tipo → 409', async () => {
      await request(app.getHttpServer())
        .post('/dashboard-institutional/snapshots')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ period: snapshotPeriod1 })
        .expect(409);
    });

    it('RH cria snapshot de um segundo período → 201', async () => {
      await request(app.getHttpServer())
        .post('/dashboard-institutional/snapshots')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ period: snapshotPeriod2 })
        .expect(201);
    });

    it('lista snapshots → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-institutional/snapshots')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('compara os dois períodos existentes → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/dashboard-institutional/snapshots/compare?period1=${snapshotPeriod1}&period2=${snapshotPeriod2}`,
        )
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('comparison');
    });

    it('comparar com período inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/dashboard-institutional/snapshots/compare?period1=2026-01&period2=2099-12')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });
  });

  describe('Widgets — próprios do utilizador', () => {
    it('qualquer autenticado pode criar o seu widget → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/dashboard-institutional/widgets')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ type: 'KPI_CARD', title: 'Meu Widget', config: JSON.stringify({ metric: 'x' }) })
        .expect(201);
      widgetId = res.body.id;
    });

    it('dono vê os seus widgets → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-institutional/widgets')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((w: any) => w.id === widgetId)).toBe(true);
    });

    it('outro utilizador não vê nem edita o widget alheio → 404 ao actualizar', async () => {
      await request(app.getHttpServer())
        .put(`/dashboard-institutional/widgets/${widgetId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Widget roubado' })
        .expect(404);
    });

    it('dono actualiza o próprio widget → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/dashboard-institutional/widgets/${widgetId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'Meu Widget (actualizado)' })
        .expect(200);
      expect(res.body.title).toBe('Meu Widget (actualizado)');
    });

    it('outro utilizador não pode remover o widget alheio → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/dashboard-institutional/widgets/${widgetId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('dono remove o próprio widget → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/dashboard-institutional/widgets/${widgetId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });
  });
});
