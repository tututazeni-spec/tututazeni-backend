import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Roi Impact Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let courseAId: number;
  let courseBId: number;

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

    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    employeeId = employee!.id;

    const courseA = await prisma.course.create({
      data: {
        title: 'Int Test ROI Course A',
        internalCode: 'INT-TEST-ROI-A',
        status: 'PUBLISHED',
      },
    });
    courseAId = courseA.id;

    const courseB = await prisma.course.create({
      data: {
        title: 'Int Test ROI Course B',
        internalCode: 'INT-TEST-ROI-B',
        status: 'PUBLISHED',
      },
    });
    courseBId = courseB.id;

    await prisma.enrollment.create({
      data: {
        courseId: courseAId,
        userId: employeeId,
        status: 'CONCLUIDO',
        enrolledAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.enrollment
      .deleteMany({ where: { courseId: { in: [courseAId, courseBId] } } })
      .catch(() => undefined);
    await prisma.course
      .deleteMany({ where: { id: { in: [courseAId, courseBId] } } })
      .catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Autenticação e RBAC (tier ADMIN/RH/DIRECTOR — mais estreito que ALL_MGMT)', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/roi-impact/executive').expect(401);
    });

    it('colaborador não acede', async () => {
      await request(app.getHttpServer())
        .get('/roi-impact/executive')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor (GESTOR) também não acede — tier deliberadamente mais estreito que reports/dashboard', async () => {
      await request(app.getHttpServer())
        .get('/roi-impact/executive')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('RH e ADMIN acedem', async () => {
      await request(app.getHttpServer())
        .get('/roi-impact/executive')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/roi-impact/executive')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('ROI core', () => {
    it('training-roi (legacy) devolve estrutura completa', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/training-roi')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ from: '2020-01-01', to: '2030-01-01' })
        .expect(200);
      expect(res.body.volume).toBeDefined();
      expect(res.body.financial).toBeDefined();
      expect(res.body.impact).toBeDefined();
      expect(res.body.narrative).toEqual(expect.any(String));
    });

    it('calculate com parâmetros personalizados afecta o ROI financeiro', async () => {
      const res = await request(app.getHttpServer())
        .post('/roi-impact/calculate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          costPerEnrollment: 1,
          benefitPerCompletion: 10000,
          from: '2020-01-01',
          to: '2030-01-01',
        })
        .expect(201);
      expect(res.body.assumptions.costPerEnrollment).toBe(1);
      expect(res.body.assumptions.benefitPerCompletion).toBe(10000);
    });
  });

  describe('Impacto Kirkpatrick e domínios', () => {
    it('impact-metrics (legacy)', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/impact-metrics')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.levels.L1_reaction).toBeDefined();
      expect(res.body.levels.L5_roi).toBeDefined();
    });

    it('impact/levels expõe os 5 níveis', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/impact/levels')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Object.keys(res.body.levels)).toEqual([
        'L1_reaction',
        'L2_learning',
        'L3_behaviour',
        'L4_results',
        'L5_roi',
      ]);
    });

    it('impact/retention', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/impact/retention')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.turnoverRate).toBeDefined();
    });

    it('impact/performance', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/impact/performance')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.monetised).toBeDefined();
    });

    it('impact/learning', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/impact/learning')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.volume).toBeDefined();
      expect(res.body.financial).toBeDefined();
    });
  });

  describe('Dashboard executivo', () => {
    it('agrega os domínios e gera narrativa/alertas sem 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/executive')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.headline.overallRoi).toEqual(expect.any(Number));
      expect(Array.isArray(res.body.topInsights)).toBe(true);
      expect(Array.isArray(res.body.alerts)).toBe(true);
    });
  });

  describe('Biblioteca de programas (bug: filter.courseId/departmentId nunca eram aplicados)', () => {
    it('sem filtro — inclui ambos os cursos de teste', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/programs')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ from: '2020-01-01', to: '2030-01-01' })
        .expect(200);
      const ids = res.body.programs.map((p: any) => p.course?.id);
      expect(ids).toEqual(expect.arrayContaining([courseAId]));
    });

    it('?courseId=A — devolve apenas o programa filtrado', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/programs')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ from: '2020-01-01', to: '2030-01-01', courseId: courseAId })
        .expect(200);
      expect(res.body.programs.length).toBe(1);
      expect(res.body.programs[0].course.id).toBe(courseAId);
      expect(res.body.programs[0].completions).toBe(1);
    });

    it('?courseId=B (sem inscrições) — devolve lista vazia', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/programs')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ from: '2020-01-01', to: '2030-01-01', courseId: courseBId })
        .expect(200);
      expect(res.body.programs.length).toBe(0);
    });
  });

  describe('Simulador What-If', () => {
    it('projecta ROI para uma taxa de conclusão alvo', async () => {
      const res = await request(app.getHttpServer())
        .post('/roi-impact/simulate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetCompletionRate: 90 })
        .expect(201);
      expect(res.body.projected.completionRate).toBe(90);
      expect(res.body.delta).toBeDefined();
    });

    it('targetCompletionRate fora de 0-100 → 400', async () => {
      await request(app.getHttpServer())
        .post('/roi-impact/simulate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetCompletionRate: 150 })
        .expect(400);
    });
  });
});
