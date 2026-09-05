import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Courses Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let courseId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

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
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await app.close();
  });

  describe('GET /courses', () => {
    it('lista cursos com token → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/courses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : res.body.data;
      expect(items).toBeDefined();

      if (items.length > 0) courseId = items[0].id;
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/courses').expect(401);
    });
  });

  describe('GET /courses/:id', () => {
    it('detalhe de curso existente → 200', async () => {
      if (!courseId) return;
      const res = await request(app.getHttpServer())
        .get(`/courses/${courseId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', courseId);
      expect(res.body).toHaveProperty('title');
    });

    it('curso inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/courses/999999')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Fase A — CourseCompletionService é o dono único de progresso → conclusão →
  // efeitos. Concluir um curso pelo caminho "flat" (POST /courses/lessons/:id/
  // complete) tem de emitir certificado + pontos + notificação COURSE_COMPLETED,
  // e re-completar tem de ser idempotente.
  // ─────────────────────────────────────────────────────────────────────────────
  describe('conclusão consolidada (Fase A)', () => {
    let employeeId: number;
    let faseCourseId: number;
    let faseModuleId: number;
    let firstLessonId: number;
    let lastLessonId: number;
    let enrollmentId: number;

    beforeAll(async () => {
      const employee = await prisma.user.findUnique({
        where: { email: 'int.employee@innova-test.com' },
      });
      employeeId = employee!.id;

      const course = await prisma.course.create({
        data: {
          title: 'Curso Conclusão Consolidada (courses)',
          internalCode: `INT-COURSES-FASEA-${Date.now()}`,
          description: 'x',
          status: 'PUBLISHED',
        },
      });
      faseCourseId = course.id;

      // Módulo DRAFT — "curso sem módulos publicados": evaluateCompletion cai no
      // caminho de contagem de todas as aulas do curso.
      const mod = await prisma.courseModule.create({
        data: { courseId: faseCourseId, title: 'Módulo 1', seq: 0, status: 'DRAFT' },
      });
      faseModuleId = mod.id;

      const l1 = await prisma.lesson.create({
        data: { moduleId: faseModuleId, title: 'Aula 1', type: 'TEXT', seq: 0 },
      });
      firstLessonId = l1.id;
      const l2 = await prisma.lesson.create({
        data: { moduleId: faseModuleId, title: 'Aula 2', type: 'TEXT', seq: 1 },
      });
      lastLessonId = l2.id;

      const enr = await prisma.enrollment.create({
        data: {
          userId: employeeId,
          courseId: faseCourseId,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });
      enrollmentId = enr.id;

      // Todas as aulas menos a última já concluídas pelo employee.
      await prisma.lessonProgress.create({
        data: {
          lessonId: firstLessonId,
          userId: employeeId,
          enrollmentId,
          completed: true,
          completedAt: new Date(),
        },
      });
    });

    afterAll(async () => {
      await prisma.certificate.deleteMany({ where: { enrollmentId } }).catch(() => undefined);
      await prisma.lessonProgress
        .deleteMany({ where: { lesson: { module: { courseId: faseCourseId } } } })
        .catch(() => undefined);
      await prisma.enrollment
        .deleteMany({ where: { courseId: faseCourseId } })
        .catch(() => undefined);
      await prisma.courseAnalytics
        .deleteMany({ where: { courseId: faseCourseId } })
        .catch(() => undefined);
      await prisma.lesson
        .deleteMany({ where: { module: { courseId: faseCourseId } } })
        .catch(() => undefined);
      await prisma.courseModule
        .deleteMany({ where: { courseId: faseCourseId } })
        .catch(() => undefined);
      await prisma.course.deleteMany({ where: { id: faseCourseId } }).catch(() => undefined);
      await prisma.notificationLog
        .deleteMany({
          where: { userId: employeeId, metadata: { contains: `"courseId":${faseCourseId}` } },
        })
        .catch(() => undefined);
    });

    it('completar a última aula de um curso sem módulos publicados → COMPLETED + certificado + pontos + notificação COURSE_COMPLETED', async () => {
      const before = await prisma.userPoints.findUnique({ where: { userId: employeeId } });

      const res = await request(app.getHttpServer())
        .post(`/courses/lessons/${lastLessonId}/complete`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ watchedSeconds: 10 })
        .expect(200);

      expect(res.body.courseCompleted).toBe(true);

      const enr = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId: faseCourseId },
      });
      expect(enr!.status).toBe('COMPLETED');

      const cert = await prisma.certificate.findFirst({ where: { enrollmentId: enr!.id } });
      expect(cert).not.toBeNull();
      expect(cert!.type).toBe('COURSE');

      const after = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      expect(after?.points ?? 0).toBeGreaterThan(before?.points ?? 0);

      const notif = await prisma.notificationLog.findFirst({
        where: {
          userId: employeeId,
          type: 'COURSE_COMPLETED',
          metadata: { contains: `"courseId":${faseCourseId}` },
        },
        orderBy: { id: 'desc' },
      });
      expect(notif).not.toBeNull();
    });

    it('re-completar uma aula de um curso já concluído → idempotente, não cria 2º certificado nem 2ª ronda de pontos', async () => {
      const enr = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId: faseCourseId },
      });
      const certsBefore = await prisma.certificate.count({ where: { enrollmentId: enr!.id } });
      const pointsBefore =
        (await prisma.userPoints.findUnique({ where: { userId: employeeId } }))?.points ?? 0;

      await request(app.getHttpServer())
        .post(`/courses/lessons/${lastLessonId}/complete`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ watchedSeconds: 10 })
        .expect(200);

      expect(await prisma.certificate.count({ where: { enrollmentId: enr!.id } })).toBe(
        certsBefore,
      );
      expect(
        (await prisma.userPoints.findUnique({ where: { userId: employeeId } }))?.points ?? 0,
      ).toBe(pointsBefore);
    });
  });
});
