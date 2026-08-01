import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Assessments Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const assessmentIds: number[] = [];
  let assessmentId: number;
  let mcQuestionId: number;
  let tfQuestionId: number;
  let openQuestionId: number;
  let attemptId: number;
  let openAnswerId: number;

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
  });

  afterAll(async () => {
    if (assessmentIds.length > 0) {
      await prisma.assessmentAttempt
        .deleteMany({ where: { assessmentId: { in: assessmentIds } } })
        .catch(() => undefined);
      await prisma.assessment
        .deleteMany({ where: { id: { in: assessmentIds } } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('CRUD (ADMIN/RH)', () => {
    it('colaborador não pode criar avaliação → 403', async () => {
      await request(app.getHttpServer())
        .post('/assessments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'X', type: 'QUIZ', questions: [] })
        .expect(403);
    });

    it('RH cria avaliação com perguntas → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/assessments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Quiz de Integração',
          type: 'QUIZ',
          passingScore: 60,
          questions: [
            {
              type: 'MULTIPLE_CHOICE_SINGLE',
              questionText: 'Qual a capital de Angola?',
              options: [
                { text: 'Luanda', isCorrect: true },
                { text: 'Maputo', isCorrect: false },
              ],
              weight: 1,
              seq: 0,
            },
            {
              type: 'TRUE_FALSE',
              questionText: 'O sol nasce a leste.',
              options: [
                { text: 'Verdadeiro', isCorrect: true },
                { text: 'Falso', isCorrect: false },
              ],
              weight: 1,
              seq: 1,
            },
            {
              type: 'OPEN_TEXT',
              questionText: 'Descreve a tua experiência de formação.',
              weight: 1,
              seq: 2,
            },
          ],
        })
        .expect(201);

      assessmentId = res.body.id;
      assessmentIds.push(assessmentId);
      expect(res.body.questions.length).toBe(3);
      mcQuestionId = res.body.questions[0].id;
      tfQuestionId = res.body.questions[1].id;
      openQuestionId = res.body.questions[2].id;
    });

    it('GET /assessments/:id — colaborador não vê correctAnswer → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/assessments/${assessmentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.questions[0].correctAnswer).toBeUndefined();
    });

    it('GET /assessments/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/assessments/999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('PUT /assessments/:id — actualiza título → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/assessments/${assessmentId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Quiz de Integração (v2)' })
        .expect(200);
      expect(res.body.title).toBe('Quiz de Integração (v2)');
    });

    it('POST /assessments/:id/duplicate — clona com perguntas → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/assessments/${assessmentId}/duplicate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.title).toContain('cópia');
      expect(res.body.questions.length).toBe(3);
      assessmentIds.push(res.body.id);
    });
  });

  describe('Publicação', () => {
    it('colaborador não pode iniciar tentativa antes de publicar (não está PUBLISHED) → 400', async () => {
      await request(app.getHttpServer())
        .post('/assessments/attempts/start')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ assessmentId })
        .expect(400);
    });

    it('PATCH /assessments/:id/publish — RH publica → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/assessments/${assessmentId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
    });
  });

  describe('Execução (colaborador)', () => {
    it('POST /assessments/attempts/start — inicia tentativa → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/assessments/attempts/start')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ assessmentId })
        .expect(201);
      expect(res.body.status).toBe('IN_PROGRESS');
      attemptId = res.body.id;
    });

    it('POST /assessments/attempts/start — retoma a mesma tentativa em progresso → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/assessments/attempts/start')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ assessmentId })
        .expect(201);
      expect(res.body.id).toBe(attemptId);
    });

    it('POST /assessments/attempts/save — auto-save → 200', async () => {
      await request(app.getHttpServer())
        .post('/assessments/attempts/save')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ attemptId, answers: [{ questionId: mcQuestionId, selectedIndices: [0] }] })
        .expect(200);
    });

    it('POST /assessments/attempts/submit — submete (1 questão exige revisão manual) → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/assessments/attempts/submit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          attemptId,
          answers: [
            { questionId: mcQuestionId, selectedIndices: [0] },
            { questionId: tfQuestionId, selectedIndices: [0] },
            { questionId: openQuestionId, textAnswer: 'Foi uma óptima experiência.' },
          ],
        })
        .expect(200);

      expect(res.body.needsManualReview).toBe(true);
      expect(res.body.attempt.status).toBe('SUBMITTED');
    });

    it('POST /assessments/attempts/submit — tentativa já submetida → 409', async () => {
      await request(app.getHttpServer())
        .post('/assessments/attempts/submit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ attemptId, answers: [] })
        .expect(409);
    });

    it('GET /assessments/attempts/:attemptId — detalhe da tentativa → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/assessments/attempts/${attemptId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(attemptId);
    });

    it('GET /assessments/my/attempts — lista as minhas tentativas → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/assessments/my/attempts')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((a: any) => a.id === attemptId)).toBe(true);
    });
  });

  describe('Revisão manual', () => {
    it('GET /assessments/pending-reviews — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/assessments/pending-reviews')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /assessments/pending-reviews — RH → 200 inclui a resposta aberta', async () => {
      const res = await request(app.getHttpServer())
        .get('/assessments/pending-reviews')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const pending = res.body.find((a: any) => a.attempt.id === attemptId);
      expect(pending).toBeDefined();
      openAnswerId = pending.id;
    });

    it('POST /assessments/review — RH avalia a resposta aberta com nota de aprovação → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/assessments/review')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ attemptAnswerId: openAnswerId, score: 100, reviewComment: 'Boa resposta' })
        .expect(201);
      expect(res.body.pendingReview).toBe(0);
    });

    it('GET /assessments/attempts/:attemptId — status final recalculado (PASSED) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/assessments/attempts/${attemptId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.status).toBe('PASSED');
    });
  });

  describe('Analytics e histórico', () => {
    it('GET /assessments/:id/analytics — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/assessments/${assessmentId}/analytics`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.attempts.total).toBe(1);
      expect(res.body.attempts.passed).toBe(1);
    });

    it('GET /assessments/:id/analytics — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get(`/assessments/${assessmentId}/analytics`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /assessments/attempts/user/:userId — RH → 200', async () => {
      const me = await request(app.getHttpServer())
        .get('/assessments/my/attempts')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const userId = me.body[0].userId;

      const res = await request(app.getHttpServer())
        .get(`/assessments/attempts/user/${userId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((a: any) => a.id === attemptId)).toBe(true);
    });
  });

  describe('Gestão de perguntas e remoção', () => {
    let extraQuestionId: number;

    it('POST /assessments/:id/questions — adiciona pergunta → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/assessments/${assessmentId}/questions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ type: 'TRUE_FALSE', questionText: 'Pergunta extra', weight: 1, seq: 3 })
        .expect(201);
      extraQuestionId = res.body.id;
    });

    it('DELETE /assessments/questions/:questionId — remove pergunta → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/assessments/questions/${extraQuestionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('DELETE /assessments/:id — avaliação PUBLISHED com tentativas → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/assessments/${assessmentId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });

    it('PATCH /assessments/:id/archive — arquiva → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/assessments/${assessmentId}/archive`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ARCHIVED');
    });
  });
});
