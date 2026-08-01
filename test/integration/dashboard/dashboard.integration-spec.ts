import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Dashboard Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let departmentId: number;

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

    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    departmentId = dept!.id;
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

  describe('GET /dashboard/my', () => {
    it('colaborador vê o seu dashboard pessoal → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.learning).toBeDefined();
      expect(res.body.development).toBeDefined();
      expect(res.body.gamification.level.label).toBeDefined();
      expect(Array.isArray(res.body.pendingItems)).toBe(true);
      expect(Array.isArray(res.body.notifications)).toBe(true);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/dashboard/my').expect(401);
    });
  });

  describe('GET /dashboard/manager', () => {
    it('colaborador não pode aceder → 403', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/manager')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor sem equipa → 200 teamSize 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/manager')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.teamSize).toBe(0);
      expect(res.body.team).toEqual([]);
    });

    it('com filtro de período → 200', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/manager')
        .query({ period: 'QUARTER' })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });
  });

  describe('GET /dashboard/organization', () => {
    it('gestor não pode aceder → 403', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/organization')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('RH acede ao resumo organizacional → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/organization')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      expect(res.body.kpis.headcount.total).toBeGreaterThanOrEqual(4);
      expect(res.body.kpis.learning.courses).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.departments)).toBe(true);
      expect(Array.isArray(res.body.insights)).toBe(true);
    });

    it('com filtro de departamento e período → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/organization')
        .query({ departmentId, period: 'YEAR' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      expect(res.body.kpis.headcount.total).toBeGreaterThanOrEqual(4);
    });
  });

  describe('GET /dashboard/executive', () => {
    it('gestor não pode aceder → 403', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/executive')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('admin acede ao dashboard executivo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/executive')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.talentHealth.healthScore).toBeDefined();
      expect(Array.isArray(res.body.topTalent)).toBe(true);
      expect(Array.isArray(res.body.risks)).toBe(true);
    });
  });

  describe('GET /dashboard/department/:id', () => {
    it('colaborador não pode aceder → 403', async () => {
      await request(app.getHttpServer())
        .get(`/dashboard/department/${departmentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor acede ao dashboard do departamento → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/dashboard/department/${departmentId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.departmentId).toBe(departmentId);
      expect(res.body.headcount).toBeGreaterThanOrEqual(4);
      expect(res.body.learning).toBeDefined();
      expect(res.body.performance).toBeDefined();
    });
  });

  describe('GET /dashboard/alerts', () => {
    it('colaborador vê os seus alertas → 200 array ordenado por prioridade', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/alerts')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /dashboard/leaderboard', () => {
    it('qualquer autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/leaderboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('com departmentId e limit → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/leaderboard')
        .query({ departmentId, limit: 5 })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /dashboard/search', () => {
    it('query curta (< 2 chars) → resultado vazio', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/search')
        .query({ q: 'a' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body.users).toEqual([]);
      expect(res.body.courses).toEqual([]);
    });

    it('pesquisa por curso publicado real → encontra o curso seed → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/search')
        .query({ q: 'Integração Teste' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body.courses.some((c: any) => c.title === 'Curso Integração Teste')).toBe(true);
    });

    it('pesquisa por utilizador real → encontra o utilizador seed → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/search')
        .query({ q: 'Employee Int' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body.users.some((u: any) => u.fullName === 'Employee Int')).toBe(true);
    });
  });

  describe('GET /dashboard/snapshots', () => {
    it('gestor não pode aceder → 403', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/snapshots')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('RH lista snapshots (pode estar vazia) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/snapshots')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /dashboard/snapshots/generate', () => {
    it('gestor não pode gerar snapshot → 403', async () => {
      await request(app.getHttpServer())
        .post('/dashboard/snapshots/generate')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('RH gera snapshot → 201 e persiste na BD com os campos reais do modelo', async () => {
      const res = await request(app.getHttpServer())
        .post('/dashboard/snapshots/generate')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);

      expect(res.body.snapshot.id).toBeDefined();
      snapshotIds.push(res.body.snapshot.id);

      const row = await prisma.dashboardSnapshot.findUnique({
        where: { id: res.body.snapshot.id },
      });
      expect(row).toBeDefined();
      expect(row!.totalUsers).toBeGreaterThanOrEqual(4);
      expect(typeof row!.averageScore).toBe('number');
      expect(typeof row!.activePlans).toBe('number');
    });

    it('snapshot gerado aparece na listagem → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/snapshots')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      expect(res.body.some((s: any) => s.id === snapshotIds[0])).toBe(true);
    });
  });
});
