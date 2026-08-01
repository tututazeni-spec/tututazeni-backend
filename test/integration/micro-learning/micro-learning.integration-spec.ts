import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Micro-Learning Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let contentId: number;
  let quizContentId: number;
  let playlistId: number;

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
  });

  afterAll(async () => {
    const ids = [contentId, quizContentId].filter(Boolean);
    if (ids.length) {
      await prisma.microQuizAttempt
        .deleteMany({ where: { microLearningId: { in: ids } } })
        .catch(() => undefined);
      await prisma.microQuizQuestion
        .deleteMany({ where: { microLearningId: { in: ids } } })
        .catch(() => undefined);
      await prisma.microLearningInteraction
        .deleteMany({ where: { microLearningId: { in: ids } } })
        .catch(() => undefined);
      await prisma.microLearningProgress
        .deleteMany({ where: { microLearningId: { in: ids } } })
        .catch(() => undefined);
      if (playlistId) {
        await prisma.playlistItem.deleteMany({ where: { playlistId } }).catch(() => undefined);
        await prisma.microLearningPlaylist
          .deleteMany({ where: { id: playlistId } })
          .catch(() => undefined);
      }
      await prisma.microLearning.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    }
    await prisma.learningStreak
      .deleteMany({ where: { userId: employeeId } })
      .catch(() => undefined);
    await prisma.userPoints.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    await prisma.notificationLog
      .deleteMany({ where: { userId: employeeId } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Catálogo (bug: relações "category"/"likes"/"comments" inexistentes 500avam sempre)', () => {
    it('colaborador não pode criar conteúdo → 403', async () => {
      await request(app.getHttpServer())
        .post('/micro-learning')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'X', contentType: 'TEXT', level: 'BEGINNER' })
        .expect(403);
    });

    it('RH cria micro-learning de texto → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/micro-learning')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Int Test — Feedback eficaz',
          contentType: 'TEXT',
          level: 'BEGINNER',
          status: 'PUBLISHED',
          textContent: 'Conteúdo de teste',
          xpReward: 15,
        })
        .expect(201);
      contentId = res.body.id;
    });

    it('GET /micro-learning (admin) — não deve 500 (bug: category/likes)', async () => {
      const res = await request(app.getHttpServer())
        .get('/micro-learning')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const item = res.body.data.find((d: any) => d.id === contentId);
      expect(item).toBeTruthy();
      expect(item.likeCount).toBe(0);
    });

    it('GET /micro-learning/:id — não deve 500 (bug: category/likes/comments)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/micro-learning/${contentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.likeCount).toBe(0);
    });

    it('GET /micro-learning/feed/me — não deve 500 (bug: category/likes)', async () => {
      const res = await request(app.getHttpServer())
        .get('/micro-learning/feed/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((d: any) => d.id === contentId)).toBe(true);
    });

    it('GET /micro-learning/admin/dashboard — não deve 500 (bug: likes no topContent)', async () => {
      const res = await request(app.getHttpServer())
        .get('/micro-learning/admin/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.content.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Interações, likes e saved (bug: GET saved/me também 500ava)', () => {
    it('colaborador dá like → likeCount reflecte de facto', async () => {
      await request(app.getHttpServer())
        .post('/micro-learning/interact')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ microLearningId: contentId, action: 'LIKE' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/micro-learning/${contentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.likeCount).toBe(1);
    });

    it('gestor também dá like → likeCount = 2 (não confunde com o like do colaborador)', async () => {
      await request(app.getHttpServer())
        .post('/micro-learning/interact')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ microLearningId: contentId, action: 'LIKE' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/micro-learning')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const item = res.body.data.find((d: any) => d.id === contentId);
      expect(item.likeCount).toBe(2);
    });

    it('colaborador guarda (SAVE) o conteúdo', async () => {
      await request(app.getHttpServer())
        .post('/micro-learning/interact')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ microLearningId: contentId, action: 'SAVE' })
        .expect(200);
    });

    it('GET /micro-learning/saved/me — não deve 500 (bug: category/likes)', async () => {
      const res = await request(app.getHttpServer())
        .get('/micro-learning/saved/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.id === contentId)).toBe(true);
      expect(res.body.find((c: any) => c.id === contentId).likeCount).toBe(2);
    });
  });

  describe('Progresso, XP e streak', () => {
    it('colaborador marca 100% de progresso → conclui, ganha XP e regista streak', async () => {
      await request(app.getHttpServer())
        .post('/micro-learning/progress')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ microLearningId: contentId, progress: 100 })
        .expect(200);

      const points = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      expect(points!.points).toBe(15);

      const streak = await prisma.learningStreak.findUnique({ where: { userId: employeeId } });
      expect(streak!.currentStreak).toBe(1);
    });

    it('GET /micro-learning/dashboard/me — reflecte XP e streak', async () => {
      const res = await request(app.getHttpServer())
        .get('/micro-learning/dashboard/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.stats.totalXp).toBe(15);
      expect(res.body.streak.current).toBe(1);
    });

    it('GET /micro-learning/:id/stats — reflecte conclusão e like', async () => {
      const res = await request(app.getHttpServer())
        .get(`/micro-learning/${contentId}/stats`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.completions).toBe(1);
      expect(res.body.likes).toBe(2);
    });
  });

  describe('Quiz (bug: correct-answer leak — findOne devolvia isCorrect nas opções)', () => {
    it('RH cria conteúdo QUIZ com perguntas', async () => {
      const res = await request(app.getHttpServer())
        .post('/micro-learning')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Int Test — Quiz Segurança',
          contentType: 'QUIZ',
          level: 'BEGINNER',
          status: 'PUBLISHED',
          quizQuestions: [
            {
              question: 'Qual a capital de Angola?',
              options: [
                { text: 'Luanda', isCorrect: true },
                { text: 'Maputo', isCorrect: false },
              ],
            },
          ],
        })
        .expect(201);
      quizContentId = res.body.id;
    });

    it('GET /micro-learning/:id (quiz) — options NÃO deve conter isCorrect', async () => {
      const res = await request(app.getHttpServer())
        .get(`/micro-learning/${quizContentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const q = res.body.quizQuestions[0];
      expect(q.options.every((o: any) => !('isCorrect' in o))).toBe(true);
      expect(q.options.map((o: any) => o.text)).toEqual(['Luanda', 'Maputo']);
    });

    it('colaborador submete respostas do quiz → calcula score real (server-side, não confia no cliente)', async () => {
      const res = await request(app.getHttpServer())
        .post('/micro-learning/quiz/submit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ microLearningId: quizContentId, answers: [0] })
        .expect(200);
      expect(res.body.score).toBe(100);
      expect(res.body.results[0].isCorrect).toBe(true);
    });
  });

  describe('Playlists e dispatch', () => {
    it('RH cria playlist com o conteúdo', async () => {
      const res = await request(app.getHttpServer())
        .post('/micro-learning/playlists')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Int Test Playlist', contentIds: [contentId] })
        .expect(201);
      playlistId = res.body.id;
      expect(res.body.items.length).toBe(1);
    });

    it('GET /micro-learning/playlists/all — inclui a playlist', async () => {
      const res = await request(app.getHttpServer())
        .get('/micro-learning/playlists/all')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((p: any) => p.id === playlistId)).toBe(true);
    });

    it('RH distribui o conteúdo a todos os utilizadores activos', async () => {
      const res = await request(app.getHttpServer())
        .post(`/micro-learning/${contentId}/dispatch-all`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.dispatched).toBeGreaterThanOrEqual(1);
    });

    it('redistribuir — não duplica quem já recebeu', async () => {
      const res = await request(app.getHttpServer())
        .post(`/micro-learning/${contentId}/dispatch-all`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.dispatched).toBe(0);
    });
  });

  describe('Arquivamento e remoção', () => {
    it('publicado não pode ser eliminado → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/micro-learning/${quizContentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('arquivar → ARCHIVED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/micro-learning/${quizContentId}/archive`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ARCHIVED');
    });

    it('ARCHIVED com tentativa de quiz registada não pode ser eliminado → 403 (bug: guard só olhava para status, não RESTRICT real)', async () => {
      await request(app.getHttpServer())
        .delete(`/micro-learning/${quizContentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });
});
