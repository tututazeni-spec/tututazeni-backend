import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const COURSE_CODE = 'INT-TEST-LEADER-001';

describe('Leader Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;
  let adminId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let courseId: number;
  let planId: number;
  let meetingId: number;
  let originalEmployeeManagerId: number | null;

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
    originalEmployeeManagerId = employee!.managerId;
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    managerId = manager!.id;
    const admin = await prisma.user.findUnique({ where: { email: 'int.admin@innova-test.com' } });
    adminId = admin!.id;

    // Wire employee → manager for team-scoped endpoints (seed doesn't set this by default)
    await prisma.user.update({ where: { id: employeeId }, data: { managerId } });

    const course = await prisma.course.upsert({
      where: { internalCode: COURSE_CODE },
      update: {},
      create: {
        title: 'Curso Integração — Leader',
        internalCode: COURSE_CODE,
        description: 'Curso dedicado aos testes de integração do módulo leader',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;

    // Fase G3: leader.approvePlan delega no fluxo canónico — o plano tem de estar
    // em PENDING_APPROVAL e ter um managerId designado (a chave de ownership passou
    // a ser plan.managerId, não user.managerId).
    const plan = await prisma.developmentPlan.create({
      data: {
        name: 'PDI Integração Leader',
        goal: 'Crescer',
        userId: employeeId,
        managerId,
        status: 'PENDING_APPROVAL',
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    await prisma.user.update({
      where: { id: employeeId },
      data: { managerId: originalEmployeeManagerId },
    });

    if (meetingId) {
      await prisma.oneOnOneMeeting.deleteMany({ where: { id: meetingId } }).catch(() => undefined);
    }
    await prisma.feedback
      .deleteMany({ where: { fromUserId: managerId, toUserId: employeeId } })
      .catch(() => undefined);
    if (planId) {
      await prisma.developmentPlan.deleteMany({ where: { id: planId } }).catch(() => undefined);
    }
    await prisma.enrollment.deleteMany({ where: { courseId } }).catch(() => undefined);
    await prisma.course.deleteMany({ where: { internalCode: COURSE_CODE } }).catch(() => undefined);
    await prisma.notificationLog
      .deleteMany({ where: { userId: { in: [employeeId, managerId] } } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('RBAC (bug: ALL_MGMT hand-rolado omitia GESTOR — bloqueava o próprio papel de gestor)', () => {
    it('GESTOR consegue aceder ao seu dashboard (não deve dar 403)', async () => {
      await request(app.getHttpServer())
        .get('/leaders/my-dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('colaborador (não gestor) não acede ao dashboard de líder → 403', async () => {
      await request(app.getHttpServer())
        .get('/leaders/my-dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('colaborador não pode listar todos os líderes → 403', async () => {
      await request(app.getHttpServer())
        .get('/leaders')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('admin lista líderes — inclui GESTOR entre os papéis de liderança', async () => {
      const res = await request(app.getHttpServer())
        .get('/leaders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.some((l: any) => l.id === managerId)).toBe(true);
    });
  });

  describe('Equipa, talent pipeline e alertas', () => {
    it('GET /leaders/my-team — inclui o colaborador subordinado', async () => {
      const res = await request(app.getHttpServer())
        .get('/leaders/my-team')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.data.some((m: any) => m.id === employeeId)).toBe(true);
    });

    it('GET /leaders/my-talent-pipeline — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/leaders/my-talent-pipeline')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body.all)).toBe(true);
    });

    it('GET /leaders/my-alerts — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/leaders/my-alerts')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /leaders/my-recommendations — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/leaders/my-recommendations')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body.recommendations)).toBe(true);
    });

    it('GET /leaders/my-team/member/:memberId — perfil do subordinado', async () => {
      const res = await request(app.getHttpServer())
        .get(`/leaders/my-team/member/${employeeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.id).toBe(employeeId);
    });

    it('gestor não vê perfil de membro fora da sua equipa → 404', async () => {
      await request(app.getHttpServer())
        .get(`/leaders/my-team/member/${adminId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });
  });

  describe('Feedback (bug: campos giverId/receiverId/content/isPrivate não existiam no modelo real Feedback)', () => {
    it('gestor dá feedback ao colaborador → persiste de facto na BD', async () => {
      await request(app.getHttpServer())
        .post('/leaders/feedback')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          recipientId: employeeId,
          type: 'SBI',
          situation: 'Reunião',
          behavior: 'Atraso',
          impact: 'Atraso na entrega',
          content: 'Chegaste atrasado à reunião.',
        })
        .expect(201);

      const row = await prisma.feedback.findFirst({
        where: { fromUserId: managerId, toUserId: employeeId },
      });
      expect(row).toBeTruthy();
      expect(row!.message).toContain('Chegaste atrasado');
    });

    it('GET /leaders/feedback/team — 200 (escopo é feedback dado PELA equipa, não pelo próprio líder)', async () => {
      const res = await request(app.getHttpServer())
        .get('/leaders/feedback/team')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Reuniões 1:1 (bug: campo leaderId/notes não existiam no modelo real OneOnOneMeeting)', () => {
    it('agendar 1:1 → persiste com hostId/participantId reais', async () => {
      const res = await request(app.getHttpServer())
        .post('/leaders/1on1')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ participantId: employeeId, agenda: 'Ponto de situação mensal' })
        .expect(201);
      meetingId = res.body.id;
      expect(meetingId).toBeTruthy();

      const row = await prisma.oneOnOneMeeting.findUnique({ where: { id: meetingId } });
      expect(row).toBeTruthy();
      expect(row!.hostId).toBe(managerId);
      expect(row!.participantId).toBe(employeeId);
    });

    it('GET /leaders/1on1 — lista a reunião real', async () => {
      const res = await request(app.getHttpServer())
        .get('/leaders/1on1')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.some((m: any) => m.id === meetingId)).toBe(true);
    });

    it('participante conclui a reunião → grava minutes/status reais', async () => {
      await request(app.getHttpServer())
        .patch(`/leaders/1on1/${meetingId}/complete`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ notes: 'Discutimos objectivos do trimestre.' })
        .expect(200);

      const row = await prisma.oneOnOneMeeting.findUnique({ where: { id: meetingId } });
      expect(row!.status).toBe('COMPLETED');
      expect(row!.minutes).toBe('Discutimos objectivos do trimestre.');
      expect(row!.completedAt).toBeTruthy();
    });
  });

  describe('Aprovação de PDI (ownership já corrigido — A10-24)', () => {
    it('gestor da equipa aprova o PDI do seu subordinado → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/leaders/plans/${planId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.plan.status).toBe('ACTIVE');
    });
  });

  describe('Atribuição de curso e perfil de líder', () => {
    it('atribuir curso a colaboradores → cria enrollment', async () => {
      const res = await request(app.getHttpServer())
        .post('/leaders/assign-course')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ userIds: [employeeId], courseId })
        .expect(201);
      expect(res.body.message).toContain('1/1');

      const enrollment = await prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId, userId: employeeId } },
      });
      expect(enrollment).toBeTruthy();
    });

    it('criar/actualizar perfil de líder (admin) — degrada com graça (modelo leaderProfile não existe)', async () => {
      const res = await request(app.getHttpServer())
        .post('/leaders/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: managerId, leadershipStyle: 'Coaching' })
        .expect(201);
      expect(res.body.userId).toBe(managerId);
    });
  });
});
