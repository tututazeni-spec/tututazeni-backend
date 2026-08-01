import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Development Plans (PDI) Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;
  let otherEmployeeId: number;
  let otherEmployeeToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let planId: number;
  let secondPlanId: number;
  let actionId: number;
  let goalId: number;
  let checkpointId: number;

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
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    managerId = manager!.id;

    // Segundo colaborador não-privilegiado dedicado — necessário para testar
    // rejeição de ownership real: RH/ADMIN/GESTOR são todos privilegiados
    // (bypass) na convenção deste módulo, só um COLABORADOR que não seja o
    // dono é realmente bloqueado.
    const colaboradorRole = await prisma.role.findFirst({ where: { code: 'COLABORADOR' } });
    const otherEmployee = await prisma.user.upsert({
      where: { email: 'int.other-employee-devplans@innova-test.com' },
      update: {},
      create: {
        email: 'int.other-employee-devplans@innova-test.com',
        fullName: 'Other Employee DevPlans',
        password: employee!.password,
        roleId: colaboradorRole!.id,
        departmentId: employee!.departmentId,
        active: true,
      },
    });
    otherEmployeeId = otherEmployee.id;
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmployee.email, password: 'Test@1234' })
      .expect(201);
    otherEmployeeToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    const ids = [planId, secondPlanId].filter(Boolean);
    await prisma.certificate
      .deleteMany({ where: { developmentPlanId: { in: ids } } })
      .catch(() => undefined);
    await prisma.pdiApproval.deleteMany({ where: { planId: { in: ids } } }).catch(() => undefined);
    await prisma.pdiCheckpoint
      .deleteMany({ where: { planId: { in: ids } } })
      .catch(() => undefined);
    await prisma.pdiGoal.deleteMany({ where: { planId: { in: ids } } }).catch(() => undefined);
    await prisma.pdiEvidence
      .deleteMany({ where: { developmentPlanAction: { planId: { in: ids } } } })
      .catch(() => undefined);
    await prisma.developmentPlanAction
      .deleteMany({ where: { planId: { in: ids } } })
      .catch(() => undefined);
    await prisma.developmentPlan.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: otherEmployeeId } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Criação e ciclo de vida do plano', () => {
    it('RH cria plano em DRAFT para o colaborador (managerId = manager real)', async () => {
      const res = await request(app.getHttpServer())
        .post('/development-plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'PDI Integração',
          goal: 'Evoluir para Sénior',
          userId: employeeId,
          managerId,
        })
        .expect(201);
      planId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('colaborador dono submete o próprio plano para aprovação → PENDING_APPROVAL', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/development-plans/${planId}/submit`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.status).toBe('PENDING_APPROVAL');
    });

    it('outro colaborador não pode submeter o plano alheio → 404 (verifica correcção do IDOR)', async () => {
      // recriar um novo plano DRAFT para este teste, já que o anterior já não está em DRAFT
      const created = await request(app.getHttpServer())
        .post('/development-plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'PDI Alheio', goal: 'x', userId: employeeId, managerId })
        .expect(201);
      secondPlanId = created.body.id;

      await request(app.getHttpServer())
        .patch(`/development-plans/${secondPlanId}/submit`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });

    it('gestor designado (managerId real do plano) aprova → ACTIVE', async () => {
      await request(app.getHttpServer())
        .patch(`/development-plans/${secondPlanId}/submit`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/development-plans/approve')
        .set('Authorization', `Bearer ${managerToken}`) // managerId é o gestor designado deste plano
        .send({ planId: secondPlanId, decision: 'approve' })
        .expect(200);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('colaborador (role COLABORADOR) não pode aprovar — bloqueado pelo @Roles antes de chegar à verificação de ownership', async () => {
      const created = await request(app.getHttpServer())
        .post('/development-plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'PDI Terceiro', goal: 'x', userId: employeeId, managerId })
        .expect(201);
      const thirdPlanId = created.body.id;

      await request(app.getHttpServer())
        .patch(`/development-plans/${thirdPlanId}/submit`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/development-plans/approve')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ planId: thirdPlanId, decision: 'approve' })
        .expect(403);

      // limpar este plano extra directamente (não faz parte do afterAll ids[])
      await prisma.developmentPlan.delete({ where: { id: thirdPlanId } }).catch(() => undefined);
    });

    it('RH (privilegiado) aprova plano PENDING_APPROVAL de qualquer gestor → ACTIVE', async () => {
      const created = await request(app.getHttpServer())
        .post('/development-plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'PDI via RH', goal: 'x', userId: employeeId, managerId })
        .expect(201);
      const rhPlanId = created.body.id;

      await request(app.getHttpServer())
        .patch(`/development-plans/${rhPlanId}/submit`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/development-plans/approve')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ planId: rhPlanId, decision: 'approve' })
        .expect(200);
      expect(res.body.status).toBe('ACTIVE');

      await prisma.developmentPlan.delete({ where: { id: rhPlanId } }).catch(() => undefined);
    });
  });

  describe('Detalhe e ownership', () => {
    it('dono acede ao próprio plano → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/development-plans/${planId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(planId);
    });

    it('outro colaborador não-privilegiado não acede → 404', async () => {
      await request(app.getHttpServer())
        .get(`/development-plans/${planId}`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });
  });

  describe('Acções, evidências, metas e checkpoints', () => {
    it('dono adiciona acção ao plano', async () => {
      const res = await request(app.getHttpServer())
        .post('/development-plans/actions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ planId, title: 'Curso de Liderança', type: 'COURSE', xpReward: 50 })
        .expect(201);
      actionId = res.body.id;
      expect(res.body.status).toBe('TODO');
    });

    it('adicionar evidência à acção — verifica correcção do campo FK (developmentPlanActionId, não actionId)', async () => {
      const res = await request(app.getHttpServer())
        .post('/development-plans/evidence')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ actionId, title: 'Certificado do curso', url: 'https://ci.innova.test/cert.pdf' })
        .expect(201);
      expect(res.body.title).toBe('Certificado do curso');

      const row = await prisma.pdiEvidence.findUnique({ where: { id: res.body.id } });
      expect(row!.developmentPlanActionId).toBe(actionId);

      const action = await prisma.developmentPlanAction.findUnique({ where: { id: actionId } });
      expect(action!.status).toBe('IN_PROGRESS'); // auto-avança de TODO
    });

    it('outro colaborador não pode editar a acção alheia → 404', async () => {
      await request(app.getHttpServer())
        .put(`/development-plans/actions/${actionId}`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .send({ status: 'COMPLETED' })
        .expect(404);
    });

    it('dono conclui a acção → atribui XP ao dono do plano', async () => {
      const before = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      const pointsBefore = before?.points ?? 0;

      const res = await request(app.getHttpServer())
        .put(`/development-plans/actions/${actionId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect(res.body.progress).toBe(100);

      const after = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      expect(after!.points - pointsBefore).toBe(50);
    });

    it('adicionar meta SMART ao plano', async () => {
      const res = await request(app.getHttpServer())
        .post('/development-plans/goals')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ planId, title: 'Liderar 1 projecto', weight: 100 })
        .expect(201);
      goalId = res.body.id;
    });

    it('actualizar progresso da meta → recalcula overallProgress do plano', async () => {
      await request(app.getHttpServer())
        .patch('/development-plans/goals/progress')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ goalId, progress: 100 })
        .expect(200);

      const plan = await prisma.developmentPlan.findUnique({ where: { id: planId } });
      expect(plan!.overallProgress).toBeGreaterThan(0);
    });

    it('agendar checkpoint', async () => {
      const res = await request(app.getHttpServer())
        .post('/development-plans/checkpoints')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ planId, title: 'Check-in mensal', scheduledAt: '2027-01-01' })
        .expect(201);
      checkpointId = res.body.id;
    });

    it('outro colaborador não pode concluir o checkpoint alheio → 404', async () => {
      await request(app.getHttpServer())
        .patch('/development-plans/checkpoints/complete')
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .send({ checkpointId, selfScore: 5 })
        .expect(404);
    });

    it('dono conclui o checkpoint', async () => {
      const res = await request(app.getHttpServer())
        .patch('/development-plans/checkpoints/complete')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ checkpointId, selfScore: 5 })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });
  });

  describe('Conclusão do plano (certificado + XP)', () => {
    it('RH conclui o plano ACTIVE → COMPLETED, emite certificado e +300 XP', async () => {
      const before = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      const pointsBefore = before?.points ?? 0;

      const res = await request(app.getHttpServer())
        .patch(`/development-plans/${planId}/complete`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');

      const cert = await prisma.certificate.findFirst({ where: { developmentPlanId: planId } });
      expect(cert).toBeTruthy();
      expect(cert!.type).toBe('DEVELOPMENT');

      const after = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      expect(after!.points - pointsBefore).toBe(300);
    });

    it('não é possível adicionar acções a um plano COMPLETED → 400', async () => {
      await request(app.getHttpServer())
        .post('/development-plans/actions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ planId, title: 'Acção tardia', type: 'READING' })
        .expect(400);
    });
  });

  describe('Dashboards', () => {
    it('GET /my — colaborador vê os próprios planos', async () => {
      const res = await request(app.getHttpServer())
        .get('/development-plans/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((p: any) => p.id === planId)).toBe(true);
    });

    it('GET /my/stats — reflecte XP e planos concluídos', async () => {
      const res = await request(app.getHttpServer())
        .get('/development-plans/my/stats')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.plans.completed).toBeGreaterThanOrEqual(1);
      expect(res.body.totalXp).toBeGreaterThanOrEqual(350);
    });

    it('GET /team/dashboard — gestor vê planos da sua equipa', async () => {
      const res = await request(app.getHttpServer())
        .get('/development-plans/team/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET / — RH lista com filtros', async () => {
      const res = await request(app.getHttpServer())
        .get('/development-plans')
        .query({ userId: employeeId })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === planId)).toBe(true);
    });

    it('filtro overdue=false — verifica correcção do bug de coerção booleana', async () => {
      const res = await request(app.getHttpServer())
        .get('/development-plans')
        .query({ userId: employeeId, overdue: 'false' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('colaborador não pode listar todos os planos → 403', async () => {
      await request(app.getHttpServer())
        .get('/development-plans')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Cancelamento e eliminação', () => {
    it('Admin cancela um plano (usando o terceiro criado neste describe)', async () => {
      const created = await request(app.getHttpServer())
        .post('/development-plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'PDI Para Cancelar', goal: 'x', userId: employeeId, managerId })
        .expect(201);
      const cancelPlanId = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/development-plans/${cancelPlanId}/cancel`)
        .query({ reason: 'Reestruturação' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.status).toBe('CANCELLED');

      await request(app.getHttpServer())
        .delete(`/development-plans/${cancelPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const row = await prisma.developmentPlan.findUnique({ where: { id: cancelPlanId } });
      expect(row).toBeNull();
    });

    it('não é possível eliminar plano ACTIVE directamente → 403', async () => {
      const created = await request(app.getHttpServer())
        .post('/development-plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'PDI Activo', goal: 'x', userId: employeeId, managerId })
        .expect(201);
      const activePlanId = created.body.id;
      await prisma.developmentPlan.update({
        where: { id: activePlanId },
        data: { status: 'ACTIVE' },
      });

      await request(app.getHttpServer())
        .delete(`/development-plans/${activePlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      await prisma.developmentPlan.delete({ where: { id: activePlanId } }).catch(() => undefined);
    });
  });
});
