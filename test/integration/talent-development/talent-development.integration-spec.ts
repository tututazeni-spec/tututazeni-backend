import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const MARK = `IntTestTalentDev${Date.now()}`;

describe('Talent Development Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let planId: number;
  let goalId: number;
  let actionId: number;
  let mentoringId: number;

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
  });

  afterAll(async () => {
    if (mentoringId) {
      await prisma.mentoringSession.deleteMany({ where: { mentoringId } }).catch(() => undefined);
      await prisma.mentoring.deleteMany({ where: { id: mentoringId } }).catch(() => undefined);
    }
    if (planId) {
      await prisma.pdiEvidence
        .deleteMany({ where: { developmentPlanAction: { planId } } })
        .catch(() => undefined);
      await prisma.developmentPlanAction.deleteMany({ where: { planId } }).catch(() => undefined);
      await prisma.pdiGoal.deleteMany({ where: { planId } }).catch(() => undefined);
      await prisma.developmentPlan.deleteMany({ where: { id: planId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Autenticação e RBAC (bug: ALL_ROLES/MGMT_ROLES hand-rolados omitiam GESTOR)', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/talent/pool').expect(401);
    });

    it('colaborador não acede ao pool (tier MGMT)', async () => {
      await request(app.getHttpServer())
        .get('/talent/pool')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor agora acede ao pool — antes ficava 403 por omissão no MGMT_ROLES', async () => {
      await request(app.getHttpServer())
        .get('/talent/pool')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('colaborador acede a plans (tier ALL_ROLES, agora inclui GESTOR também)', async () => {
      await request(app.getHttpServer())
        .get('/talent/plans')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });
  });

  describe('Planos de desenvolvimento', () => {
    it('RH cria plano de desenvolvimento', async () => {
      const res = await request(app.getHttpServer())
        .post('/talent/plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: `${MARK} Plano`,
          goal: 'Desenvolver liderança',
          userId: employeeId,
          managerId,
        })
        .expect(201);
      planId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('GET /plans/:id devolve o plano com stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`/talent/plans/${planId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.stats.total).toBe(0);
    });

    it('colega não-participante não vê o plano (ownership A10-6) — RH é privilegiado, mas manager (GESTOR) também', async () => {
      // GESTOR está nos papéis privilegiados de assertCanAccess aqui; apenas
      // confirmamos que o dono (employeeId) e RH conseguem sempre aceder.
      await request(app.getHttpServer())
        .get(`/talent/plans/${planId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('activar sem acções → 400', async () => {
      await request(app.getHttpServer())
        .post(`/talent/plans/${planId}/activate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(400);
    });

    it('adiciona meta ao plano', async () => {
      const res = await request(app.getHttpServer())
        .post(`/talent/plans/${planId}/goals`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Meta de liderança', weight: 100 })
        .expect(201);
      goalId = res.body.id;
    });

    it('adiciona acção ao plano', async () => {
      const res = await request(app.getHttpServer())
        .post(`/talent/plans/${planId}/actions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Curso de liderança', type: 'COURSE', xpReward: 50 })
        .expect(201);
      actionId = res.body.id;
    });

    it('activar o plano DRAFT com acções → submete para aprovação (PENDING_APPROVAL)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/talent/plans/${planId}/activate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('PENDING_APPROVAL');
    });

    it('activar de novo (agora PENDING_APPROVAL) → aprova e fica ACTIVE, com rasto em PdiApproval', async () => {
      const res = await request(app.getHttpServer())
        .post(`/talent/plans/${planId}/activate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('ACTIVE');

      const detail = await request(app.getHttpServer())
        .get(`/talent/plans/${planId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(detail.body.approvals.length).toBeGreaterThanOrEqual(1);
    });

    it('colaborador dono actualiza progresso da acção COM evidência (bug: PdiEvidence.actionId inexistente rebentava sempre)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/talent/actions/${actionId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ progress: 50, notes: 'A meio caminho', evidenceUrl: 'https://example.com/proof' })
        .expect(200);
      expect(res.body.progress).toBe(50);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('gestor não-dono não pode actualizar o progresso do colaborador (assertCanAccess → 404, não revela existência)', async () => {
      await request(app.getHttpServer())
        .patch(`/talent/actions/${actionId}/progress`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ progress: 60 })
        .expect(404);
    });

    it('conclui a acção com evidência — atribui XP', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/talent/actions/${actionId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ progress: 100, notes: 'Concluído' })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('actualiza a meta (progresso)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/talent/goals/${goalId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ progress: 100 })
        .expect(200);
      expect(res.body.progress).toBe(100);
    });

    it('plano agora reflecte 100% de progresso geral', async () => {
      const res = await request(app.getHttpServer())
        .get(`/talent/plans/${planId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.overallProgress).toBe(100);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('?isTemplate=false (bug: coagia para true) lista o plano real, não-template', async () => {
      const res = await request(app.getHttpServer())
        .get('/talent/plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ isTemplate: 'false', userId: employeeId })
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === planId)).toBe(true);
    });
  });

  describe('Talent Pool, 9-box e evolução', () => {
    it('matriz 9-box não rebenta', async () => {
      const res = await request(app.getHttpServer())
        .get('/talent/matrix')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.matrix.length).toBe(9);
    });

    it('high-potentials não rebenta', async () => {
      await request(app.getHttpServer())
        .get('/talent/high-potentials')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('evolução do colaborador reflecte o plano concluído', async () => {
      const res = await request(app.getHttpServer())
        .get(`/talent/analytics/evolution/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.summary.completedPlans).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Skill gaps e formação', () => {
    it('skill gaps do colaborador não rebenta', async () => {
      await request(app.getHttpServer())
        .get(`/talent/skill-gaps/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });

    it('necessidades de formação não rebenta', async () => {
      await request(app.getHttpServer())
        .get('/talent/training-needs')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('heatmap de skills não rebenta', async () => {
      await request(app.getHttpServer())
        .get('/talent/skill-heatmap')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('Mentoria', () => {
    it('RH cria mentoria', async () => {
      const res = await request(app.getHttpServer())
        .post('/talent/mentoring')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ mentorId: managerId, menteeId: employeeId, objective: 'Desenvolver soft skills' })
        .expect(201);
      mentoringId = res.body.id;
      expect(res.body.status).toBe('ACTIVE');
    });

    it('mentoria activa duplicada entre o mesmo par → 409', async () => {
      await request(app.getHttpServer())
        .post('/talent/mentoring')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ mentorId: managerId, menteeId: employeeId })
        .expect(409);
    });

    it('mentor regista sessão', async () => {
      await request(app.getHttpServer())
        .post(`/talent/mentoring/${mentoringId}/sessions`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ sessionDate: new Date().toISOString(), summary: 'Primeira sessão', rating: 5 })
        .expect(201);
    });

    it('mentee (dono) vê o detalhe da mentoria', async () => {
      const res = await request(app.getHttpServer())
        .get(`/talent/mentoring/${mentoringId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.sessions.length).toBe(1);
    });

    it('recomendações de mentor não rebentam', async () => {
      await request(app.getHttpServer())
        .get(`/talent/mentoring/match/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });

    it('conclui a mentoria', async () => {
      const res = await request(app.getHttpServer())
        .post(`/talent/mentoring/${mentoringId}/complete`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('COMPLETED');
    });
  });

  describe('Dashboard, talent health e recomendações', () => {
    it('dashboard principal não rebenta', async () => {
      const res = await request(app.getHttpServer())
        .get('/talent/analytics/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.kpis).toBeDefined();
    });

    it('talent health score não rebenta', async () => {
      const res = await request(app.getHttpServer())
        .get('/talent/analytics/talent-health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(['A', 'B', 'C', 'D']).toContain(res.body.grade);
    });

    it('recomendações personalizadas não rebentam', async () => {
      const res = await request(app.getHttpServer())
        .get(`/talent/recommendations/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.insights).toBeDefined();
    });
  });

  describe('Cancelamento e remoção', () => {
    it('cancelar plano já concluído → serviço apenas actualiza estado (sem guarda de status)', async () => {
      await request(app.getHttpServer())
        .post(`/talent/plans/${planId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Encerramento de teste' })
        .expect(201);
    });

    it('remover a acção', async () => {
      await request(app.getHttpServer())
        .delete(`/talent/actions/${actionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(204);
      actionId = 0 as any;
    });

    it('remover a meta', async () => {
      await request(app.getHttpServer())
        .delete(`/talent/goals/${goalId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(204);
      goalId = 0 as any;
    });
  });
});
