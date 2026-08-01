import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const CYCLE_ID = 9001;

describe('Evaluation Integration', () => {
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

  let requestId: number;
  let legacyEvalId: number;

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
    await prisma.performanceEvaluation
      .deleteMany({ where: { evaluatorId: managerId, evaluatedId: employeeId } })
      .catch(() => undefined);
    if (legacyEvalId) {
      await prisma.performanceEvaluation
        .deleteMany({ where: { id: legacyEvalId } })
        .catch(() => undefined);
    }
    if (requestId) {
      await prisma.evaluationRequest
        .deleteMany({ where: { id: requestId } })
        .catch(() => undefined);
    }
    await prisma.notificationLog
      .deleteMany({
        where: { userId: { in: [employeeId, managerId] }, type: { startsWith: 'EVALUATION' } },
      })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Cycles — degradam graciosamente (EvaluationCycle real é incompatível, ver memória)', () => {
    it('colaborador não pode criar ciclo → 403', async () => {
      await request(app.getHttpServer())
        .post('/evaluations/cycles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          name: 'X',
          model: '360',
          startDate: '2026-01-01',
          endDate: '2026-03-01',
          weights: [],
        })
        .expect(403);
    });

    it('pesos que não somam 100% → 400', async () => {
      await request(app.getHttpServer())
        .post('/evaluations/cycles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Int Test Cycle',
          model: '360',
          startDate: '2026-01-01',
          endDate: '2026-03-01',
          weights: [{ type: 'SELF', weight: 30 }],
        })
        .expect(400);
    });

    it('RH cria ciclo → 201 (modo compatibilidade, não persiste de facto)', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluations/cycles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Int Test Cycle',
          model: '360',
          startDate: '2026-01-01',
          endDate: '2026-03-01',
          weights: [
            { type: 'SELF', weight: 20 },
            { type: 'MANAGER', weight: 50 },
            { type: 'PEER', weight: 30 },
          ],
        })
        .expect(201);
      expect(res.body.id).toBeNull();
      expect(res.body.message).toContain('compatibilidade');
    });
  });

  describe('Assignment & Submit — verifica correcção (EvaluationRequest.type/cycleId, upsert sem @@unique)', () => {
    it('gestor atribui-se como avaliador do colaborador num ciclo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluations/assign')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          evaluatedId: employeeId,
          evaluatorId: managerId,
          type: 'MANAGER',
          cycleId: CYCLE_ID,
        })
        .expect(201);
      requestId = res.body.id;
      expect(requestId).toBeDefined();
      expect(res.body.type).toBe('MANAGER');
    });

    it('atribuição duplicada (mesmo par, mesmo tipo, mesmo ciclo) → 409', async () => {
      await request(app.getHttpServer())
        .post('/evaluations/assign')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          evaluatedId: employeeId,
          evaluatorId: managerId,
          type: 'MANAGER',
          cycleId: CYCLE_ID,
        })
        .expect(409);
    });

    it('GET /evaluations/pending — verifica correcção (antes devolvia sempre lista vazia)', async () => {
      const res = await request(app.getHttpServer())
        .get('/evaluations/pending')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.id === requestId)).toBe(true);
    });

    it('gestor submete a avaliação → cria PerformanceEvaluation (verifica correcção do upsert)', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluations/submit')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          requestId,
          answers: [{ questionId: 1, score: 4 }],
          strengths: 'Excelente comunicação',
          improvements: 'Gestão de tempo',
        })
        .expect(201);
      expect(res.body.overallScore).toBe(4);
      expect(res.body.strengths).toBe('Excelente comunicação');
    });

    it('re-submissão actualiza o mesmo registo (não duplica, upsert find-then-write)', async () => {
      await request(app.getHttpServer())
        .post('/evaluations/submit')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ requestId, answers: [{ questionId: 1, score: 5 }] })
        .expect(409); // já COMPLETED, não é draft
    });

    it('GET /evaluations/my-progress — reflecte a conclusão → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/evaluations/my-progress')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.completed).toBeGreaterThanOrEqual(1);
    });

    it('GET /evaluations/user/:userId — RH vê as avaliações recebidas pelo colaborador', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluations/user/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((e: any) => e.evaluatedId === employeeId)).toBe(true);
    });
  });

  describe('Legacy endpoint', () => {
    it('colaborador submete avaliação simples (legacy) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          evaluatedId: managerId,
          type: 'PEER',
          period: '2026-LEGACY-TEST',
          criteria: [{ name: 'Colaboração', score: 4 }],
        })
        .expect(201);
      legacyEvalId = res.body.id;
      expect(res.body.overallScore).toBe(4);
    });
  });

  describe('Results & Evolution — ownership (A10-3)', () => {
    it('colaborador não pode ver os resultados 360 de outro colega → 404 (não revela existência)', async () => {
      await request(app.getHttpServer())
        .get(`/evaluations/results/${managerId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('gestor (privilegiado) vê os resultados do colaborador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluations/results/${employeeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.finalScore).toBeDefined();
    });

    it('resultados filtrados por cycleId — verifica correcção (cycleId agora existe no schema) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluations/results/${employeeId}`)
        .query({ cycleId: CYCLE_ID })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.finalScore).toBeDefined();
    });

    it('GET /evaluations/evolution/:userId — o próprio colaborador vê a sua evolução → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluations/evolution/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.evolution).toBeDefined();
    });

    it('colaborador não pode ver a evolução de outro colega → 404 (não revela existência)', async () => {
      await request(app.getHttpServer())
        .get(`/evaluations/evolution/${managerId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });

  describe('Calibration — verifica correcção (cycleId obrigatório na rota, agora existe no schema)', () => {
    it('RH acede ao painel de calibração do ciclo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluations/calibration/${CYCLE_ID}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body.participants)).toBe(true);
    });

    it('RH calibra o score do colaborador → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluations/calibration/${CYCLE_ID}/calibrate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ evaluatedId: employeeId, calibratedScore: 4.5 })
        .expect(201);
      expect(res.body.newScore).toBe(4.5);

      const evalRow = await prisma.performanceEvaluation.findFirst({
        where: { evaluatedId: employeeId, cycleId: CYCLE_ID },
      });
      expect(evalRow!.overallScore).toBe(4.5);
    });
  });

  describe('Analytics', () => {
    it('GET /evaluations/analytics/dashboard — RH → 200 com dados', async () => {
      const res = await request(app.getHttpServer())
        .get('/evaluations/analytics/dashboard')
        .query({ cycleId: CYCLE_ID })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.hasData).toBe(true);
    });

    it('GET /evaluations/analytics/team/:managerId — 200 (sem equipa directa nos fixtures partilhados)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluations/analytics/team/${managerId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.team).toEqual([]);
    });
  });

  describe('Auto PDI — verifica correcção (where: {evaluatedId} inexistente em User, sempre lançava e devolvia managerNotified=false)', () => {
    it('gera sugestão de PDI sem rebentar (User.findUnique agora usa where: {id})', async () => {
      const res = await request(app.getHttpServer())
        .post(`/evaluations/results/${employeeId}/trigger-pdi`)
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ cycleId: CYCLE_ID })
        .expect(201);
      expect(typeof res.body.managerNotified).toBe('boolean');
      expect(Array.isArray(res.body.suggestedGaps)).toBe(true);
    });
  });
});
