import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Performance Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;
  let rhId: number;
  let departmentId: number | null;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let originalEmployeeManagerId: number | null;
  let cycleId: number;
  let selfReviewId: number;
  let managerReviewId: number;
  let goalId: number;

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
    originalEmployeeManagerId = employee!.managerId;
    departmentId = employee!.departmentId;

    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    managerId = manager!.id;

    const rh = await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } });
    rhId = rh!.id;

    await prisma.user.update({ where: { id: employeeId }, data: { managerId } });
  });

  afterAll(async () => {
    await prisma.user.update({
      where: { id: employeeId },
      data: { managerId: originalEmployeeManagerId },
    });

    if (goalId) {
      await prisma.performanceGoal.deleteMany({ where: { id: goalId } }).catch(() => undefined);
    }
    if (cycleId) {
      // CalibrationLog/PerformanceDispute apontam para PerformanceReview com
      // ON DELETE RESTRICT — têm de ser eliminados antes das reviews, senão a
      // review (ex: managerReviewId, que fica de propósito por não poder ser
      // removida — ver bloco "Remoção") bloqueia o deleteMany da review, que
      // por sua vez bloqueia o deleteMany do ciclo (também FK RESTRICT),
      // deixando lixo acumulado a cada execução isolada deste spec.
      const reviews = await prisma.performanceReview.findMany({
        where: { cycleId },
        select: { id: true },
      });
      const reviewIds = reviews.map(r => r.id);
      await prisma.calibrationLog
        .deleteMany({ where: { reviewId: { in: reviewIds } } })
        .catch(() => undefined);
      await prisma.performanceDispute
        .deleteMany({ where: { reviewId: { in: reviewIds } } })
        .catch(() => undefined);
      await prisma.continuousFeedback.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.nineBoxPlacement.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.performanceReview.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.performanceGoal.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.performanceCycle.deleteMany({ where: { id: cycleId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Autenticação e RBAC', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/performance/cycles').expect(401);
    });

    it('colaborador não acede a GET /performance (findAll)', async () => {
      await request(app.getHttpServer())
        .get('/performance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('colaborador não acede a /performance/analytics', async () => {
      await request(app.getHttpServer())
        .get('/performance/analytics')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('colaborador não acede a /performance/9box', async () => {
      await request(app.getHttpServer())
        .get('/performance/9box')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Ciclos de avaliação', () => {
    it('colaborador não pode criar ciclo', async () => {
      await request(app.getHttpServer())
        .post('/performance/cycles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', type: 'ANNUAL', startDate: '2026-01-01', endDate: '2026-12-31' })
        .expect(403);
    });

    it('pesos que não somam 100 → 400', async () => {
      await request(app.getHttpServer())
        .post('/performance/cycles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Ciclo Inválido',
          type: 'ANNUAL',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          goalsWeight: 50,
          competenciesWeight: 50,
          behaviorsWeight: 50,
        })
        .expect(400);
    });

    it('RH cria ciclo com pesos default (40/40/20)', async () => {
      const res = await request(app.getHttpServer())
        .post('/performance/cycles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Int Test Cycle',
          type: 'ANNUAL',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        })
        .expect(201);
      cycleId = res.body.id;
      expect(res.body.status).toBe('PLANNED');
    });

    it('GET /performance/cycles inclui o ciclo criado', async () => {
      const res = await request(app.getHttpServer())
        .get('/performance/cycles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.id === cycleId)).toBe(true);
    });

    it('RH activa o ciclo', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/performance/cycles/${cycleId}/activate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('activar de novo (já ACTIVE, não PLANNED) → 400', async () => {
      await request(app.getHttpServer())
        .patch(`/performance/cycles/${cycleId}/activate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(400);
    });

    it('activar ciclo inexistente → 404', async () => {
      await request(app.getHttpServer())
        .patch('/performance/cycles/999999/activate')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('GET /performance/cycles/current devolve o ciclo activo', async () => {
      const res = await request(app.getHttpServer())
        .get('/performance/cycles/current')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(cycleId);
    });
  });

  describe('Reviews — criação e ownership (bug: reviewerId omitido nunca era submetível)', () => {
    it('colaborador não pode criar review', async () => {
      await request(app.getHttpServer())
        .post('/performance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, cycleId, type: 'SELF' })
        .expect(403);
    });

    it('RH cria review SELF para o colaborador', async () => {
      const res = await request(app.getHttpServer())
        .post('/performance')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, cycleId, type: 'SELF' })
        .expect(201);
      selfReviewId = res.body.id;
      expect(res.body.status).toBe('PENDING_SELF');
    });

    it('review duplicada (mesmo userId+cycleId+type) → 409', async () => {
      await request(app.getHttpServer())
        .post('/performance')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, cycleId, type: 'SELF' })
        .expect(409);
    });

    it('RH cria review MANAGER sem reviewerId explícito — deve resolver para o gestor directo', async () => {
      const res = await request(app.getHttpServer())
        .post('/performance')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, cycleId, type: 'MANAGER' })
        .expect(201);
      managerReviewId = res.body.id;

      const detail = await request(app.getHttpServer())
        .get(`/performance/${managerReviewId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(detail.body.reviewerId).toBe(managerId);
    });

    it('RH (privilegiado) vê a review SELF do colaborador', async () => {
      await request(app.getHttpServer())
        .get(`/performance/${selfReviewId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('o avaliado vê a própria review SELF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/performance/${selfReviewId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(selfReviewId);
    });

    it('o gestor (reviewer) vê a review MANAGER mesmo sem ser ADMIN/RH/GESTOR-privilegiado do target', async () => {
      const res = await request(app.getHttpServer())
        .get(`/performance/${managerReviewId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.id).toBe(managerReviewId);
    });
  });

  describe('Submissão de avaliação', () => {
    it('outro colaborador não pode submeter a auto-avaliação alheia', async () => {
      await request(app.getHttpServer())
        .post('/performance/submit')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reviewId: selfReviewId, score: 4 })
        .expect(403);
    });

    it('o avaliado submete a própria auto-avaliação', async () => {
      const res = await request(app.getHttpServer())
        .post('/performance/submit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ reviewId: selfReviewId, score: 4 })
        .expect(200);
      expect(res.body.status).toBe('PENDING_MANAGER');
    });

    it('score extremo sem justificativa → 400', async () => {
      await request(app.getHttpServer())
        .post('/performance/submit')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reviewId: managerReviewId, score: 5 })
        .expect(400);
    });

    it('gestor submete a review MANAGER (reviewerId resolvido correctamente) → CALIBRATION', async () => {
      const res = await request(app.getHttpServer())
        .post('/performance/submit')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reviewId: managerReviewId, score: 4, justification: 'Bom desempenho geral' })
        .expect(200);
      expect(res.body.status).toBe('CALIBRATION');
    });
  });

  describe('Calibração e disputa', () => {
    it('RH calibra a review em CALIBRATION → PUBLISHED', async () => {
      await request(app.getHttpServer())
        .post('/performance/calibrate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reviewId: managerReviewId, calibratedScore: 4.2, reason: 'Ajuste de calibração' })
        .expect(200);

      const detail = await request(app.getHttpServer())
        .get(`/performance/${managerReviewId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(detail.body.status).toBe('PUBLISHED');
      expect(detail.body.calibrationLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('calibrar review que já não está em CALIBRATION → 400', async () => {
      await request(app.getHttpServer())
        .post('/performance/calibrate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reviewId: managerReviewId, calibratedScore: 3, reason: 'Repetido' })
        .expect(400);
    });

    it('outro colaborador não pode contestar review alheia', async () => {
      await request(app.getHttpServer())
        .post('/performance/dispute')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reviewId: managerReviewId, reason: 'Não concordo' })
        .expect(403);
    });

    it('o avaliado contesta a própria review PUBLISHED', async () => {
      await request(app.getHttpServer())
        .post('/performance/dispute')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ reviewId: managerReviewId, reason: 'Considero o score baixo' })
        .expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/performance/${managerReviewId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(detail.body.status).toBe('DISPUTE');
    });

    it('contestar review que não está PUBLISHED → 400', async () => {
      await request(app.getHttpServer())
        .post('/performance/dispute')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ reviewId: managerReviewId, reason: 'Repetido' })
        .expect(400);
    });
  });

  describe('Remoção (bug: CalibrationLog/PerformanceDispute são ON DELETE RESTRICT)', () => {
    it('remover review com calibração/disputa associada → 400, não 500', async () => {
      await request(app.getHttpServer())
        .delete(`/performance/${managerReviewId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('remover review sem histórico associado → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/performance/${selfReviewId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      selfReviewId = 0 as any;
    });
  });

  describe('Goals (ownership A10-21)', () => {
    it('colaborador não pode criar goal para outro utilizador → 404', async () => {
      await request(app.getHttpServer())
        .post('/performance/goals')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: managerId, cycleId, title: 'Goal alheio', targetValue: 100 })
        .expect(404);
    });

    it('colaborador cria goal para si próprio', async () => {
      const res = await request(app.getHttpServer())
        .post('/performance/goals')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, cycleId, title: 'Aumentar vendas', targetValue: 100 })
        .expect(201);
      goalId = res.body.id;
      expect(res.body.status).toBe('ON_TRACK');
    });

    it('gestor não pode actualizar o progresso do goal alheio', async () => {
      await request(app.getHttpServer())
        .patch(`/performance/goals/${goalId}/progress`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ currentValue: 50 })
        .expect(403);
    });

    it('o dono actualiza o progresso — 50% → AT_RISK ou ON_TRACK conforme thresholds', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/performance/goals/${goalId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ currentValue: 50 })
        .expect(200);
      expect(res.body.progress).toBe(50);
      expect(res.body.status).toBe('AT_RISK');
    });

    it('atingir 100% → COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/performance/goals/${goalId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ currentValue: 100 })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('GET /performance/my/goals lista o goal do colaborador', async () => {
      const res = await request(app.getHttpServer())
        .get('/performance/my/goals')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ cycleId })
        .expect(200);
      expect(res.body.some((g: any) => g.id === goalId)).toBe(true);
    });
  });

  describe('Feedback contínuo', () => {
    it('gestor dá feedback ao colaborador', async () => {
      await request(app.getHttpServer())
        .post('/performance/feedback')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ targetUserId: employeeId, type: 'PRAISE', message: 'Excelente trabalho!' })
        .expect(201);
    });

    it('GET /performance/my/feedback devolve o feedback recebido', async () => {
      const res = await request(app.getHttpServer())
        .get('/performance/my/feedback')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((f: any) => f.message === 'Excelente trabalho!')).toBe(true);
    });
  });

  describe('9-Box', () => {
    it('RH posiciona o colaborador na 9-box (bug: PUT :id sombreava PUT 9box)', async () => {
      await request(app.getHttpServer())
        .put('/performance/9box')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          userId: employeeId,
          performanceAxis: 3,
          potentialAxis: 2,
          justification: 'Alto desempenho',
          cycleId,
        })
        .expect(200);
    });

    it('GET /performance/9box inclui o colaborador na célula correcta', async () => {
      const res = await request(app.getHttpServer())
        .get('/performance/9box')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ cycleId })
        .expect(200);
      expect(res.body.grid['3-2'].some((e: any) => e.user.id === employeeId)).toBe(true);
    });
  });

  describe('Equipa, departamento e analytics', () => {
    it('gestor vê a sua equipa (colaborador incluído)', async () => {
      const res = await request(app.getHttpServer())
        .get('/performance/team')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ cycleId })
        .expect(200);
      expect(res.body.team.some((t: any) => t.user.id === employeeId)).toBe(true);
    });

    it('RH consulta estatísticas do departamento', async () => {
      if (!departmentId) return;
      await request(app.getHttpServer())
        .get(`/performance/department/${departmentId}/stats`)
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ cycleId })
        .expect(200);
    });

    it('RH consulta analytics globais', async () => {
      const res = await request(app.getHttpServer())
        .get('/performance/analytics')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ cycleId })
        .expect(200);
      expect(res.body.totalReviews).toBeGreaterThanOrEqual(1);
    });
  });
});
