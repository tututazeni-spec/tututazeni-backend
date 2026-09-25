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
        status: 'COMPLETED',
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

  describe('Benchmarks (docs/roi-impact.md §9)', () => {
    let benchmarkId: number;

    it('cria um benchmark EXTERNO com fonte registada', async () => {
      const res = await request(app.getHttpServer())
        .post('/roi-impact/benchmarks')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'ROI médio do setor de formação — Angola',
          type: 'EXTERNO',
          source: 'Associação Angolana de RH (teste de integração)',
          referenceYear: 2025,
          value: 120,
          unit: '%',
          indicatorName: 'ROI médio anual',
        })
        .expect(201);
      benchmarkId = res.body.id;
      expect(res.body.type).toBe('EXTERNO');
    });

    it('lista e edita o benchmark criado', async () => {
      const list = await request(app.getHttpServer())
        .get('/roi-impact/benchmarks')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(list.body.benchmarks.some((b: any) => b.id === benchmarkId)).toBe(true);

      const updated = await request(app.getHttpServer())
        .patch(`/roi-impact/benchmarks/${benchmarkId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ value: 125 })
        .expect(200);
      expect(updated.body.value).toBe(125);
    });

    it('internal-comparisons não rebenta sem análises de ROI', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/benchmarks/internal-comparisons')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body.byDepartment)).toBe(true);
      expect(Array.isArray(res.body.bestWorstByType)).toBe(true);
    });

    it('sector-roi-comparison encontra o benchmark EXTERNO de ROI criado', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/benchmarks/sector-roi-comparison')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.externalBenchmarks.some((b: any) => b.id === benchmarkId)).toBe(true);
    });

    it('remove o benchmark', async () => {
      await request(app.getHttpServer())
        .delete(`/roi-impact/benchmarks/${benchmarkId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('colaborador não acede aos benchmarks', async () => {
      await request(app.getHttpServer())
        .get('/roi-impact/benchmarks')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Relatórios (docs/roi-impact.md §10)', () => {
    it('roi-consolidated devolve estrutura sem 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/reports/roi-consolidated')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.totalAnalyses).toEqual(expect.any(Number));
      expect(Array.isArray(res.body.byStatus)).toBe(true);
    });

    it('roi-by-dimension devolve as três dimensões', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/reports/roi-by-dimension')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body.byDepartment)).toBe(true);
      expect(Array.isArray(res.body.byUnit)).toBe(true);
      expect(Array.isArray(res.body.byInitiativeType)).toBe(true);
    });

    it('impact-by-indicator', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/reports/impact-by-indicator')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body.indicators)).toBe(true);
    });

    it('training-cost-vs-budget e budget-execution não rebentam sem planos de formação', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/roi-impact/reports/training-cost-vs-budget')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res1.body.plans)).toBe(true);

      const res2 = await request(app.getHttpServer())
        .get('/roi-impact/reports/budget-execution')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res2.body.plans)).toBe(true);
    });

    it('top-initiatives respeita o limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/reports/top-initiatives')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ limit: 3 })
        .expect(200);
      expect(res.body.top.length).toBeLessThanOrEqual(3);
    });

    it('insufficient-data e roi-evolution', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/roi-impact/reports/insufficient-data')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res1.body.initiatives)).toBe(true);

      const res2 = await request(app.getHttpServer())
        .get('/roi-impact/reports/roi-evolution')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res2.body.years)).toBe(true);
    });

    it('onboarding-retention e leadership-engagement', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/roi-impact/reports/onboarding-retention')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res1.body.completedCohort).toBeDefined();

      const res2 = await request(app.getHttpServer())
        .get('/roi-impact/reports/leadership-engagement')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res2.body.leaders)).toBe(true);
    });

    it('executive-summary reutiliza o dashboard executivo', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/reports/executive-summary')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.headline.overallRoi).toEqual(expect.any(Number));
    });

    it('export/pdf da síntese executiva devolve um PDF', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/reports/executive-summary/export/pdf')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('export/xlsx de top-initiatives devolve um XLSX', async () => {
      const res = await request(app.getHttpServer())
        .get('/roi-impact/reports/top-initiatives/export/xlsx')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });

    it('colaborador não acede aos relatórios', async () => {
      await request(app.getHttpServer())
        .get('/roi-impact/reports/roi-consolidated')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });
});
