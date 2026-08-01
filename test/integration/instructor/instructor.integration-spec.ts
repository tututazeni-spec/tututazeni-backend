import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const COURSE_CODE = 'INT-TEST-INSTRUCTOR-001';

describe('Instructor Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;
  let rhId: number;
  let adminId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let courseId: number;
  let instructorProfileId: number;
  let cohortId: number;

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
    const rh = await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } });
    rhId = rh!.id;
    const admin = await prisma.user.findUnique({ where: { email: 'int.admin@innova-test.com' } });
    adminId = admin!.id;

    const course = await prisma.course.upsert({
      where: { internalCode: COURSE_CODE },
      update: {},
      create: {
        title: 'Curso Integração — Instructor',
        internalCode: COURSE_CODE,
        description: 'Curso dedicado aos testes de integração do módulo instructor',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    if (cohortId) {
      await prisma.cohortParticipant.deleteMany({ where: { cohortId } }).catch(() => undefined);
      await prisma.instructorCohort.deleteMany({ where: { id: cohortId } }).catch(() => undefined);
    }
    if (instructorProfileId) {
      await prisma.instructorPayout
        .deleteMany({ where: { instructorId: instructorProfileId } })
        .catch(() => undefined);
      await prisma.instructorReview
        .deleteMany({ where: { instructorId: instructorProfileId } })
        .catch(() => undefined);
      await prisma.instructorCourse
        .deleteMany({ where: { instructorId: instructorProfileId } })
        .catch(() => undefined);
      await prisma.marketplaceCourse
        .deleteMany({ where: { instructorId: instructorProfileId } })
        .catch(() => undefined);
      await prisma.instructorProfile
        .deleteMany({ where: { id: instructorProfileId } })
        .catch(() => undefined);
    }
    await prisma.enrollment.deleteMany({ where: { courseId } }).catch(() => undefined);
    await prisma.course.deleteMany({ where: { internalCode: COURSE_CODE } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Perfil de instrutor', () => {
    it('colaborador cria o seu perfil de instrutor → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/instructors/profile')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ expertiseArea: 'Engenharia de Software', instructorType: 'STANDARD' })
        .expect(201);
      instructorProfileId = res.body.id;
      expect(res.body.approved).toBe(false);
    });

    it('criar segundo perfil para o mesmo utilizador → 409', async () => {
      await request(app.getHttpServer())
        .post('/instructors/profile')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ expertiseArea: 'Duplicado' })
        .expect(409);
    });

    it('GET /instructors/my/profile — reflecte o perfil próprio', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors/my/profile')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(instructorProfileId);
    });

    it('admin aprova o instrutor → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/instructors/${instructorProfileId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.approved).toBe(true);
    });

    it('colaborador (não-admin) não pode aprovar instrutor → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/instructors/${instructorProfileId}/approve`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /instructors/:id — detalhe público inclui nome do utilizador', async () => {
      const res = await request(app.getHttpServer())
        .get(`/instructors/${instructorProfileId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.user.fullName).toBe('Employee Int');
    });

    it('GET /instructors/my/dashboard — nome do próprio instrutor está preenchido (bug: findByUser não incluía user)', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors/my/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.profile.fullName).toBe('Employee Int');
    });

    it('actualizar o meu perfil → 200', async () => {
      const res = await request(app.getHttpServer())
        .put('/instructors/my/profile')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ bio: 'Instrutor sénior de engenharia' })
        .expect(200);
      expect(res.body.bio).toBe('Instrutor sénior de engenharia');
    });
  });

  describe('Filtro booleano (bug: ?approved=false devia excluir aprovados)', () => {
    it('GET /instructors?approved=true — inclui o instrutor aprovado', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors')
        .query({ approved: 'true' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((i: any) => i.id === instructorProfileId)).toBe(true);
    });

    it('GET /instructors?approved=false — NÃO deve incluir o instrutor já aprovado', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors')
        .query({ approved: 'false' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((i: any) => i.id === instructorProfileId)).toBe(false);
    });
  });

  describe('Turmas (Cohorts)', () => {
    it('criar turma com participante inicial → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/instructors/my/cohorts')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          name: 'Turma Integração 1',
          courseId,
          maxParticipants: 2,
          startDate: new Date().toISOString(),
          participantIds: [managerId],
        })
        .expect(201);
      cohortId = res.body.id;
      expect(res.body.status).toBe('OPEN');
    });

    it('participante inicial foi mesmo adicionado e inscrito no curso', async () => {
      const participant = await prisma.cohortParticipant.findUnique({
        where: { cohortId_userId: { cohortId, userId: managerId } },
      });
      expect(participant).toBeTruthy();

      const enrollment = await prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId, userId: managerId } },
      });
      expect(enrollment).toBeTruthy();
    });

    it('GET /instructors/my/cohorts — lista as minhas turmas', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors/my/cohorts')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((c: any) => c.id === cohortId)).toBe(true);
    });

    it('outro instrutor não vê/edita a turma alheia → 404', async () => {
      await request(app.getHttpServer())
        .get(`/instructors/my/cohorts/${cohortId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('actualizar turma via participantIds no PUT — adiciona novo participante sem 500 (bug: participantIds vazava para o Prisma)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/instructors/my/cohorts/${cohortId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ description: 'Turma actualizada', participantIds: [rhId] })
        .expect(200);
      expect(res.body.description).toBe('Turma actualizada');

      const participant = await prisma.cohortParticipant.findUnique({
        where: { cohortId_userId: { cohortId, userId: rhId } },
      });
      expect(participant).toBeTruthy();
    });

    it('adicionar participante além da capacidade máxima → 400', async () => {
      await request(app.getHttpServer())
        .post(`/instructors/my/cohorts/${cohortId}/participants`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userIds: [adminId] })
        .expect(400);
    });

    it('GET /instructors/my/cohorts/:id — detalhe com progresso e alertas de risco', async () => {
      const res = await request(app.getHttpServer())
        .get(`/instructors/my/cohorts/${cohortId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const managerRow = res.body.participants.find((p: any) => p.userId === managerId);
      expect(managerRow.enrollmentProgress).toBe(0);
      expect(typeof managerRow.enrollmentProgress).toBe('number');
    });

    it('remover participante da turma → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/instructors/my/cohorts/${cohortId}/participants/${rhId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const participant = await prisma.cohortParticipant.findUnique({
        where: { cohortId_userId: { cohortId, userId: rhId } },
      });
      expect(participant).toBeNull();
    });
  });

  describe('Analytics, at-risk e reviews', () => {
    it('GET /instructors/my/analytics — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors/my/analytics')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.totals.cohorts).toBeGreaterThanOrEqual(1);
    });

    it('GET /instructors/my/at-risk-students — 200 (turma ainda em OPEN, sem risco activo)', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors/my/at-risk-students')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body.students)).toBe(true);
    });

    it('RH avalia o instrutor (1-5) → actualiza ratingAverage', async () => {
      await request(app.getHttpServer())
        .post('/instructors/reviews')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ instructorId: instructorProfileId, rating: 4, comment: 'Muito bom instrutor' })
        .expect(201);

      const profile = await prisma.instructorProfile.findUnique({
        where: { id: instructorProfileId },
      });
      expect(profile!.ratingAverage).toBe(4);
    });

    it('mesmo utilizador reavalia (upsert) — actualiza em vez de duplicar', async () => {
      await request(app.getHttpServer())
        .post('/instructors/reviews')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ instructorId: instructorProfileId, rating: 2, comment: 'Revisto' })
        .expect(201);

      const count = await prisma.instructorReview.count({
        where: { instructorId: instructorProfileId, userId: rhId },
      });
      expect(count).toBe(1);

      const profile = await prisma.instructorProfile.findUnique({
        where: { id: instructorProfileId },
      });
      expect(profile!.ratingAverage).toBe(2);
    });
  });

  describe('Marketplace', () => {
    it('instrutor cria curso no marketplace → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/instructors/marketplace/courses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'Curso Marketplace Integração', price: 49.9, category: 'Tech' })
        .expect(201);
      expect(res.body.title).toBe('Curso Marketplace Integração');

      const profile = await prisma.instructorProfile.findUnique({
        where: { id: instructorProfileId },
      });
      expect(profile!.totalCourses).toBe(1);
    });

    it('GET /instructors/marketplace — lista cursos', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors/marketplace')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((c: any) => c.title === 'Curso Marketplace Integração')).toBe(true);
    });
  });

  describe('Payouts (admin)', () => {
    it('colaborador não pode registar payout → 403', async () => {
      await request(app.getHttpServer())
        .post(`/instructors/${instructorProfileId}/payout`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ amount: 100 })
        .expect(403);
    });

    it('RH (não-admin) não pode registar payout → 403', async () => {
      await request(app.getHttpServer())
        .post(`/instructors/${instructorProfileId}/payout`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ amount: 100 })
        .expect(403);
    });

    it('admin regista payout → 201', async () => {
      await request(app.getHttpServer())
        .post(`/instructors/${instructorProfileId}/payout`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 250.5 })
        .expect(201);
    });

    it('GET /instructors/my/payouts — reflecte o pagamento', async () => {
      const res = await request(app.getHttpServer())
        .get('/instructors/my/payouts')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((p: any) => p.amount === 250.5)).toBe(true);
    });
  });

  describe('Revogação', () => {
    it('admin revoga a aprovação → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/instructors/${instructorProfileId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.approved).toBe(false);
    });
  });
});
