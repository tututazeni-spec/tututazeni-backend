import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const TENANT_ID = 'int-test-tenant';

describe('Evaluation360 Integration', () => {
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

  let competencyId: number;
  let cycleId: string;
  let questionId: string;
  let managerAssignmentId: string;
  let feedbackId: string;
  let pulseSurveyId: string;

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
    if (cycleId) {
      await prisma.evaluationAnswer
        .deleteMany({ where: { response: { cycleId } } })
        .catch(() => undefined);
      await prisma.evaluationResponse.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.evaluationResult.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.evaluatorAssignment.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.cycleParticipant.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.eval360Question.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.eval360CycleCompetency.deleteMany({ where: { cycleId } }).catch(() => undefined);
      await prisma.eval360Cycle.deleteMany({ where: { id: cycleId } }).catch(() => undefined);
    }
    if (feedbackId) {
      await prisma.eval360Feedback.deleteMany({ where: { id: feedbackId } }).catch(() => undefined);
    }
    if (pulseSurveyId) {
      await prisma.pulseSurveyResponse
        .deleteMany({ where: { surveyId: pulseSurveyId } })
        .catch(() => undefined);
      await prisma.pulseSurvey.deleteMany({ where: { id: pulseSurveyId } }).catch(() => undefined);
    }
    if (competencyId) {
      await prisma.competencyIndicator
        .deleteMany({ where: { competencyId } })
        .catch(() => undefined);
      await prisma.competency.deleteMany({ where: { id: competencyId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Competências', () => {
    it('RH cria competência com indicadores → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluation360/competencies')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Int Test Competency 360',
          type: 'SOFT_SKILL',
          isGlobal: true,
          indicators: [{ level: 1, description: 'Nível básico' }],
        })
        .expect(201);
      competencyId = +res.body.id;
      expect(competencyId).toBeDefined();
    });
  });

  describe('Ciclo — verifica correcção (String(req.user.id): createdBy é String, req.user.id é number)', () => {
    it('colaborador não pode criar ciclo → 403', async () => {
      await request(app.getHttpServer())
        .post('/evaluation360/cycles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          tenantId: TENANT_ID,
          name: 'X',
          model: 'DEG_360',
          type: 'ANUAL',
          startDate: '2026-01-01',
          endDate: '2026-03-01',
        })
        .expect(403);
    });

    it('RH cria ciclo 360 → 201 (createdBy persiste correctamente como string)', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluation360/cycles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          tenantId: TENANT_ID,
          name: 'Int Test 360 Cycle',
          model: 'DEG_360',
          type: 'ANUAL',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          weightSelf: 20,
          weightManager: 50,
          weightPeer: 30,
          weightSubordinate: 0,
          weightExternal: 0,
          quorumMinimum: 1,
          competencies: [{ competencyId: String(competencyId), weight: 1 }],
        })
        .expect(201);
      cycleId = res.body.id;
      expect(cycleId).toBeDefined();

      const row = await prisma.eval360Cycle.findUnique({ where: { id: cycleId } });
      expect(row!.createdBy).toBe(
        String((await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } }))!.id),
      );
    });

    it('publicar sem participantes → 400', async () => {
      await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('Questões e participantes', () => {
    it('RH cria questão vinculada ao ciclo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluation360/questions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          cycleId,
          competencyId: String(competencyId),
          text: 'Como avalias a comunicação deste colaborador?',
          type: 'LIKERT',
          isRequired: true,
          scaleMin: 1,
          scaleMax: 5,
        })
        .expect(201);
      questionId = res.body.id;
      expect(questionId).toBeDefined();
    });

    it('RH adiciona o colaborador como participante → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/participants`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userIds: [String(employeeId)] })
        .expect(201);
      expect(res.body.added).toBe(1);
    });

    it('colaborador não pode dar consentimento em nome de outro (A10-18) → 404 (não revela existência)', async () => {
      await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/participants/${employeeId}/consent`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ consent: true })
        .expect(404);
    });

    it('colaborador dá o seu próprio consentimento LGPD → 201', async () => {
      await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/participants/${employeeId}/consent`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ consent: true })
        .expect(201);
    });

    it('ainda sem questões suficientes para publicar → agora publica (já há 1 questão e 1 participante)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({})
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
    });
  });

  describe('Avaliadores', () => {
    it('sugere avaliadores automaticamente → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/evaluators/suggest`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ evaluateeId: String(employeeId) })
        .expect(201);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((s: any) => s.role === 'SELF')).toBe(true);
    });

    it('atribui o gestor como avaliador MANAGER → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/evaluators`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          assignments: [
            { evaluateeId: String(employeeId), evaluatorId: String(employeeId), role: 'SELF' },
            { evaluateeId: String(employeeId), evaluatorId: String(managerId), role: 'MANAGER' },
          ],
        })
        .expect(201);
      expect(res.body.created).toBe(2);

      const assignment = await prisma.evaluatorAssignment.findFirst({
        where: { cycleId, evaluatorId: String(managerId), role: 'MANAGER' },
      });
      managerAssignmentId = assignment!.id;
    });

    it('RH aprova os avaliadores → 200 (dispara convites)', async () => {
      const selfAssignment = await prisma.evaluatorAssignment.findFirst({
        where: { cycleId, evaluatorId: String(employeeId), role: 'SELF' },
      });
      const res = await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/evaluators/approve`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ assignmentIds: [managerAssignmentId, selfAssignment!.id] })
        .expect(200);
      expect(res.body.approved).toBe(2);
    });
  });

  describe('Formulário e resposta — verifica correcção (evaluatorId como String em toda a cadeia)', () => {
    it('gestor obtém o formulário de avaliação para o colaborador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluation360/cycles/${cycleId}/form`)
        .query({ evaluateeId: String(employeeId) })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.questions.length).toBeGreaterThanOrEqual(1);
    });

    it('gestor submete rascunho → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/responses`)
        .query({ evaluateeId: String(employeeId) })
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ answers: [{ questionId, numericValue: 4 }], submit: false })
        .expect(200);
      expect(res.body.status).toBe('DRAFT');
    });

    it('gestor submete definitivamente → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/responses`)
        .query({ evaluateeId: String(employeeId) })
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ answers: [{ questionId, numericValue: 4 }], submit: true })
        .expect(200);
      expect(res.body.status).toBe('SUBMITTED');
    });

    it('colaborador auto-avalia-se → 200', async () => {
      await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/responses`)
        .query({ evaluateeId: String(employeeId) })
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ answers: [{ questionId, numericValue: 5 }], submit: true })
        .expect(200);
    });
  });

  describe('Cálculo e resultados — verifica correcção (isOwnResult com String() em ambos os lados)', () => {
    it('RH calcula os resultados do ciclo → 202', async () => {
      await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/calculate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(202);
    });

    it('colaborador vê o seu próprio resultado (isOwnResult agora funciona)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluation360/cycles/${cycleId}/results/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.overallScore).toBeDefined();
      expect(res.body.rawByEvaluator).toBeNull();
    });

    it('RH vê o resultado completo (rawByEvaluator preenchido — verifica correcção do roleCode)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluation360/cycles/${cycleId}/results/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.rawByEvaluator).not.toBeNull();
    });

    it('GET /evaluation360/cycles/:cycleId/analytics/team — gestor → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluation360/cycles/${cycleId}/analytics/team`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /evaluation360/analytics/organizational — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/evaluation360/analytics/organizational')
        .query({ cycleId })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.totalParticipants).toBeGreaterThanOrEqual(1);
    });

    it('GET /evaluation360/analytics/nine-box — gestor → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/evaluation360/analytics/nine-box')
        .query({ cycleId })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('RH calibra o score do participante → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluation360/cycles/${cycleId}/calibrate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          participantId: String(employeeId),
          calibratedScore: 4.2,
          justification: 'Ajuste de calibração RH',
        })
        .expect(201);
      expect(res.body.newScore).toBe(4.2);
    });

    it('RH gera relatório individual → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluation360/reports/generate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ cycleId, participantId: String(employeeId), scope: 'INDIVIDUAL' })
        .expect(200);
      expect(res.body.scope).toBe('INDIVIDUAL');
    });
  });

  describe('Feedback contínuo — verifica correcção (fromUserId String + tenantId/competencyId/relatedCycleId em falta no schema)', () => {
    it('colaborador envia feedback contínuo ao gestor → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluation360/feedback/continuous')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          tenantId: TENANT_ID,
          toUserId: String(managerId),
          type: 'RECOGNITION',
          message: 'Óptimo apoio esta semana',
          competencyId: String(competencyId),
          relatedCycleId: cycleId,
        })
        .expect(201);
      feedbackId = res.body.id;
      expect(feedbackId).toBeDefined();
      expect(res.body.fromUserId).toBe(String(employeeId));
    });

    it('GET /evaluation360/feedback/continuous/:userId — 200 inclui o feedback', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluation360/feedback/continuous/${managerId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.data.some((f: any) => f.id === feedbackId)).toBe(true);
    });
  });

  describe('Pulse Surveys — verifica correcção (createdBy String + tenantId/questions/targetUserIds/isAnonymous em falta no schema)', () => {
    it('gestor cria pulse survey → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluation360/pulse-surveys')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          tenantId: TENANT_ID,
          title: 'Int Test Pulse Survey',
          questions: JSON.stringify([{ text: 'Como te sentes esta semana?' }]),
          targetUserIds: [String(employeeId)],
          closesAt: '2026-12-31',
          isAnonymous: true,
        })
        .expect(201);
      pulseSurveyId = res.body.id;
      expect(pulseSurveyId).toBeDefined();
      expect(res.body.createdBy).toBe(String(managerId));
    });

    it('colaborador responde ao pulse survey → 200', async () => {
      await request(app.getHttpServer())
        .post(`/evaluation360/pulse-surveys/${pulseSurveyId}/responses`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ answersJson: JSON.stringify({ mood: 4 }) })
        .expect(200);
    });
  });
});
