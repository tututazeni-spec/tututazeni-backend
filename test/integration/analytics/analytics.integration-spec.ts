import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Analytics Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const snapshotIds: number[] = [];

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
    managerToken = await getToken(app.getHttpServer(), 'manager');
    rhToken = await getToken(app.getHttpServer(), 'rh');
    adminToken = await getToken(app.getHttpServer(), 'admin');
  });

  afterAll(async () => {
    if (snapshotIds.length > 0) {
      await prisma.dashboardSnapshot
        .deleteMany({ where: { id: { in: snapshotIds } } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Overview (C-Level)', () => {
    it('GET /analytics/overview — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/analytics/overview')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /analytics/overview — GESTOR → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/overview')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /analytics/overview — RH → 200', async () => {
      await request(app.getHttpServer())
        .get('/analytics/overview')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('Dashboards por persona', () => {
    it('GET /analytics/me — qualquer autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /analytics/manager — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/analytics/manager')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /analytics/manager — GESTOR → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/manager')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /analytics/hr — GESTOR (não RH/ADMIN) → 403', async () => {
      await request(app.getHttpServer())
        .get('/analytics/hr')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('GET /analytics/hr — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/hr')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /analytics/hr — com filtros de período → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/hr')
        .query({ period: '90d' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Módulos específicos', () => {
    const cases: Array<[string, string]> = [
      ['learning', 'GESTOR'],
      ['pdi', 'GESTOR'],
      ['competency-gaps', 'GESTOR'],
      ['engagement', 'GESTOR'],
      ['risks', 'GESTOR'],
    ];

    for (const [path] of cases) {
      it(`GET /analytics/${path} — colaborador → 403`, async () => {
        await request(app.getHttpServer())
          .get(`/analytics/${path}`)
          .set('Authorization', `Bearer ${employeeToken}`)
          .expect(403);
      });

      it(`GET /analytics/${path} — GESTOR → 200`, async () => {
        const res = await request(app.getHttpServer())
          .get(`/analytics/${path}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200);
        expect(res.body).toBeDefined();
      });
    }

    it('GET /analytics/people — GESTOR (não RH/ADMIN) → 403', async () => {
      await request(app.getHttpServer())
        .get('/analytics/people')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('GET /analytics/people — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/people')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /analytics/roi — GESTOR (não RH/ADMIN) → 403', async () => {
      await request(app.getHttpServer())
        .get('/analytics/roi')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('GET /analytics/roi — ADMIN → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/roi')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Curso e departamento específicos', () => {
    it('GET /analytics/courses — GESTOR → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/courses')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('analytics');
    });

    it('GET /analytics/courses/:courseId — GESTOR → 200', async () => {
      const course = await prisma.course.findFirst();
      const res = await request(app.getHttpServer())
        .get(`/analytics/courses/${course!.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('feedbackStats');
    });

    it('GET /analytics/departments/:departmentId — GESTOR → 200', async () => {
      const department = await prisma.department.findFirst();
      const res = await request(app.getHttpServer())
        .get(`/analytics/departments/${department!.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.departmentId).toBe(department!.id);
    });

    it('GET /analytics/departments/:departmentId — colaborador → 403', async () => {
      const department = await prisma.department.findFirst();
      await request(app.getHttpServer())
        .get(`/analytics/departments/${department!.id}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Snapshots executivos', () => {
    it('POST /analytics/snapshots/generate — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .post('/analytics/snapshots/generate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('POST /analytics/snapshots/generate — RH → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/analytics/snapshots/generate')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('totalUsers');
      snapshotIds.push(res.body.id);
    });

    it('GET /analytics/snapshots — inclui o snapshot gerado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/snapshots')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((s: any) => snapshotIds.includes(s.id))).toBe(true);
    });

    it('GET /analytics/snapshots — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/analytics/snapshots')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });
});
