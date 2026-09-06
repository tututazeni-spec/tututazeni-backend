import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Leadership Integration', () => {
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

  let mandatoryProgramId: number;
  let normalProgramId: number;
  let oneOnOneId: number;
  let mentoringId: number;
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

    await prisma.user.update({ where: { id: employeeId }, data: { managerId } });
  });

  afterAll(async () => {
    await prisma.user.update({
      where: { id: employeeId },
      data: { managerId: originalEmployeeManagerId },
    });

    if (oneOnOneId)
      // Fase G4: /leadership/1on1 grava agora em OneOnOneMeeting.
      await prisma.oneOnOneMeeting.deleteMany({ where: { id: oneOnOneId } }).catch(() => undefined);
    if (mentoringId) {
      await prisma.mentoringSession.deleteMany({ where: { mentoringId } }).catch(() => undefined);
      await prisma.mentoring.deleteMany({ where: { id: mentoringId } }).catch(() => undefined);
    }
    await prisma.kudos
      .deleteMany({ where: { senderId: managerId, receiverId: employeeId } })
      .catch(() => undefined);
    await prisma.leadershipPulse
      .deleteMany({ where: { leaderId: managerId } })
      .catch(() => undefined);
    await prisma.leadershipFeedback360
      .deleteMany({ where: { leaderId: managerId } })
      .catch(() => undefined);
    await prisma.leadershipScore
      .deleteMany({ where: { userId: { in: [managerId, employeeId] } } })
      .catch(() => undefined);
    await prisma.teamHealth.deleteMany({ where: { managerId } }).catch(() => undefined);

    const programIds = [mandatoryProgramId, normalProgramId].filter(Boolean);
    if (programIds.length) {
      await prisma.certificate
        .deleteMany({ where: { programId: { in: programIds } } })
        .catch(() => undefined);
      await prisma.leadershipParticipant
        .deleteMany({ where: { programId: { in: programIds } } })
        .catch(() => undefined);
      await prisma.leadershipProgram
        .deleteMany({ where: { id: { in: programIds } } })
        .catch(() => undefined);
    }
    await prisma.userPoints.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    await prisma.notificationLog
      .deleteMany({ where: { userId: { in: [employeeId, managerId] } } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Programas', () => {
    it('colaborador não pode criar programa → 403', async () => {
      await request(app.getHttpServer())
        .post('/leadership/programs')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', level: 'INITIAL' })
        .expect(403);
    });

    it('RH cria programa obrigatório → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/leadership/programs')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Programa Obrigatório', level: 'INITIAL', mandatory: true })
        .expect(201);
      mandatoryProgramId = res.body.id;
    });

    it('RH cria segundo programa não-obrigatório → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/leadership/programs')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Programa Normal', level: 'ADVANCED', mandatory: false })
        .expect(201);
      normalProgramId = res.body.id;
    });

    it('?mandatory=true — inclui só o obrigatório (bug: coerção de booleano)', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/programs')
        .query({ mandatory: 'true' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === mandatoryProgramId)).toBe(true);
      expect(res.body.data.some((p: any) => p.id === normalProgramId)).toBe(false);
    });

    it('?mandatory=false — NÃO deve incluir o obrigatório', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/programs')
        .query({ mandatory: 'false' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === mandatoryProgramId)).toBe(false);
      expect(res.body.data.some((p: any) => p.id === normalProgramId)).toBe(true);
    });

    it('GET /leadership/programs/:id/stats — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/leadership/programs/${normalProgramId}/stats`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.total).toBe(0);
    });
  });

  describe('Inscrição e progresso (bug: certificado/XP duplicados em re-submissões)', () => {
    it('colaborador auto-inscreve-se no programa normal → 201', async () => {
      await request(app.getHttpServer())
        .post(`/leadership/programs/${normalProgramId}/self-enroll`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
    });

    it('reinscrição → 409', async () => {
      await request(app.getHttpServer())
        .post(`/leadership/programs/${normalProgramId}/self-enroll`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);
    });

    it('RH marca progresso 100% → emite 1 certificado e atribui 300 XP', async () => {
      // UserPoints.points é um total acumulado partilhado entre módulos — usar o
      // delta em vez de um valor absoluto, para não depender de quantos pontos o
      // utilizador de teste já tinha de outros specs (não isolado entre módulos
      // quando a suite corre em conjunto).
      const before = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      const pointsBefore = before?.points ?? 0;

      await request(app.getHttpServer())
        .patch(`/leadership/programs/${normalProgramId}/participants/${employeeId}/progress`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ progress: 100 })
        .expect(200);

      const certs = await prisma.certificate.findMany({
        where: { userId: employeeId, programId: normalProgramId },
      });
      expect(certs.length).toBe(1);

      const points = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      expect(points!.points - pointsBefore).toBe(300);
    });

    it('RH repete a actualização com progress:100 → NÃO duplica certificado nem XP', async () => {
      const before = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      const pointsBefore = before?.points ?? 0;

      await request(app.getHttpServer())
        .patch(`/leadership/programs/${normalProgramId}/participants/${employeeId}/progress`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ progress: 100 })
        .expect(200);

      const certs = await prisma.certificate.findMany({
        where: { userId: employeeId, programId: normalProgramId },
      });
      expect(certs.length).toBe(1);

      const points = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      expect(points!.points - pointsBefore).toBe(0);
    });

    it('GET /leadership/programs/my — reflecte a inscrição', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/programs/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((p: any) => p.program.id === normalProgramId)).toBe(true);
    });

    it('colaborador abandona o programa obrigatório (nunca chegou a inscrever-se) → 404', async () => {
      await request(app.getHttpServer())
        .patch(`/leadership/programs/${mandatoryProgramId}/withdraw`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('programa com participantes não pode ser eliminado → 400', async () => {
      await request(app.getHttpServer())
        .delete(`/leadership/programs/${normalProgramId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('Team Dashboard e Team Health', () => {
    it('colaborador não acede ao team dashboard → 403', async () => {
      await request(app.getHttpServer())
        .get('/leadership/team/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor vê o team dashboard com o colaborador subordinado', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/team/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.team.some((t: any) => t.user.id === employeeId)).toBe(true);
    });

    it('gestor actualiza team health → reflecte no health status', async () => {
      const res = await request(app.getHttpServer())
        .patch('/leadership/team/health')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ engagementScore: 80, turnoverRate: 5, absenteeismRate: 2 })
        .expect(200);
      expect(res.body.engagementScore).toBe(80);
    });

    it('GET /leadership/team/health — reflecte globalScore calculado', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/team/health')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.globalScore).toBeGreaterThan(0);
    });
  });

  describe('1:1 (Fase G4 — grava em OneOnOneMeeting, contrato managerId/subordinateId preservado)', () => {
    it('gestor agenda 1:1 com o subordinado → 201, forma managerId/subordinateId', async () => {
      const res = await request(app.getHttpServer())
        .post('/leadership/1on1')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          subordinateId: employeeId,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(201);
      oneOnOneId = res.body.id;
      expect(res.body.managerId).toBe(managerId);
      expect(res.body.subordinateId).toBe(employeeId);

      // persiste em OneOnOneMeeting (host/participant), não no modelo legado
      const row = await prisma.oneOnOneMeeting.findUnique({ where: { id: oneOnOneId } });
      expect(row).toBeTruthy();
      expect(row!.hostId).toBe(managerId);
      expect(row!.participantId).toBe(employeeId);
    });

    it('GET /leadership/1on1 — lista o agendado com a forma leadership', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/1on1')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const mine = res.body.find((m: any) => m.id === oneOnOneId);
      expect(mine).toBeTruthy();
      expect(mine.subordinateId).toBe(employeeId);
    });

    it('concluir 1:1 → grava minutes/status', async () => {
      const res = await request(app.getHttpServer())
        .patch('/leadership/1on1/complete')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ oneOnOneId, minutes: 'Discutimos objectivos.' })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');

      const row = await prisma.oneOnOneMeeting.findUnique({ where: { id: oneOnOneId } });
      expect(row!.status).toBe('COMPLETED');
      expect(row!.minutes).toBe('Discutimos objectivos.');
    });
  });

  describe('Feedback 360°, Pulse e ownership do sumário', () => {
    it('colaborador submete feedback 360° sobre o gestor → 201', async () => {
      await request(app.getHttpServer())
        .post('/leadership/feedback-360')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaderId: managerId,
          responses: [
            { competency: 'COMMUNICATION', score: 4 },
            { competency: 'FAIRNESS', score: 5 },
          ],
          qualitativeFeedback: 'Bom líder',
        })
        .expect(201);
    });

    it('gestor vê o próprio sumário 360°', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/feedback-360/my/summary')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.totalResponses).toBe(1);
      expect(res.body.avgScore).toBeGreaterThan(0);
    });

    it('gestor não pode ver sumário 360° de outro líder → 404', async () => {
      await request(app.getHttpServer())
        .get(`/leadership/feedback-360/${adminId}/summary`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });

    it('admin pode ver sumário 360° de qualquer líder', async () => {
      await request(app.getHttpServer())
        .get(`/leadership/feedback-360/${managerId}/summary`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('colaborador submete pulse survey mensal sobre o gestor → 201', async () => {
      await request(app.getHttpServer())
        .post('/leadership/pulse')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ leaderId: managerId, overallScore: 5, q1: 'Tudo bem' })
        .expect(201);
    });

    it('repetir pulse no mesmo mês/ano → 409 (unique [leaderId,respondentId,month,year])', async () => {
      await request(app.getHttpServer())
        .post('/leadership/pulse')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ leaderId: managerId, overallScore: 3 })
        .expect(409);
    });
  });

  describe('Mentoring', () => {
    it('RH cria relação de mentoring → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/leadership/mentoring')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ mentorId: managerId, menteeId: employeeId, objective: 'Crescimento técnico' })
        .expect(201);
      mentoringId = res.body.id;
    });

    it('mentor regista sessão de mentoring → 201', async () => {
      await request(app.getHttpServer())
        .post('/leadership/mentoring/session')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          mentoringId,
          sessionDate: new Date().toISOString(),
          summary: 'Primeira sessão',
          rating: 5,
        })
        .expect(201);
    });

    it('mentorado vê as suas relações de mentoring', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/mentoring/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.asMentee.some((m: any) => m.id === mentoringId)).toBe(true);
    });

    it('utilizador fora da relação não pode registar sessão → 404', async () => {
      await request(app.getHttpServer())
        .post('/leadership/mentoring/session')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          mentoringId,
          sessionDate: new Date().toISOString(),
          summary: 'Não deveria funcionar',
        })
        .expect(404);
    });
  });

  describe('Kudos', () => {
    it('não pode dar kudos a si próprio → 400', async () => {
      await request(app.getHttpServer())
        .post('/leadership/kudos')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ receiverId: managerId, message: 'Eu mesmo' })
        .expect(400);
    });

    it('gestor dá kudos ao colaborador → 201', async () => {
      await request(app.getHttpServer())
        .post('/leadership/kudos')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ receiverId: employeeId, message: 'Óptimo trabalho esta semana!' })
        .expect(201);
    });

    it('GET /leadership/kudos?userId — filtra pelo destinatário', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/kudos')
        .query({ userId: employeeId })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.every((k: any) => k.receiver.id === employeeId)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Leadership Score e Ranking', () => {
    it('recalcular score do gestor (admin) → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/leadership/score/${managerId}/recalc`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.leaderId).toBe(managerId);
      expect(typeof res.body.score).toBe('number');
    });

    it('gestor vê o seu próprio score', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/score/my')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.userId).toBe(managerId);
    });

    it('GET /leadership/ranking — inclui o gestor', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/ranking')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.userId === managerId)).toBe(true);
    });

    it('GET /leadership/my/dashboard (gestor) — agrega score, programas, mentoring, 1:1s, kudos', async () => {
      const res = await request(app.getHttpServer())
        .get('/leadership/my/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.score.userId).toBe(managerId);
      expect(Array.isArray(res.body.recentKudos)).toBe(true);
    });
  });
});
