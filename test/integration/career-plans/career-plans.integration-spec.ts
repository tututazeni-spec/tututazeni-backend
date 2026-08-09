import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const OTHER_EMPLOYEE_EMAIL = 'int.careerplans.other@innova-test.com';

describe('Career Plans Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let gestorToken: string;
  let otherEmployeeToken: string;
  let employeeId: number;
  let otherEmployeeId: number;

  let roleId: number;
  let planId: number;
  let goalId: number;
  let promotionId: number;

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
    gestorToken = await getToken(app.getHttpServer(), 'manager');

    const employeeUser = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employeeUser!.id;

    const colaboradorRole = await prisma.role.findUnique({ where: { code: 'COLABORADOR' } });
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    const password = await bcrypt.hash('Test@1234', 10);
    const otherEmployee = await prisma.user.upsert({
      where: { email: OTHER_EMPLOYEE_EMAIL },
      update: {},
      create: {
        email: OTHER_EMPLOYEE_EMAIL,
        fullName: 'Outro Colaborador CareerPlans',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });
    otherEmployeeId = otherEmployee.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: OTHER_EMPLOYEE_EMAIL, password: 'Test@1234' })
      .expect(201);
    otherEmployeeToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (promotionId)
      await prisma.promotionRequest
        .deleteMany({ where: { id: promotionId } })
        .catch(() => undefined);
    if (goalId)
      await prisma.careerGoal.deleteMany({ where: { id: goalId } }).catch(() => undefined);
    if (planId)
      await prisma.userCareerPlan.deleteMany({ where: { id: planId } }).catch(() => undefined);
    if (roleId)
      await prisma.careerRole.deleteMany({ where: { id: roleId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: OTHER_EMPLOYEE_EMAIL } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Cargos e catálogo', () => {
    it('RH cria cargo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career-plans/roles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Especialista Sénior Integração', department: 'TI', level: 4 })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      roleId = res.body.id;
    });

    it('colaborador não pode criar cargo → 403', async () => {
      await request(app.getHttpServer())
        .post('/career-plans/roles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'Outro Cargo', department: 'TI' })
        .expect(403);
    });

    it('detalhe de cargo inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/career-plans/roles/999999')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('lista cargos → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career-plans/roles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Planos de carreira — CRUD e ownership', () => {
    it('RH cria plano de carreira para o colaborador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career-plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, title: 'Plano Integração', targetRoleId: roleId })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      planId = res.body.id;
    });

    it('dono vê o próprio plano com readiness calculada → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/career-plans/${planId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('readiness');
      // Cargo sem skillRequirements → sempre pronto (100)
      expect(res.body.readiness.score).toBe(100);
    });

    it('outro colaborador não pode ver o plano alheio → 404', async () => {
      await request(app.getHttpServer())
        .get(`/career-plans/${planId}`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });

    it('GESTOR (privilegiado) pode ver qualquer plano', async () => {
      await request(app.getHttpServer())
        .get(`/career-plans/${planId}`)
        .set('Authorization', `Bearer ${gestorToken}`)
        .expect(200);
    });

    it('plano inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/career-plans/999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('dono vê o próprio plano via /my → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career-plans/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', planId);
    });

    it('RH activa o plano → status ACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/career-plans/${planId}/activate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ACTIVE');
    });
  });

  describe('Readiness e simulação — ownership (A10-11)', () => {
    it('colaborador vê a sua própria readiness → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/career-plans/readiness/${employeeId}/${roleId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('score');
    });

    it('colaborador não pode ver readiness de outro utilizador → 404', async () => {
      await request(app.getHttpServer())
        .get(`/career-plans/readiness/${otherEmployeeId}/${roleId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('colaborador não pode simular carreira de outro utilizador → 404', async () => {
      await request(app.getHttpServer())
        .post('/career-plans/simulate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: otherEmployeeId, targetRoleId: roleId })
        .expect(404);
    });

    it('colaborador pode simular a sua própria carreira → 200/201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career-plans/simulate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, targetRoleId: roleId });
      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('readiness');
    });
  });

  describe('Metas — ownership (A10-14 via findOne)', () => {
    it('dono adiciona meta ao seu plano → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career-plans/goals')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ careerPlanId: planId, title: 'Concluir curso X', type: 'COURSE' })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      goalId = res.body.id;
    });

    it('outro colaborador não pode adicionar meta a plano alheio → 404', async () => {
      await request(app.getHttpServer())
        .post('/career-plans/goals')
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .send({ careerPlanId: planId, title: 'Meta intrusa', type: 'OTHER' })
        .expect(404);
    });

    it('dono actualiza progresso da meta para 100 → COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/career-plans/goals/${goalId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ progress: 100 })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('outro colaborador não pode actualizar progresso de meta alheia → 404', async () => {
      await request(app.getHttpServer())
        .patch(`/career-plans/goals/${goalId}/progress`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .send({ progress: 50 })
        .expect(404);
    });

    it('dono vê o progresso agregado do plano → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/career-plans/${planId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.completed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Promoções — ownership (A10-14)', () => {
    it('colaborador não pode solicitar promoção em nome de outro → 404', async () => {
      await request(app.getHttpServer())
        .post('/career-plans/promotions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: otherEmployeeId, targetRoleId: roleId, justification: 'x' })
        .expect(404);
    });

    it('colaborador solicita a sua própria promoção → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/career-plans/promotions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, targetRoleId: roleId, justification: 'Pronto para o cargo' })
        .expect(201);
      expect(res.body.status).toBe('PENDING');
      promotionId = res.body.id;
    });

    it('colaborador não pode rever promoções → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/career-plans/promotions/${promotionId}/review`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ approved: true })
        .expect(403);
    });

    it('RH aprova a promoção → APPROVED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/career-plans/promotions/${promotionId}/review`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ approved: true, notes: 'Aprovado em integração' })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('rever promoção já processada → 400', async () => {
      await request(app.getHttpServer())
        .patch(`/career-plans/promotions/${promotionId}/review`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ approved: false })
        .expect(400);
    });

    it('rever promoção inexistente → 404', async () => {
      await request(app.getHttpServer())
        .patch('/career-plans/promotions/999999/review')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ approved: true })
        .expect(404);
    });

    it('lista pedidos de promoção → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/career-plans/promotions')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });
  });
});
