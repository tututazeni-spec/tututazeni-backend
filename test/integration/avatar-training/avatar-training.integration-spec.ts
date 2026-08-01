import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Avatar Training Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const scenarioIds: number[] = [];
  let scenarioId: number;
  let sessionId: number;
  let employeeId: number;

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
  });

  afterAll(async () => {
    if (scenarioIds.length > 0) {
      // AvatarSession.scenarioId é CASCADE — apagar o cenário já limpa as sessões.
      await prisma.avatarScenario
        .deleteMany({ where: { id: { in: scenarioIds } } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Cenários — CRUD', () => {
    it('colaborador não pode criar cenário → 403', async () => {
      await request(app.getHttpServer())
        .post('/avatar-training/scenarios')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'X', category: 'SALES', difficulty: 'BEGINNER' })
        .expect(403);
    });

    it('RH cria cenário → 201 e persiste realmente (category/difficulty reais)', async () => {
      const res = await request(app.getHttpServer())
        .post('/avatar-training/scenarios')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Negociação com cliente difícil',
          description: 'Simulação de negociação comercial',
          category: 'NEGOTIATION',
          difficulty: 'INTERMEDIATE',
        })
        .expect(201);

      expect(res.body.id).not.toBeNull();
      expect(res.body.category).toBe('NEGOTIATION');
      expect(res.body.difficulty).toBe('INTERMEDIATE');
      scenarioId = res.body.id;
      scenarioIds.push(scenarioId);
    });

    it('GET /avatar-training/scenarios — colaborador lista → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/avatar-training/scenarios')
        .query({ category: 'NEGOTIATION', difficulty: 'INTERMEDIATE' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((s: any) => s.id === scenarioId)).toBe(true);
    });

    it('GET /avatar-training/scenarios/:id — detalhe real (não 404 espúrio) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/avatar-training/scenarios/${scenarioId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(scenarioId);
    });

    it('GET /avatar-training/scenarios/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/avatar-training/scenarios/999999')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });

  describe('Sessões — ciclo de vida', () => {
    it('POST /avatar-training/sessions/start — inicia sessão real → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/avatar-training/sessions/start')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ scenarioId })
        .expect(201);

      expect(res.body.session).toHaveProperty('id');
      expect(res.body.openingMessage).toBeTruthy();
      sessionId = res.body.session.id;
    });

    it('POST /avatar-training/sessions/:id/message — envia mensagem e recebe score → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/avatar-training/sessions/${sessionId}/message`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ message: 'Entendo a tua preocupação, vou garantir uma solução.' })
        .expect(201);

      expect(res.body).toHaveProperty('avatarResponse');
      expect(res.body).toHaveProperty('turnScore');
    });

    it('POST /avatar-training/sessions/:id/message — sessão de outro utilizador → 403', async () => {
      await request(app.getHttpServer())
        .post(`/avatar-training/sessions/${sessionId}/message`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ message: 'Olá' })
        .expect(403);
    });

    it('POST /avatar-training/sessions/:id/pause — pausa → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/avatar-training/sessions/${sessionId}/pause`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body.status).toBe('PAUSED');
    });

    it('POST /avatar-training/sessions/:id/resume — retoma → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/avatar-training/sessions/${sessionId}/resume`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('POST /avatar-training/sessions/:id/complete — conclui com score e XP → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/avatar-training/sessions/${sessionId}/complete`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ score: 85, feedback: 'Bom desempenho', userRating: 5 })
        .expect(201);

      expect(res.body.finalScore).toBe(85);
      expect(res.body.grade).toBe('ABOVE_AVERAGE');
      expect(res.body.xpEarned).toBeGreaterThan(0);
    });

    it('GET /avatar-training/sessions/:id — detalhe com histórico de conversa → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/avatar-training/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(Array.isArray(res.body.conversationHistory)).toBe(true);
      expect(res.body.conversationHistory.length).toBeGreaterThan(0);
    });

    it('GET /avatar-training/sessions/:id — outro utilizador → 403', async () => {
      await request(app.getHttpServer())
        .get(`/avatar-training/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });
  });

  describe('Histórico, leaderboard e analytics', () => {
    it('GET /avatar-training/my-history → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/avatar-training/my-history')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.stats.completed).toBeGreaterThan(0);
    });

    it('GET /avatar-training/my-analytics — inclui categoria real → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/avatar-training/my-analytics')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.byCategory.some((c: any) => c.category === 'NEGOTIATION')).toBe(true);
    });

    it('GET /avatar-training/scenarios/:scenarioId/leaderboard → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/avatar-training/scenarios/${scenarioId}/leaderboard`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.user.id === employeeId)).toBe(true);
    });

    it('GET /avatar-training/leaderboard — ranking global → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/avatar-training/leaderboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.user?.id === employeeId)).toBe(true);
    });

    it('GET /avatar-training/scenarios/recommended → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/avatar-training/scenarios/recommended')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /avatar-training/analytics/dashboard — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/avatar-training/analytics/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /avatar-training/analytics/dashboard — RH com filtro de categoria real → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/avatar-training/analytics/dashboard')
        .query({ category: 'NEGOTIATION' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.kpis.completedSessions).toBeGreaterThan(0);
    });
  });

  describe('Avatares — modelo trainingAvatar ausente do schema (placeholder)', () => {
    it('POST /avatar-training/avatars — degrada sem persistir (eco dos dados, sem id) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/avatar-training/avatars')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Avatar de teste', role: 'COACH' })
        .expect(201);
      expect(res.body.name).toBe('Avatar de teste');
      expect(res.body.id).toBeUndefined();
    });

    it('GET /avatar-training/avatars — lista vazia (degrada) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/avatar-training/avatars')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /avatar-training/avatars/:id — nunca encontrado (modelo ausente) → 404', async () => {
      await request(app.getHttpServer())
        .get('/avatar-training/avatars/1')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });
});
