import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Monitoring Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let gestorToken: string;
  let employeeId: number;
  let gestorId: number;

  let cycleId: string;
  let objectiveId: string;
  let keyResultId: string;
  let indicatorId: string;
  let evalCycleId: string;
  let managerEvalId: string;
  let selfEvalId: string;
  let pendingEvalId: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    rhToken = await getToken(app.getHttpServer(), 'rh');
    gestorToken = await getToken(app.getHttpServer(), 'manager');

    const employeeUser = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employeeUser!.id;
    const gestorUser = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.manager.email },
    });
    gestorId = gestorUser!.id;
  });

  afterAll(async () => {
    await (prisma as any).userEvaluation
      .deleteMany({ where: { userId: employeeId } })
      .catch(() => undefined);
    if (evalCycleId)
      await (prisma as any).evaluationCycle
        .deleteMany({ where: { id: evalCycleId } })
        .catch(() => undefined);
    if (indicatorId) {
      await (prisma as any).monitoringRecord
        .deleteMany({ where: { indicatorId } })
        .catch(() => undefined);
      await (prisma as any).monitoringIndicator
        .deleteMany({ where: { id: indicatorId } })
        .catch(() => undefined);
    }
    if (keyResultId)
      await (prisma as any).keyResultUpdate
        .deleteMany({ where: { keyResultId } })
        .catch(() => undefined);
    if (objectiveId)
      await (prisma as any).keyResult.deleteMany({ where: { objectiveId } }).catch(() => undefined);
    if (objectiveId)
      await (prisma as any).objective
        .deleteMany({ where: { id: objectiveId } })
        .catch(() => undefined);
    if (cycleId)
      await (prisma as any).okrCycle.deleteMany({ where: { id: cycleId } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('OKRs — ciclos, objectivos e key results', () => {
    it('RH cria ciclo OKR → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitoring/okr/cycles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Q3 Integração', startDate: '2026-07-01', endDate: '2026-09-30' })
        .expect(201);
      cycleId = res.body.id;
    });

    it('lista ciclos OKR → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitoring/okr/cycles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('colaborador cria objectivo para si próprio → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitoring/okr/objectives')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ cycleId, ownerId: employeeId, title: 'Melhorar taxa de conclusão' })
        .expect(201);
      objectiveId = res.body.id;
    });

    it('objectivo com ciclo inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/monitoring/okr/objectives')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ cycleId: 'nao-existe', ownerId: employeeId, title: 'Objectivo fantasma' })
        .expect(404);
    });

    it('lista objectivos do ciclo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitoring/okr/cycles/${cycleId}/objectives`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((o: any) => o.id === objectiveId)).toBe(true);
    });

    it('cria key result para o objectivo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitoring/okr/key-results')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ objectiveId, title: 'Atingir 80%', targetValue: 80, startValue: 0 })
        .expect(201);
      keyResultId = res.body.id;
    });

    it('key result com objectivo inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/monitoring/okr/key-results')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ objectiveId: 'nao-existe', title: 'x', targetValue: 10 })
        .expect(404);
    });

    it('dono do objectivo actualiza o key result → progress calculado', async () => {
      const res = await request(app.getHttpServer())
        .put(`/monitoring/okr/key-results/${keyResultId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ newValue: 40 })
        .expect(200);
      expect(res.body.progress).toBe(50);
      // Limiares do serviço: >=100 COMPLETED, >=70 ON_TRACK, >=40 AT_RISK, senão OFF_TRACK.
      expect(res.body.status).toBe('AT_RISK');
    });

    it('GESTOR (privilegiado) também pode actualizar o key result', async () => {
      const res = await request(app.getHttpServer())
        .put(`/monitoring/okr/key-results/${keyResultId}`)
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({ newValue: 80 })
        .expect(200);
      expect(res.body.progress).toBe(100);
      expect(res.body.status).toBe('COMPLETED');
    });
  });

  describe('Indicadores de monitoria', () => {
    it('RH cria indicador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitoring/indicators')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ code: 'IND-INT-001', name: 'Indicador Integração', target: 100 })
        .expect(201);
      indicatorId = res.body.id;
    });

    it('código de indicador duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/monitoring/indicators')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ code: 'IND-INT-001', name: 'Duplicado' })
        .expect(409);
    });

    it('regista valor do indicador → variance calculada', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitoring/indicators/${indicatorId}/records`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ value: 80, period: '2026-07' })
        .expect(201);
      expect(res.body.variance).toBe(-20);
      expect(res.body.variancePct).toBe(-20);
    });

    it('registar valor para indicador inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/monitoring/indicators/nao-existe/records')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ value: 10, period: '2026-07' })
        .expect(404);
    });

    it('histórico do indicador inclui o registo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/monitoring/indicators/${indicatorId}/history`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.records.length).toBeGreaterThan(0);
    });

    it('lista indicadores (paginado) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitoring/indicators?page=1&limit=20')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('Avaliação de desempenho — ownership (SELF vs avaliador)', () => {
    it('RH cria ciclo de avaliação → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/monitoring/evaluation/cycles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Avaliação Integração', startDate: '2026-07-01', endDate: '2026-12-31' })
        .expect(201);
      evalCycleId = res.body.id;
    });

    it('RH atribui avaliação tipo MANAGER (avaliador = gestor) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitoring/evaluation/cycles/${evalCycleId}/assign`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, evaluatorId: gestorId, type: 'MANAGER' })
        .expect(201);
      managerEvalId = res.body.id;
    });

    it('atribuição duplicada (mesmo user+evaluator+type) → 409', async () => {
      await request(app.getHttpServer())
        .post(`/monitoring/evaluation/cycles/${evalCycleId}/assign`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, evaluatorId: gestorId, type: 'MANAGER' })
        .expect(409);
    });

    it('RH atribui uma segunda avaliação MANAGER (PEER) ainda pendente', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitoring/evaluation/cycles/${evalCycleId}/assign`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, evaluatorId: gestorId, type: 'PEER' })
        .expect(201);
      pendingEvalId = res.body.id;
    });

    it('RH atribui avaliação tipo SELF (avaliador = o próprio) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/monitoring/evaluation/cycles/${evalCycleId}/assign`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, evaluatorId: employeeId, type: 'SELF' })
        .expect(201);
      selfEvalId = res.body.id;
    });

    it('o avaliado (não avaliador) não pode submeter avaliação MANAGER alheia → 404', async () => {
      await request(app.getHttpServer())
        .put(`/monitoring/evaluation/${managerEvalId}/submit`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ score: 90 })
        .expect(404);
    });

    it('o avaliador (GESTOR) submete a avaliação MANAGER → 200 (CLOSED)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/monitoring/evaluation/${managerEvalId}/submit`)
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({ score: 85, feedback: 'Bom desempenho' })
        .expect(200);
      expect(res.body.status).toBe('CLOSED');
      expect(res.body.managerScore).toBe(85);
    });

    it('o gestor (não é o próprio) não pode submeter a avaliação SELF alheia → 404', async () => {
      await request(app.getHttpServer())
        .put(`/monitoring/evaluation/${selfEvalId}/submit`)
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({ score: 100 })
        .expect(404);
    });

    it('o próprio colaborador submete a sua avaliação SELF → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/monitoring/evaluation/${selfEvalId}/submit`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ score: 78, feedback: 'Auto-avaliação' })
        .expect(200);
      expect(res.body.status).toBe('CLOSED');
      expect(res.body.selfScore).toBe(78);
    });

    it('submeter avaliação inexistente → 404', async () => {
      await request(app.getHttpServer())
        .put('/monitoring/evaluation/nao-existe/submit')
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({ score: 50 })
        .expect(404);
    });

    it('colaborador vê as suas avaliações (MANAGER + SELF) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitoring/evaluation/my-evaluations')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const ids = res.body.map((e: any) => e.id);
      expect(ids).toEqual(expect.arrayContaining([managerEvalId, selfEvalId]));
    });

    it('gestor vê a avaliação PEER ainda pendente em "a completar"', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitoring/evaluation/to-complete')
        .set('Authorization', `Bearer ${gestorToken}`)
        .expect(200);
      expect(res.body.some((e: any) => e.id === pendingEvalId)).toBe(true);
      // A avaliação MANAGER já submetida (CLOSED) não deve aparecer como pendente.
      expect(res.body.some((e: any) => e.id === managerEvalId)).toBe(false);
    });
  });

  describe('Dashboard', () => {
    it('RH acede ao dashboard de monitoria → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/monitoring/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/monitoring/dashboard').expect(401);
    });
  });
});
