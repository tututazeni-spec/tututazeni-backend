import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Engagement Integration', () => {
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

  let surveyId: number;
  let questionId: number;
  let textQuestionId: number;
  let multipleQuestionId: number;
  let feedbackId: number;
  let oneOnOneId: number;
  let actionPlanId: number;

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
    if (actionPlanId) {
      await prisma.engagementAction
        .deleteMany({ where: { id: actionPlanId } })
        .catch(() => undefined);
    }
    if (oneOnOneId) {
      await prisma.oneOnOneMeeting.deleteMany({ where: { id: oneOnOneId } }).catch(() => undefined);
    }
    await prisma.feedback
      .deleteMany({
        where: { toUserId: managerId, OR: [{ fromUserId: employeeId }, { fromUserId: null }] },
      })
      .catch(() => undefined);
    await prisma.recognition
      .deleteMany({ where: { fromUserId: employeeId, toUserId: managerId } })
      .catch(() => undefined);
    await prisma.moodCheckin.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    if (surveyId) {
      await prisma.surveyAnswer
        .deleteMany({ where: { response: { surveyId } } })
        .catch(() => undefined);
      await prisma.surveyResponse.deleteMany({ where: { surveyId } }).catch(() => undefined);
      await prisma.surveyQuestion.deleteMany({ where: { surveyId } }).catch(() => undefined);
      await prisma.engagementSurvey.deleteMany({ where: { id: surveyId } }).catch(() => undefined);
    }
    await prisma.userPoints
      .updateMany({ where: { userId: { in: [employeeId, managerId] } }, data: {} })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Surveys — verifica correcção (targetDepartmentIds/frequency não existem em EngagementSurvey)', () => {
    it('colaborador não pode criar survey → 403', async () => {
      await request(app.getHttpServer())
        .post('/engagement/surveys')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'X', type: 'PULSE', questions: [] })
        .expect(403);
    });

    it('RH cria survey com targetDepartmentIds e frequency (antes rebentava) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/surveys')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Int Test Pulse Survey',
          type: 'PULSE',
          targetDepartmentIds: [1],
          frequency: 'MONTHLY',
          questions: [
            { text: 'Como avalias o teu bem-estar?', type: 'SCALE', scaleMax: 5, order: 1 },
            { text: 'Algum comentário adicional?', type: 'TEXT', required: false, order: 2 },
            {
              text: 'Qual destas áreas precisa de mais atenção?',
              type: 'MULTIPLE',
              required: false,
              options: ['Comunicação', 'Carga de trabalho', 'Reconhecimento'],
              order: 3,
            },
          ],
        })
        .expect(201);
      surveyId = res.body.id;
      questionId = res.body.questions[0].id;
      textQuestionId = res.body.questions[1].id;
      multipleQuestionId = res.body.questions[2].id;
      expect(surveyId).toBeDefined();
    });

    it('RH activa o survey → notifica todos os utilizadores activos', async () => {
      const res = await request(app.getHttpServer())
        .post(`/engagement/surveys/${surveyId}/activate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('GET /engagement/surveys/:id — 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/engagement/surveys/${surveyId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(surveyId);
    });

    it('colaborador submete respostas — verifica correcção (value opcional + selectedOption existe) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/surveys/respond')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          surveyId,
          answers: [
            { questionId, value: 4 },
            { questionId: textQuestionId, comment: 'Tudo bem, sem observações' },
            { questionId: multipleQuestionId, selectedOption: 'Reconhecimento' },
          ],
        })
        .expect(201);
      expect(res.body.message).toBeTruthy();
    });

    it('resubmissão é ignorada graciosamente (não duplica)', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/surveys/respond')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ surveyId, answers: [{ questionId, value: 2 }] })
        .expect(201);
      expect(res.body.alreadySubmitted).toBe(true);
    });

    it('GET /engagement/surveys/:id/results — reflecte a resposta MULTIPLE (selectedOption) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/engagement/surveys/${surveyId}/results`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const multipleStats = res.body.questionStats.find((q: any) => q.type === 'MULTIPLE');
      expect(multipleStats.optionCount.Reconhecimento).toBe(1);
    });

    it('RH fecha o survey → COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/engagement/surveys/${surveyId}/close`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('GET /engagement/surveys/templates — gestor → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/surveys/templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Mood tracking', () => {
    it('colaborador faz check-in de humor → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/mood/checkin')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ mood: 4, note: 'Dia produtivo' })
        .expect(201);
      expect(res.body.checkin.mood).toBe(4);
    });

    it('segundo check-in no mesmo dia é ignorado graciosamente', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/mood/checkin')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ mood: 5 })
        .expect(201);
      expect(res.body.mood).toBe(4);
    });

    it('GET /engagement/mood/my-trend — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/mood/my-trend')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.trend.length).toBeGreaterThanOrEqual(1);
    });

    it('gestor vê o humor da própria equipa → 200', async () => {
      await request(app.getHttpServer())
        .get(`/engagement/mood/team/${managerId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('gestor não pode ver a equipa de outro gestor (ownership A3) → 403', async () => {
      await request(app.getHttpServer())
        .get(`/engagement/mood/team/${employeeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });
  });

  describe('Feedback', () => {
    it('colaborador dá feedback ao gestor → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/feedback')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ toUserId: managerId, type: 'OPEN', message: 'Excelente liderança este mês' })
        .expect(201);
      feedbackId = res.body.id;
      expect(feedbackId).toBeDefined();
    });

    it('feedback anónimo esconde o remetente na listagem', async () => {
      await request(app.getHttpServer())
        .post('/engagement/feedback')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          toUserId: managerId,
          type: 'ANONYMOUS',
          anonymous: true,
          message: 'Feedback anónimo de teste',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/engagement/feedback')
        .query({ toUserId: managerId })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const anon = res.body.data.find((f: any) => f.anonymous);
      expect(anon.from.fullName).toBe('Anónimo');
    });

    it('gestor responde ao feedback → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/engagement/feedback/${feedbackId}/reply`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ message: 'Obrigado pelo feedback!' })
        .expect(201);
      expect(res.body.status).toBe('REPLIED');
    });
  });

  describe('Recognition & Leaderboard', () => {
    it('não se pode auto-reconhecer → 400', async () => {
      await request(app.getHttpServer())
        .post('/engagement/recognition')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ toUserId: employeeId, type: 'KUDOS', message: 'X' })
        .expect(400);
    });

    it('colaborador dá kudos ao gestor → 201 e atribui XP', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/recognition')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ toUserId: managerId, type: 'KUDOS', message: 'Óptimo trabalho em equipa!' })
        .expect(201);
      expect(res.body.xpAwarded).toBe(15);
    });

    it('GET /engagement/recognition/feed — 200 inclui o kudos', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/recognition/feed')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((r: any) => r.to.id === managerId)).toBe(true);
    });

    it('GET /engagement/recognition/leaderboard — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/recognition/leaderboard')
        .query({ type: 'points' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('1:1 Meetings', () => {
    it('gestor agenda 1:1 com o colaborador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/one-on-one')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          participantId: employeeId,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          agenda: 'Ponto de situação mensal',
          recurring: true,
          frequency: 'MONTHLY',
        })
        .expect(201);
      oneOnOneId = res.body.id;
      expect(res.body.frequency).toBe('MONTHLY');
    });

    it('GET /engagement/one-on-one/my — participante vê o seu 1:1 → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/one-on-one/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((m: any) => m.id === oneOnOneId)).toBe(true);
    });

    it('RH (privilegiado) também pode actualizar mesmo não sendo participante', async () => {
      await request(app.getHttpServer())
        .patch(`/engagement/one-on-one/${oneOnOneId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ agenda: 'Pauta revista pelo RH' })
        .expect(200);
    });

    it('participante marca o 1:1 como concluído → COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/engagement/one-on-one/${oneOnOneId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ completed: true, notes: 'Reunião produtiva' })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });
  });

  describe('Action Plans', () => {
    it('gestor cria plano de acção → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/engagement/action-plans')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Melhorar comunicação da equipa',
          description: 'Baseado nos resultados do último survey',
          assigneeId: employeeId,
        })
        .expect(201);
      actionPlanId = res.body.id;
      expect(res.body.status).toBe('OPEN');
    });

    it('GET /engagement/action-plans — gestor → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/action-plans')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === actionPlanId)).toBe(true);
    });

    it('gestor actualiza progresso do plano → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/engagement/action-plans/${actionPlanId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ progress: 50, status: 'IN_PROGRESS' })
        .expect(200);
      expect(res.body.progress).toBe(50);
    });
  });

  describe('Analytics', () => {
    it('GET /engagement/dashboard — gestor → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.kpis).toBeDefined();
    });

    it('GET /engagement/index — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/index')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.level).toBeDefined();
    });

    it('GET /engagement/heatmap — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/heatmap')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('gestor não pode aceder ao heatmap (ADMIN_ROLES) → 403', async () => {
      await request(app.getHttpServer())
        .get('/engagement/heatmap')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('GET /engagement/manager-insights/:managerId — 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/engagement/manager-insights/${managerId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /engagement/human-success-score/:userId — próprio → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/engagement/human-success-score/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.humanSuccessScore).toBeDefined();
    });

    it('colaborador não pode ver o HSS de outro colega (A10-22) → 403', async () => {
      await request(app.getHttpServer())
        .get(`/engagement/human-success-score/${managerId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor (GESTOR) pode ver o HSS de um subordinado', async () => {
      await request(app.getHttpServer())
        .get(`/engagement/human-success-score/${employeeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('GET /engagement/my-summary — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/engagement/my-summary')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.xpPoints).toBeGreaterThanOrEqual(0);
    });
  });
});
