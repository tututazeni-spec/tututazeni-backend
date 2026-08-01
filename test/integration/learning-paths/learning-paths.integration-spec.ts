import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const COURSE_CODE_1 = 'INT-TEST-LP-001';
const COURSE_CODE_2 = 'INT-TEST-LP-002';

describe('Learning Paths Integration', () => {
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

  let course1Id: number;
  let course2Id: number;
  let mandatoryPathId: number;
  let normalPathId: number;
  let deletablePathId: number;
  let milestoneId: number;

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

    const c1 = await prisma.course.upsert({
      where: { internalCode: COURSE_CODE_1 },
      update: {},
      create: {
        title: 'Curso Integração LP 1',
        internalCode: COURSE_CODE_1,
        status: 'PUBLISHED',
        workloadHours: 4,
      },
    });
    course1Id = c1.id;
    const c2 = await prisma.course.upsert({
      where: { internalCode: COURSE_CODE_2 },
      update: {},
      create: {
        title: 'Curso Integração LP 2',
        internalCode: COURSE_CODE_2,
        status: 'PUBLISHED',
        workloadHours: 6,
      },
    });
    course2Id = c2.id;
  });

  afterAll(async () => {
    const pathIds = [mandatoryPathId, normalPathId, deletablePathId].filter(Boolean);
    if (pathIds.length) {
      await prisma.learningPathEnrollment
        .deleteMany({ where: { learningPathId: { in: pathIds } } })
        .catch(() => undefined);
      await prisma.learningPathAssignment
        .deleteMany({ where: { learningPathId: { in: pathIds } } })
        .catch(() => undefined);
      await prisma.learningPathMilestone
        .deleteMany({ where: { learningPathId: { in: pathIds } } })
        .catch(() => undefined);
      await prisma.learningPathCourse
        .deleteMany({ where: { learningPathId: { in: pathIds } } })
        .catch(() => undefined);
      await prisma.learningPath
        .deleteMany({ where: { id: { in: pathIds } } })
        .catch(() => undefined);
    }
    await prisma.enrollment
      .deleteMany({ where: { courseId: { in: [course1Id, course2Id] } } })
      .catch(() => undefined);
    await prisma.course
      .deleteMany({ where: { internalCode: { in: [COURSE_CODE_1, COURSE_CODE_2] } } })
      .catch(() => undefined);
    await prisma.userPoints.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    await prisma.notificationLog
      .deleteMany({ where: { userId: { in: [employeeId, managerId] } } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('CRUD e ciclo de vida', () => {
    it('colaborador não pode criar trilha → 403', async () => {
      await request(app.getHttpServer())
        .post('/learning-paths')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'X' })
        .expect(403);
    });

    it('RH cria trilha obrigatória → 201, inicia DRAFT', async () => {
      const res = await request(app.getHttpServer())
        .post('/learning-paths')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Int Test Trilha Obrigatória',
          mandatory: true,
          courseIds: [course1Id, course2Id],
        })
        .expect(201);
      mandatoryPathId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.totalHours).toBe(10);
    });

    it('trilha DRAFT sem conteúdo não pode ser publicada → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/learning-paths')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Int Test Vazia' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/learning-paths/${res.body.id}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(400);
      await prisma.learningPath.delete({ where: { id: res.body.id } });
    });

    it('publicar trilha com conteúdo → PUBLISHED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/learning-paths/${mandatoryPathId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('RH cria segunda trilha (não-obrigatória) e publica → para testes de filtro', async () => {
      const res = await request(app.getHttpServer())
        .post('/learning-paths')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Int Test Trilha Normal', mandatory: false, courseIds: [course1Id] })
        .expect(201);
      normalPathId = res.body.id;
      await request(app.getHttpServer())
        .patch(`/learning-paths/${normalPathId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('?mandatory=true — inclui só a obrigatória (bug: coerção de booleano)', async () => {
      const res = await request(app.getHttpServer())
        .get('/learning-paths')
        .query({ mandatory: 'true' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === mandatoryPathId)).toBe(true);
      expect(res.body.data.some((p: any) => p.id === normalPathId)).toBe(false);
    });

    it('?mandatory=false — NÃO deve incluir a obrigatória', async () => {
      const res = await request(app.getHttpServer())
        .get('/learning-paths')
        .query({ mandatory: 'false' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === mandatoryPathId)).toBe(false);
      expect(res.body.data.some((p: any) => p.id === normalPathId)).toBe(true);
    });

    it('GET /learning-paths/:id — detalhe com steps e milestones', async () => {
      const res = await request(app.getHttpServer())
        .get(`/learning-paths/${mandatoryPathId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.courses.length).toBe(2);
    });

    it('duplicar trilha → cópia em DRAFT com os mesmos steps', async () => {
      const res = await request(app.getHttpServer())
        .post(`/learning-paths/${normalPathId}/duplicate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.title).toContain('cópia');
      expect(res.body.courses.length).toBe(1);
      deletablePathId = res.body.id;
    });
  });

  describe('Steps e Milestones', () => {
    it('criar milestone na trilha → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/learning-paths/${mandatoryPathId}/milestones`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Marco 1', seq: 1 })
        .expect(201);
      milestoneId = res.body.id;
    });

    it('reordenar steps → 200', async () => {
      await request(app.getHttpServer())
        .patch(`/learning-paths/${mandatoryPathId}/steps/reorder`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          order: [
            { courseId: course2Id, seq: 0 },
            { courseId: course1Id, seq: 1 },
          ],
        })
        .expect(200);

      const detail = await request(app.getHttpServer())
        .get(`/learning-paths/${mandatoryPathId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(detail.body.courses[0].courseId).toBe(course2Id);
    });

    it('remover milestone → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/learning-paths/milestones/${milestoneId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('Matrícula, progresso e conclusão automática', () => {
    it('colaborador auto-matricula-se na trilha obrigatória → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/learning-paths/${mandatoryPathId}/enroll`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body.enrolled).toBeGreaterThanOrEqual(1);
    });

    it('reinscrição → 409', async () => {
      await request(app.getHttpServer())
        .post(`/learning-paths/${mandatoryPathId}/enroll`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);
    });

    it('GET /learning-paths/my/enrollments — reflecte a matrícula', async () => {
      const res = await request(app.getHttpServer())
        .get('/learning-paths/my/enrollments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((e: any) => e.learningPath.id === mandatoryPathId)).toBe(true);
    });

    it('GET /learning-paths/:id/progress — segundo step bloqueado (progressão SEQUENTIAL)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/learning-paths/${mandatoryPathId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.steps[0].locked).toBe(false);
      expect(res.body.steps[1].locked).toBe(true);
    });

    it('concluir todos os cursos da trilha → conclusão automática + XP', async () => {
      await prisma.enrollment.updateMany({
        where: { userId: employeeId, courseId: { in: [course1Id, course2Id] } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      const res = await request(app.getHttpServer())
        .get(`/learning-paths/${mandatoryPathId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.overallPct).toBe(100);

      const enrollment = await prisma.learningPathEnrollment.findFirst({
        where: { learningPathId: mandatoryPathId, userId: employeeId },
      });
      expect(enrollment!.status).toBe('COMPLETED');

      const points = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      expect(points!.points).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Atribuição (assign)', () => {
    it('gestor atribui a trilha normal a um utilizador específico', async () => {
      const res = await request(app.getHttpServer())
        .post('/learning-paths/assign')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ learningPathId: normalPathId, targetType: 'USER', targetId: managerId })
        .expect(201);
      expect(res.body.assignment.learningPathId).toBe(normalPathId);
    });

    it('não é possível atribuir trilha em DRAFT → 400', async () => {
      await request(app.getHttpServer())
        .post('/learning-paths/assign')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ learningPathId: deletablePathId, targetType: 'USER', targetId: managerId })
        .expect(400);
    });

    it('RH vê as atribuições da trilha', async () => {
      const res = await request(app.getHttpServer())
        .get(`/learning-paths/${normalPathId}/assignments`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((a: any) => a.targetId === managerId)).toBe(true);
    });
  });

  describe('Analytics e Dashboard admin', () => {
    it('gestor vê analytics da trilha obrigatória', async () => {
      const res = await request(app.getHttpServer())
        .get(`/learning-paths/${mandatoryPathId}/analytics`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.enrollments.completed).toBeGreaterThanOrEqual(1);
      expect(res.body.completionRate).toBeGreaterThan(0);
    });

    it('colaborador não acede ao dashboard admin → 403', async () => {
      await request(app.getHttpServer())
        .get('/learning-paths/admin/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH vê o dashboard admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/learning-paths/admin/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.paths.total).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Remoção (bug: RESTRICT em LearningPathEnrollment/Assignment não guardado por status)', () => {
    it('arquivar a trilha obrigatória (já tem matrícula concluída)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/learning-paths/${mandatoryPathId}/archive`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ARCHIVED');
    });

    it('trilha ARCHIVED com matrícula não pode ser eliminada → 403 (não 500)', async () => {
      await request(app.getHttpServer())
        .delete(`/learning-paths/${mandatoryPathId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('trilha DRAFT sem matrículas/atribuições pode ser eliminada → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/learning-paths/${deletablePathId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      deletablePathId = 0 as any;
    });
  });

  describe('Remover step', () => {
    it('remover um curso da trilha normal → recalcula totalHours', async () => {
      await request(app.getHttpServer())
        .delete(`/learning-paths/${normalPathId}/steps/${course1Id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const detail = await request(app.getHttpServer())
        .get(`/learning-paths/${normalPathId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(detail.body.courses.length).toBe(0);
      expect(detail.body.totalHours).toBe(0);
    });
  });
});
