import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// PDF "carregado" inline em Lesson.contentUrl (mesmo padrão do avatar/thumbnail).
const LESSON_PDF_DATA_URL = 'data:application/pdf;base64,JVBERi0xLjQK';

describe('Course Modules Integration', () => {
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
  let moduleId: number;
  let secondModuleId: number;
  let clonedModuleId: number;
  let lessonId: number;
  let secondLessonId: number;
  let materialId: number;
  let assessmentId: number;

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

    const course = await prisma.course.create({
      data: {
        title: 'Curso Course-Modules Integration',
        internalCode: 'INT-COURSE-MODULES-001',
        description: 'Curso dedicado ao teste de course-modules',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    if (assessmentId) {
      await prisma.assessment.deleteMany({ where: { id: assessmentId } }).catch(() => undefined);
    }
    await prisma.lessonProgress
      .deleteMany({ where: { lesson: { module: { courseId } } } })
      .catch(() => undefined);
    await prisma.lesson.deleteMany({ where: { module: { courseId } } }).catch(() => undefined);
    await prisma.moduleMaterial
      .deleteMany({ where: { module: { courseId } } })
      .catch(() => undefined);
    await prisma.courseModule.deleteMany({ where: { courseId } }).catch(() => undefined);
    await prisma.enrollment.deleteMany({ where: { courseId } }).catch(() => undefined);
    await prisma.courseAnalytics.deleteMany({ where: { courseId } }).catch(() => undefined);
    await prisma.course.deleteMany({ where: { id: courseId } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Módulos — CRUD', () => {
    it('RH cria módulo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/modules')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ courseId, title: 'Módulo 1', seq: 0, type: 'THEORETICAL' })
        .expect(201);
      moduleId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.mandatory).toBe(true);
    });

    it('colaborador não pode criar módulo → 403', async () => {
      await request(app.getHttpServer())
        .post('/modules')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ courseId, title: 'X', seq: 1 })
        .expect(403);
    });

    it('criar módulo em curso inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/modules')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ courseId: 999999, title: 'X', seq: 0 })
        .expect(404);
    });

    it('GET /modules/:id — qualquer autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/modules/${moduleId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(moduleId);
    });

    it('publicar módulo sem aulas → 400', async () => {
      await request(app.getHttpServer())
        .patch(`/modules/${moduleId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(400);
    });

    it('PUT /modules/:id — RH actualiza → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/modules/${moduleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Descrição actualizada' })
        .expect(200);
      expect(res.body.description).toBe('Descrição actualizada');
    });
  });

  describe('Aulas — CRUD', () => {
    it('RH cria aula no módulo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/lessons')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          moduleId,
          title: 'Aula 1',
          contentType: 'PDF',
          seq: 0,
          contentUrl: LESSON_PDF_DATA_URL,
        })
        .expect(201);
      lessonId = res.body.id;
      expect(res.body.moduleId).toBe(moduleId);
      expect(res.body.contentUrl).toBe(LESSON_PDF_DATA_URL);
    });

    it('criar aula em módulo inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/lessons')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ moduleId: 999999, title: 'X', contentType: 'VIDEO', seq: 0 })
        .expect(404);
    });

    it('publicar módulo agora com aula → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/modules/${moduleId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('PUT /lessons/:id — RH actualiza → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/lessons/${lessonId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Aula 1 (actualizada)' })
        .expect(200);
      expect(res.body.title).toBe('Aula 1 (actualizada)');
    });

    it('RH cria segundo módulo + segunda aula para testar reorder/move', async () => {
      const modRes = await request(app.getHttpServer())
        .post('/modules')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ courseId, title: 'Módulo 2', seq: 1 })
        .expect(201);
      secondModuleId = modRes.body.id;

      const lessonRes = await request(app.getHttpServer())
        .post('/lessons')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ moduleId: secondModuleId, title: 'Aula 2', contentType: 'TEXT', seq: 0 })
        .expect(201);
      secondLessonId = lessonRes.body.id;
    });

    it('PATCH /modules/reorder/:courseId — reordena módulos do curso', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/modules/reorder/${courseId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          order: [
            { id: moduleId, seq: 1 },
            { id: secondModuleId, seq: 0 },
          ],
        })
        .expect(200);
      const bySeq = [...res.body].sort((a: any, b: any) => a.seq - b.seq);
      expect(bySeq[0].id).toBe(secondModuleId);
    });

    it('PATCH /modules/reorder/:courseId — módulo de outro curso rejeitado → 400', async () => {
      await request(app.getHttpServer())
        .patch(`/modules/reorder/${courseId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ order: [{ id: 999999, seq: 0 }] })
        .expect(400);
    });

    it('PATCH /lessons/:id/move — move aula para outro módulo', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/lessons/${secondLessonId}/move`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetModuleId: moduleId, seq: 5 })
        .expect(200);
      expect(res.body.moduleId).toBe(moduleId);
    });

    it('PATCH /lessons/reorder/:moduleId — reordena aulas do módulo', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/lessons/reorder/${moduleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send([
          { id: lessonId, seq: 1 },
          { id: secondLessonId, seq: 0 },
        ])
        .expect(200);
      expect(res.body.find((l: any) => l.id === secondLessonId).seq).toBe(0);
    });
  });

  describe('Materiais complementares', () => {
    it('RH adiciona material ao módulo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/modules/${moduleId}/materials`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Slide de apoio', url: 'https://ci.innova.test/slides.pdf' })
        .expect(201);
      materialId = res.body.id;
      expect(res.body.moduleId).toBe(moduleId);
    });

    it('GET /modules/:id — inclui o material adicionado', async () => {
      const res = await request(app.getHttpServer())
        .get(`/modules/${moduleId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.materials.some((m: any) => m.id === materialId)).toBe(true);
    });

    it('DELETE /modules/materials/:materialId — remove material → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/modules/materials/${materialId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const row = await prisma.moduleMaterial.findUnique({ where: { id: materialId } });
      expect(row).toBeNull();
      materialId = 0;
    });
  });

  describe('Clonagem de módulo', () => {
    it('POST /modules/:id/clone — clona módulo incluindo aulas', async () => {
      const res = await request(app.getHttpServer())
        .post(`/modules/${moduleId}/clone`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetCourseId: courseId })
        .expect(201);
      clonedModuleId = res.body.id;
      expect(res.body.title).toContain('(cópia)');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.lessons.length).toBeGreaterThanOrEqual(1);
    });

    it('clonar para curso inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post(`/modules/${moduleId}/clone`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetCourseId: 999999 })
        .expect(404);
    });
  });

  describe('Progresso — colaborador', () => {
    it('marcar aula concluída sem matrícula → 403 (não acessível)', async () => {
      await request(app.getHttpServer())
        .post('/lessons/progress')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ lessonId })
        .expect(403);
    });

    it('inscreve colaborador no curso', async () => {
      await prisma.enrollment.create({
        data: { userId: employeeId, courseId, status: 'NOT_STARTED' },
      });
    });

    it('marcar aula concluída após matrícula → 200, actualiza enrollment para IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .post('/lessons/progress')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ lessonId, watchedSeconds: 120 })
        .expect(200);
      expect(res.body.progress.completed).toBe(true);

      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId },
      });
      expect(enrollment!.status).toBe('IN_PROGRESS');
    });

    it('marcar a mesma aula outra vez → upsert, não cria segunda linha', async () => {
      await request(app.getHttpServer())
        .post('/lessons/progress')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ lessonId, watchedSeconds: 200 })
        .expect(200);

      const rows = await prisma.lessonProgress.findMany({
        where: { lessonId, userId: employeeId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].watchedSeconds).toBe(200);
    });

    it('GET /modules/:id/completed — módulo concluído após completar a única aula restante', async () => {
      await request(app.getHttpServer())
        .post('/lessons/progress')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ lessonId: secondLessonId })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/modules/${moduleId}/completed`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      // NOTA: supertest/superagent não popula res.body para um JSON primitivo de topo
      // (true/false) — cai no fallback {} do getter. res.text tem o corpo real.
      expect(res.text).toBe('true');
    });

    it('GET /courses/:courseId/module-progress — devolve módulos com contagens correctas (rota distinta de courses/:id/progress)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/courses/${courseId}/module-progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const mod = res.body.find((m: any) => m.id === moduleId);
      expect(mod.completed).toBe(true);
      expect(mod.pct).toBe(100);
    });

    it('module-progress — colaborador inscrito recebe o contentUrl do PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/courses/${courseId}/module-progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const mod = res.body.find((m: any) => m.id === moduleId);
      const lesson = mod.lessons.find((l: any) => l.id === lessonId);
      expect(lesson.contentUrl).toBe(LESSON_PDF_DATA_URL);
    });

    it('module-progress — utilizador NÃO inscrito recebe contentUrl null', async () => {
      const res = await request(app.getHttpServer())
        .get(`/courses/${courseId}/module-progress`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const mod = res.body.find((m: any) => m.id === moduleId);
      const lesson = mod.lessons.find((l: any) => l.id === lessonId);
      expect(lesson.contentUrl).toBeNull();
    });
  });

  describe('Analytics do módulo', () => {
    it('GESTOR acede a analytics do módulo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/modules/${moduleId}/analytics`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.moduleId).toBe(moduleId);
      expect(res.body.totalEnrollments).toBeGreaterThanOrEqual(1);
    });

    it('colaborador não pode aceder a analytics → 403', async () => {
      await request(app.getHttpServer())
        .get(`/modules/${moduleId}/analytics`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Eliminação — guards', () => {
    it('eliminar módulo com progresso activo → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/modules/${moduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('eliminar módulo sem progresso, mas com avaliação ligada → 200 e avisa (não bloqueia)', async () => {
      const assessment = await prisma.assessment.create({
        data: { title: 'Avaliação do módulo clonado', moduleId: clonedModuleId },
      });
      assessmentId = assessment.id;

      const res = await request(app.getHttpServer())
        .delete(`/modules/${clonedModuleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.hadLinkedAssessments).toBe(true);
      expect(res.body.linkedAssessments).toBe(1);

      const reloaded = await prisma.assessment.findUnique({ where: { id: assessmentId } });
      expect(reloaded!.moduleId).toBeNull();
    });

    it('eliminar aula sem progresso → 200, avisa hadProgress', async () => {
      const modRes = await request(app.getHttpServer())
        .post('/modules')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ courseId, title: 'Módulo Descartável', seq: 5 })
        .expect(201);
      const lessonRes = await request(app.getHttpServer())
        .post('/lessons')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ moduleId: modRes.body.id, title: 'Aula Descartável', contentType: 'VIDEO', seq: 0 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/lessons/${lessonRes.body.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.hadProgress).toBe(false);

      await request(app.getHttpServer())
        .delete(`/modules/${modRes.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Fase A — o caminho de conclusão por módulos (POST /lessons/progress) delega
  // no CourseCompletionService: concluir o módulo mandatory final tem de finalizar
  // o curso (COMPLETED) e emitir o certificado — antes disto só marcava progresso
  // e dava pontos, sem certificado.
  // ─────────────────────────────────────────────────────────────────────────────
  describe('conclusão consolidada (Fase A)', () => {
    let faseCourseId: number;
    let faseModuleId: number;
    let firstMandatoryLessonId: number;
    let finalMandatoryLessonId: number;
    let enrollmentId: number;

    beforeAll(async () => {
      const course = await prisma.course.create({
        data: {
          title: 'Curso Conclusão Consolidada (course-modules)',
          internalCode: `INT-COURSE-MODULES-FASEA-${Date.now()}`,
          description: 'x',
          status: 'PUBLISHED',
        },
      });
      faseCourseId = course.id;

      const mod = await prisma.courseModule.create({
        data: {
          courseId: faseCourseId,
          title: 'Módulo obrigatório',
          seq: 0,
          status: 'PUBLISHED',
          mandatory: true,
          progressionType: 'FREE',
          completionRule: 'ALL_LESSONS',
        },
      });
      faseModuleId = mod.id;

      const l1 = await prisma.lesson.create({
        data: { moduleId: faseModuleId, title: 'Aula 1', type: 'TEXT', seq: 0 },
      });
      firstMandatoryLessonId = l1.id;
      const l2 = await prisma.lesson.create({
        data: { moduleId: faseModuleId, title: 'Aula 2', type: 'TEXT', seq: 1 },
      });
      finalMandatoryLessonId = l2.id;

      const enr = await prisma.enrollment.create({
        data: {
          userId: employeeId,
          courseId: faseCourseId,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });
      enrollmentId = enr.id;

      // Todas as aulas obrigatórias menos a última já concluídas.
      await prisma.lessonProgress.create({
        data: {
          lessonId: firstMandatoryLessonId,
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

    it('completar o módulo mandatory final via /lessons/progress → curso COMPLETED + certificado emitido (antes: só pontos)', async () => {
      const res = await request(app.getHttpServer())
        .post('/lessons/progress')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ lessonId: finalMandatoryLessonId })
        .expect(200);

      expect(res.body.moduleCompleted).toBe(true);

      const enr = await prisma.enrollment.findFirst({
        where: { userId: employeeId, courseId: faseCourseId },
      });
      expect(enr!.status).toBe('COMPLETED');
      const cert = await prisma.certificate.findFirst({ where: { enrollmentId: enr!.id } });
      expect(cert).not.toBeNull();
    });
  });
});
