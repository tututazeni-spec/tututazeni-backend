import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const COURSE_CODE = 'INT-TEST-LIVE-CLASS-001';

describe('Live Classes Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let courseId: number;
  let liveClassId: number;
  let evaluationId: number;

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

    const course = await prisma.course.upsert({
      where: { internalCode: COURSE_CODE },
      update: {},
      create: {
        title: 'Curso Integração — Live Classes',
        internalCode: COURSE_CODE,
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    if (liveClassId) {
      await prisma.postClassResponse
        .deleteMany({ where: { evaluation: { liveClassId } } })
        .catch(() => undefined);
      await prisma.postClassEvaluation
        .deleteMany({ where: { liveClassId } })
        .catch(() => undefined);
      await prisma.liveChatMessage.deleteMany({ where: { liveClassId } }).catch(() => undefined);
      await prisma.liveAttendance.deleteMany({ where: { liveClassId } }).catch(() => undefined);
      await prisma.liveClass.deleteMany({ where: { id: liveClassId } }).catch(() => undefined);
    }
    await prisma.course.deleteMany({ where: { internalCode: COURSE_CODE } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('CRUD', () => {
    it('colaborador não pode criar aula ao vivo → 403', async () => {
      await request(app.getHttpServer())
        .post('/live-classes')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ courseId, topic: 'X', scheduledAt: new Date().toISOString(), duration: 60 })
        .expect(403);
    });

    it('RH cria aula ao vivo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/live-classes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          courseId,
          topic: 'Introdução Integração',
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
          duration: 60,
        })
        .expect(201);
      liveClassId = res.body.id;
      expect(res.body.course.id).toBe(courseId);
    });

    it('GET /live-classes — lista com filtro por curso', async () => {
      const res = await request(app.getHttpServer())
        .get('/live-classes')
        .query({ courseId })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((c: any) => c.id === liveClassId)).toBe(true);
    });

    it('GET /live-classes/upcoming — inclui a aula agendada', async () => {
      const res = await request(app.getHttpServer())
        .get('/live-classes/upcoming')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.id === liveClassId)).toBe(true);
    });

    it('RH actualiza o tópico da aula', async () => {
      const res = await request(app.getHttpServer())
        .put(`/live-classes/${liveClassId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ topic: 'Introdução Integração (revista)' })
        .expect(200);
      expect(res.body.topic).toBe('Introdução Integração (revista)');
    });
  });

  describe('Presença (join/leave) — bug: leave sem join prévio 500ava (P2025 não tratado)', () => {
    it('sair de uma aula sem nunca ter entrado → 404 (não 500)', async () => {
      await request(app.getHttpServer())
        .post(`/live-classes/${liveClassId}/leave`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });

    it('colaborador entra na aula → cria presença', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${liveClassId}/join`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body.leftAt).toBeNull();
    });

    it('reentrar (rejoin) — actualiza joinedAt e limpa leftAt', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${liveClassId}/join`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body.leftAt).toBeNull();
    });

    it('colaborador sai da aula → grava leftAt', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${liveClassId}/leave`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body.leftAt).toBeTruthy();
    });

    it('RH vê o relatório de presença com duração calculada', async () => {
      const res = await request(app.getHttpServer())
        .get(`/live-classes/${liveClassId}/attendance-report`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const row = res.body.find((a: any) => a.userId === employeeId);
      expect(row.durationMinutes).toBeGreaterThanOrEqual(0);
    });

    it('colaborador (não ADMIN/RH/LIDER) não acede ao relatório de presença → 403', async () => {
      await request(app.getHttpServer())
        .get(`/live-classes/${liveClassId}/attendance-report`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Chat', () => {
    it('colaborador envia mensagem no chat', async () => {
      await request(app.getHttpServer())
        .post(`/live-classes/${liveClassId}/message`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ message: 'Boa tarde a todos!' })
        .expect(201);
    });

    it('GET /:id/messages — reflecte a mensagem enviada', async () => {
      const res = await request(app.getHttpServer())
        .get(`/live-classes/${liveClassId}/messages`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((m: any) => m.message === 'Boa tarde a todos!')).toBe(true);
    });

    it('GET /:id — detalhe inclui mensagens e presenças', async () => {
      const res = await request(app.getHttpServer())
        .get(`/live-classes/${liveClassId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
      expect(res.body.attendances.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Avaliação pós-aula', () => {
    it('RH cria avaliação pós-aula → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${liveClassId}/post-evaluation`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      evaluationId = res.body.id;
    });

    it('criar de novo → 409 (já existe)', async () => {
      await request(app.getHttpServer())
        .post(`/live-classes/${liveClassId}/post-evaluation`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(409);
    });

    it('colaborador responde à avaliação → actualiza averageScore', async () => {
      await request(app.getHttpServer())
        .post('/live-classes/post-evaluation/respond')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ evaluationId, rating: 4, feedback: 'Muito boa aula' })
        .expect(201);

      const evaluation = await prisma.postClassEvaluation.findUnique({
        where: { id: evaluationId },
      });
      expect(evaluation!.averageScore).toBe(4);
    });

    it('reenviar resposta (upsert) — actualiza em vez de duplicar', async () => {
      await request(app.getHttpServer())
        .post('/live-classes/post-evaluation/respond')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ evaluationId, rating: 2 })
        .expect(201);

      const count = await prisma.postClassResponse.count({
        where: { evaluationId, userId: employeeId },
      });
      expect(count).toBe(1);
      const evaluation = await prisma.postClassEvaluation.findUnique({
        where: { id: evaluationId },
      });
      expect(evaluation!.averageScore).toBe(2);
    });
  });

  describe('Remoção', () => {
    it('admin remove a aula → cascata limpa presenças/mensagens/avaliação', async () => {
      await request(app.getHttpServer())
        .delete(`/live-classes/${liveClassId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const remaining = await prisma.liveClass.findUnique({ where: { id: liveClassId } });
      expect(remaining).toBeNull();
      liveClassId = 0 as any;
    });
  });
});
