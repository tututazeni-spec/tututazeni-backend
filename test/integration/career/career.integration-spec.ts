import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const POSITION_NAME = 'Int Test Position — Career';

describe('Career Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let employeeId: number;
  let positionId: number;
  let pathId: number;
  let planId: number;
  let goalId: number;
  let vacancyId: number;
  let criticalPositionId: number;
  let successionPlanId: number;

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

    const employee = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employee!.id;

    const position = await prisma.position.create({
      data: { name: POSITION_NAME, level: 'SENIOR' },
    });
    positionId = position.id;
  });

  afterAll(async () => {
    if (pathId) {
      await prisma.careerPathStep
        .deleteMany({ where: { careerPathId: pathId } })
        .catch(() => undefined);
      await prisma.careerPath.deleteMany({ where: { id: pathId } }).catch(() => undefined);
    }
    if (planId) {
      await prisma.careerGoal
        .deleteMany({ where: { careerPlanId: planId } })
        .catch(() => undefined);
      await prisma.userCareerPlan.deleteMany({ where: { id: planId } }).catch(() => undefined);
    }
    if (vacancyId) {
      await prisma.internalApplication.deleteMany({ where: { vacancyId } }).catch(() => undefined);
      await prisma.internalVacancy.deleteMany({ where: { id: vacancyId } }).catch(() => undefined);
    }
    if (criticalPositionId) {
      // SuccessionPDI/SuccessionPlan cascadeiam ao apagar CriticalPosition.
      await prisma.criticalPosition
        .deleteMany({ where: { id: criticalPositionId } })
        .catch(() => undefined);
    }
    await prisma.careerRole.deleteMany({ where: { name: POSITION_NAME } }).catch(() => undefined);
    if (positionId) {
      await prisma.position.deleteMany({ where: { id: positionId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Perfil de carreira', () => {
    it('GET /career/me → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /career/me/gap-analysis → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/me/gap-analysis')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /career/users/:userId/profile — colaborador não pode ver perfil de outro → 403', async () => {
      await request(app.getHttpServer())
        .get(`/career/users/${employeeId}/profile`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /career/users/:userId/profile — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/career/users/${employeeId}/profile`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Trilhas de carreira', () => {
    it('colaborador não pode criar trilha → 403', async () => {
      await request(app.getHttpServer())
        .post('/career/paths')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', type: 'LINEAR' })
        .expect(403);
    });

    it('RH cria trilha → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career/paths')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Trilha de Integração', type: 'LINEAR' })
        .expect(201);
      pathId = res.body.id;
      expect(pathId).toBeDefined();
    });

    it('POST /career/paths/:id/steps — adiciona passo (cria CareerRole automaticamente) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/career/paths/${pathId}/steps`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ positionId, order: 1 })
        .expect(201);
      expect(res.body.positionId).toBe(positionId);

      const role = await prisma.careerRole.findFirst({ where: { name: POSITION_NAME } });
      expect(role).toBeDefined();
    });

    it('POST /career/paths/:id/steps — ordem duplicada → 409', async () => {
      await request(app.getHttpServer())
        .post(`/career/paths/${pathId}/steps`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ positionId, order: 1 })
        .expect(409);
    });

    it('GET /career/paths — lista → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/paths')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((p: any) => p.id === pathId)).toBe(true);
    });

    it('GET /career/paths/:id — detalhe → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/career/paths/${pathId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(pathId);
    });
  });

  describe('Plano de carreira pessoal', () => {
    it('POST /career/me/plan — cria plano activo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career/me/plan')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'Tornar-me Tech Lead' })
        .expect(201);
      planId = res.body.id;
      expect(res.body.status).toBe('ACTIVE');
    });

    it('POST /career/me/plan — já existe plano activo → 409', async () => {
      await request(app.getHttpServer())
        .post('/career/me/plan')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'Outro plano' })
        .expect(409);
    });

    it('GET /career/me/plan → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/me/plan')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(planId);
    });

    it('POST /career/me/plan/:planId/goals — adiciona objectivo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/career/me/plan/${planId}/goals`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'Liderar um projecto', timeframe: 'SHORT_TERM' })
        .expect(201);
      goalId = res.body.id;
      expect(goalId).toBeDefined();
    });

    it('PATCH /career/me/goals/:goalId/progress → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/career/me/goals/${goalId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ progress: 50 })
        .expect(200);
      expect(res.body.progress).toBe(50);
    });
  });

  describe('Vagas internas', () => {
    it('RH cria vaga → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career/vacancies')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Vaga de Integração', type: 'LATERAL', positionId })
        .expect(201);
      vacancyId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('PATCH /career/vacancies/:id/publish → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/career/vacancies/${vacancyId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('OPEN');
    });

    it('GET /career/vacancies — colaborador vê vaga aberta → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/vacancies')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((v: any) => v.id === vacancyId)).toBe(true);
    });

    it('POST /career/vacancies/:id/apply — candidata-se → 201', async () => {
      await request(app.getHttpServer())
        .post(`/career/vacancies/${vacancyId}/apply`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ motivation: 'Quero crescer nesta área' })
        .expect(201);
    });

    it('POST /career/vacancies/:id/apply — candidatura duplicada → 409', async () => {
      await request(app.getHttpServer())
        .post(`/career/vacancies/${vacancyId}/apply`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({})
        .expect(409);
    });

    it('GET /career/me/applications → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/me/applications')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((a: any) => a.vacancyId === vacancyId)).toBe(true);
    });

    it('PATCH /career/vacancies/applications/:appId/status → 200', async () => {
      const apps = await prisma.internalApplication.findMany({ where: { vacancyId } });
      const res = await request(app.getHttpServer())
        .patch(`/career/vacancies/applications/${apps[0].id}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'SHORTLISTED' })
        .expect(200);
      expect(res.body.status).toBe('SHORTLISTED');
    });
  });

  describe('Planeamento de sucessão', () => {
    it('POST /career/succession — cargo ainda não é crítico → 404', async () => {
      await request(app.getHttpServer())
        .post('/career/succession')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ positionId, candidateId: employeeId, readiness: 'READY_NOW' })
        .expect(404);
    });

    it('marca o cargo como crítico (fixture directa)', async () => {
      const cp = await prisma.criticalPosition.create({
        data: {
          positionId,
          businessImpact: 'HIGH',
          replacementTime: 'MEDIUM_TERM',
          exitRisk: 'MEDIUM',
        },
      });
      criticalPositionId = cp.id;
      expect(criticalPositionId).toBeDefined();
    });

    it('POST /career/succession — cria plano (priority PRIMARY derivado) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career/succession')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          positionId,
          candidateId: employeeId,
          readiness: 'READY_12M',
          justification: 'Bom desempenho consistente',
        })
        .expect(201);
      successionPlanId = res.body.id;
      expect(res.body.candidateId).toBe(employeeId);
    });

    it('POST /career/succession — mesmo candidato/cargo → 409', async () => {
      await request(app.getHttpServer())
        .post('/career/succession')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ positionId, candidateId: employeeId, readiness: 'READY_NOW' })
        .expect(409);
    });

    it('PATCH /career/succession/:id/readiness → 200', async () => {
      await request(app.getHttpServer())
        .patch(`/career/succession/${successionPlanId}/readiness`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ readiness: 'READY_NOW' })
        .expect(200);
    });

    it('GET /career/succession → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/succession')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ positionId })
        .expect(200);
      expect(res.body.some((p: any) => p.id === successionPlanId)).toBe(true);
    });
  });

  describe('Analytics', () => {
    it('GET /career/analytics — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/career/analytics')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /career/analytics — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/analytics')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /career/analytics/talent-heatmap — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career/analytics/talent-heatmap')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });
});
