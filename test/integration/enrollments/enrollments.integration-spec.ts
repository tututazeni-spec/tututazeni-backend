import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Enrollments (admin/RH) Integration', () => {
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

  let courseId: number;
  let mandatoryCourseId: number;
  const createdEnrollmentIds: number[] = [];

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

    const course = await prisma.course.create({
      data: {
        title: 'Curso Enrollments Integration',
        internalCode: 'INT-ENROLLMENTS-001',
        description: 'x',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;

    const mandatoryCourse = await prisma.course.create({
      data: {
        title: 'Curso Obrigatório Enrollments Integration',
        internalCode: 'INT-ENROLLMENTS-002',
        description: 'x',
        status: 'PUBLISHED',
      },
    });
    mandatoryCourseId = mandatoryCourse.id;
  });

  afterAll(async () => {
    await prisma.certificate
      .deleteMany({ where: { enrollmentId: { in: createdEnrollmentIds } } })
      .catch(() => undefined);
    await prisma.enrollment
      .deleteMany({ where: { id: { in: createdEnrollmentIds } } })
      .catch(() => undefined);
    await prisma.enrollment
      .deleteMany({ where: { courseId: { in: [courseId, mandatoryCourseId] } } })
      .catch(() => undefined);
    await prisma.courseAnalytics
      .deleteMany({ where: { courseId: { in: [courseId, mandatoryCourseId] } } })
      .catch(() => undefined);
    await prisma.course
      .deleteMany({ where: { id: { in: [courseId, mandatoryCourseId] } } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('POST / — RH matricula utilizador', () => {
    it('RH matricula colaborador → 201, assignedById preenchido', async () => {
      const res = await request(app.getHttpServer())
        .post('/enrollments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, courseId })
        .expect(201);
      createdEnrollmentIds.push(res.body.id);
      expect(res.body.status).toBe('NOT_STARTED');

      const row = await prisma.enrollment.findUnique({ where: { id: res.body.id } });
      expect(row!.assignedById).not.toBeNull();
    });

    it('colaborador não pode matricular outros → 403', async () => {
      await request(app.getHttpServer())
        .post('/enrollments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: managerId, courseId })
        .expect(403);
    });

    it('matrícula duplicada (mesmo utilizador/curso, activa) → 409', async () => {
      await request(app.getHttpServer())
        .post('/enrollments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, courseId })
        .expect(409);
    });

    it('matricular em curso inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/enrollments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: managerId, courseId: 999999 })
        .expect(404);
    });

    it('RH matricula gestor no curso obrigatório (mandatory:true)', async () => {
      const res = await request(app.getHttpServer())
        .post('/enrollments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: managerId, courseId: mandatoryCourseId, mandatory: true })
        .expect(201);
      createdEnrollmentIds.push(res.body.id);
      expect(res.body.mandatory).toBe(true);
    });
  });

  describe('POST /bulk — matrícula em massa', () => {
    it('bulk enroll com utilizador já matriculado → success parcial + skipped', async () => {
      const res = await request(app.getHttpServer())
        .post('/enrollments/bulk')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userIds: [employeeId, managerId], courseId })
        .expect(201);
      // employeeId já está matriculado neste courseId (teste anterior) → skipped
      // managerId ainda não está → success
      expect(res.body.skipped).toBeGreaterThanOrEqual(1);
      expect(res.body.success).toBeGreaterThanOrEqual(1);
      expect(res.body.details.enrolled).toContain(managerId);

      const managerEnrollment = await prisma.enrollment.findFirst({
        where: { userId: managerId, courseId },
      });
      createdEnrollmentIds.push(managerEnrollment!.id);
    });
  });

  describe('GET / — listagem admin com filtros', () => {
    it('RH lista todas as matrículas do curso → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments')
        .query({ courseId })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data[0]).toHaveProperty('progressPercent');
    });

    it('filtro mandatory=false — verifica correcção do bug de coerção booleana', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments')
        .query({ courseId, mandatory: 'false' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.every((e: any) => e.mandatory === false)).toBe(true);
    });

    it('filtro mandatory=true — devolve apenas a matrícula obrigatória', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments')
        .query({ courseId: mandatoryCourseId, mandatory: 'true' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((e: any) => e.mandatory === true)).toBe(true);
    });

    it('colaborador não pode listar todas as matrículas → 403', async () => {
      await request(app.getHttpServer())
        .get('/enrollments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('GET /:id — detalhe com ownership', () => {
    it('dono acede à própria matrícula → 200', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId },
      });
      const res = await request(app.getHttpServer())
        .get(`/enrollments/${enrollment!.id}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(enrollment!.id);
      expect(res.body).toHaveProperty('completedLessons');
    });

    it('outro colaborador não-privilegiado não acede → 404', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: managerId, courseId },
      });
      await request(app.getHttpServer())
        .get(`/enrollments/${enrollment!.id}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('RH (privilegiado) acede a qualquer matrícula → 200', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: managerId, courseId },
      });
      await request(app.getHttpServer())
        .get(`/enrollments/${enrollment!.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('GET /users/:userId — matrículas de um utilizador (Admin/RH/Gestor)', () => {
    it('RH vê as matrículas do colaborador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/enrollments/users/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.enrollments.some((e: any) => e.courseId === courseId)).toBe(true);
    });

    it('colaborador não pode ver matrículas de outro utilizador → 403', async () => {
      await request(app.getHttpServer())
        .get(`/enrollments/users/${managerId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('PUT /:id/status — transições de estado', () => {
    it('transição válida NOT_STARTED → IN_PROGRESS', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId },
      });
      const res = await request(app.getHttpServer())
        .put(`/enrollments/${enrollment!.id}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('transição inválida IN_PROGRESS → NOT_STARTED (via mapa COMPLETED) é permitida, mas COMPLETED→NOT_STARTED não', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId },
      });
      await request(app.getHttpServer())
        .put(`/enrollments/${enrollment!.id}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      await request(app.getHttpServer())
        .put(`/enrollments/${enrollment!.id}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'NOT_STARTED' })
        .expect(400);
    });
  });

  describe('PATCH /:id/deadline', () => {
    it('RH actualiza deadline → 200', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: managerId, courseId },
      });
      const res = await request(app.getHttpServer())
        .patch(`/enrollments/${enrollment!.id}/deadline`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ deadline: '2027-01-01' })
        .expect(200);
      expect(new Date(res.body.deadline).getFullYear()).toBe(2027);
    });
  });

  describe('Cancelamento — colaborador vs Admin (verifica correcção do bypass raw-Prisma)', () => {
    it('colaborador cancela a própria matrícula opcional → 200', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: managerId, courseId },
      });
      await request(app.getHttpServer())
        .patch(`/enrollments/my/${enrollment!.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Já não preciso' })
        .expect(200);

      const row = await prisma.enrollment.findUnique({ where: { id: enrollment!.id } });
      expect(row!.status).toBe('CANCELLED');
    });

    it('colaborador não pode cancelar matrícula obrigatória → 403', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: managerId, courseId: mandatoryCourseId },
      });
      await request(app.getHttpServer())
        .patch(`/enrollments/my/${enrollment!.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(403);
    });

    it('Admin CANCELA matrícula obrigatória (bypassMandatoryCheck) → 200', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: managerId, courseId: mandatoryCourseId },
      });
      await request(app.getHttpServer())
        .patch(`/enrollments/${enrollment!.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Reorganização' })
        .expect(200);

      const row = await prisma.enrollment.findUnique({ where: { id: enrollment!.id } });
      expect(row!.status).toBe('CANCELLED');
      expect(row!.cancelReason).toBe('Reorganização');
    });

    it('Admin cancelar matrícula COMPLETED → continua bloqueado (403), mesmo com o bypass', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId },
      });
      // já foi marcada COMPLETED no teste de transição de estado acima
      await request(app.getHttpServer())
        .patch(`/enrollments/${enrollment!.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(403);
    });

    it('Admin cancelar matrícula inexistente → 404 (antes rebentava com 500 via bypass raw-Prisma)', async () => {
      await request(app.getHttpServer())
        .patch('/enrollments/999999/cancel')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(404);
    });
  });

  describe('Certificados', () => {
    it('gerar certificado para matrícula COMPLETED → 200', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId },
      });
      const res = await request(app.getHttpServer())
        .post(`/enrollments/my/${enrollment!.id}/certificate`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.validationCode).toBeTruthy();
    });

    it('segunda chamada devolve o mesmo certificado (idempotência)', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId },
      });
      const res1 = await request(app.getHttpServer())
        .post(`/enrollments/my/${enrollment!.id}/certificate`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const res2 = await request(app.getHttpServer())
        .post(`/enrollments/my/${enrollment!.id}/certificate`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res1.body.id).toBe(res2.body.id);
    });

    it('gerar certificado para matrícula não concluída → 400', async () => {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: managerId, courseId: mandatoryCourseId },
      });
      await request(app.getHttpServer())
        .post(`/enrollments/${enrollment!.id}/certificate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('Dashboards (Admin/RH/Gestor)', () => {
    it('GET /admin/dashboard → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.enrollments.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /compliance → 200, reflecte matrícula obrigatória cancelada', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments/compliance')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.mandatory.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /team — gestor vê progresso da equipa', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments/team')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body.team)).toBe(true);
    });

    it('colaborador não pode aceder aos dashboards → 403', async () => {
      await request(app.getHttpServer())
        .get('/enrollments/admin/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/enrollments/compliance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('POST /sync-overdue', () => {
    it('Admin sincroniza estados OVERDUE → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/enrollments/sync-overdue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('updated');
    });

    it('RH (não Admin) não pode sincronizar → 403', async () => {
      await request(app.getHttpServer())
        .post('/enrollments/sync-overdue')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });
  });
});
