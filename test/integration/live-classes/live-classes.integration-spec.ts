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
  const extraLiveClassIds: number[] = [];

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
    if (extraLiveClassIds.length) {
      await prisma.liveClassSession
        .deleteMany({ where: { liveClassId: { in: extraLiveClassIds } } })
        .catch(() => undefined);
      await prisma.liveAttendance
        .deleteMany({ where: { liveClassId: { in: extraLiveClassIds } } })
        .catch(() => undefined);
      await prisma.liveClass
        .deleteMany({ where: { id: { in: extraLiveClassIds } } })
        .catch(() => undefined);
    }
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

  describe('Ações de ciclo de vida (secção 2)', () => {
    let actionClassId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/live-classes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          courseId,
          topic: 'Aula para ações',
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
          duration: 60,
        })
        .expect(201);
      actionClassId = res.body.id;
      extraLiveClassIds.push(actionClassId);
    });

    it('RH inicia a aula → EM_CURSO', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${actionClassId}/start`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('EM_CURSO');
    });

    it('RH adia a aula → ADIADA com nova data', async () => {
      const newDate = new Date(Date.now() + 7 * 24 * 3600000).toISOString();
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${actionClassId}/postpone`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ scheduledAt: newDate, reason: 'Conflito de agenda' })
        .expect(201);
      expect(res.body.status).toBe('ADIADA');
      expect(res.body.postponeReason).toBe('Conflito de agenda');
    });

    it('RH duplica a aula → nova aula AGENDADA', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${actionClassId}/duplicate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('AGENDADA');
      expect(res.body.id).not.toBe(actionClassId);
      extraLiveClassIds.push(res.body.id);
    });

    it('RH cancela a aula → CANCELADA com motivo', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${actionClassId}/cancel`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'Sem inscrições suficientes' })
        .expect(201);
      expect(res.body.status).toBe('CANCELADA');
      expect(res.body.cancellationReason).toBe('Sem inscrições suficientes');
    });

    it('colaborador não pode iniciar/adiar/cancelar/duplicar → 403', async () => {
      await request(app.getHttpServer())
        .post(`/live-classes/${actionClassId}/start`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Sessões (secção 5)', () => {
    let recurringClassId: number;
    let sessionId: number;

    it('RH cria aula recorrente semanal → gera sessões', async () => {
      const start = new Date(Date.now() + 24 * 3600000);
      const end = new Date(start.getTime() + 21 * 24 * 3600000);
      const res = await request(app.getHttpServer())
        .post('/live-classes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          courseId,
          topic: 'Turma recorrente',
          scheduledAt: start.toISOString(),
          duration: 60,
          recurrence: 'WEEKLY',
          recurrenceEndDate: end.toISOString(),
        })
        .expect(201);
      recurringClassId = res.body.id;
      extraLiveClassIds.push(recurringClassId);

      const sessions = await request(app.getHttpServer())
        .get(`/live-classes/${recurringClassId}/sessions`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(sessions.body.length).toBeGreaterThanOrEqual(3);
      expect(sessions.body[0].seq).toBe(1);
    });

    it('RH adiciona uma sessão extra manualmente → seq incremental', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${recurringClassId}/sessions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          sessionDate: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
          durationMinutes: 45,
        })
        .expect(201);
      sessionId = res.body.id;
      expect(res.body.seq).toBeGreaterThanOrEqual(4);
    });

    it('RH actualiza a sessão', async () => {
      const res = await request(app.getHttpServer())
        .put(`/live-classes/${recurringClassId}/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ notes: 'Sala trocada de última hora' })
        .expect(200);
      expect(res.body.notes).toBe('Sala trocada de última hora');
    });

    it('RH remove a sessão', async () => {
      await request(app.getHttpServer())
        .delete(`/live-classes/${recurringClassId}/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('GET /live-classes/sessions — lista global inclui as sessões geradas', async () => {
      const res = await request(app.getHttpServer())
        .get('/live-classes/sessions')
        .query({ courseId })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((s: any) => s.liveClass.id === recurringClassId)).toBe(true);
    });

    it('recurrence sem recurrenceEndDate → 400', async () => {
      await request(app.getHttpServer())
        .post('/live-classes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          courseId,
          topic: 'Turma sem fim',
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
          duration: 60,
          recurrence: 'DAILY',
        })
        .expect(400);
    });
  });

  describe('Visão Geral e Calendário (secções 1 e 4)', () => {
    it('GET /live-classes/dashboard — cards agregados', async () => {
      const res = await request(app.getHttpServer())
        .get('/live-classes/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.cards).toBeDefined();
      expect(typeof res.body.cards.scheduled).toBe('number');
    });

    it('GET /live-classes/calendar — inclui a aula e as sessões no intervalo', async () => {
      const from = new Date(Date.now() - 24 * 3600000).toISOString();
      const to = new Date(Date.now() + 60 * 24 * 3600000).toISOString();
      const res = await request(app.getHttpServer())
        .get('/live-classes/calendar')
        .query({ from, to })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((e: any) => e.liveClassId === liveClassId)).toBe(true);
    });
  });

  describe('Participantes/Formadores/Salas/Gravações/Presenças (secções 6-10)', () => {
    let sectionClassId: number;
    let sectionSessionId: number;
    let attendanceId: number;
    let instructorProfileId: number;

    beforeAll(async () => {
      const instructor = await prisma.trainingInstructorProfile.create({
        data: { type: 'INTERNAL', name: 'Formador Integração 6-10', status: 'ACTIVE' },
      });
      instructorProfileId = instructor.id;

      const res = await request(app.getHttpServer())
        .post('/live-classes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          courseId,
          topic: 'Aula secções 6-10',
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
          duration: 60,
          instructorId: instructorProfileId,
          modality: 'ONLINE',
          zoomMeetingId: 'zoom-int-test-123',
          recurrence: 'WEEKLY',
          recurrenceEndDate: new Date(Date.now() + 14 * 24 * 3600000).toISOString(),
        })
        .expect(201);
      sectionClassId = res.body.id;
      extraLiveClassIds.push(sectionClassId);

      const sessions = await request(app.getHttpServer())
        .get(`/live-classes/${sectionClassId}/sessions`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      sectionSessionId = sessions.body[0].id;
    });

    afterAll(async () => {
      await prisma.trainingInstructorProfile
        .delete({ where: { id: instructorProfileId } })
        .catch(() => undefined);
    });

    it('RH adiciona um participante manualmente (secção 6 — "Adicionar")', async () => {
      const res = await request(app.getHttpServer())
        .post(`/live-classes/${sectionClassId}/attendance`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, sessionId: sectionSessionId })
        .expect(201);
      attendanceId = res.body.id;
      expect(res.body.sessionId).toBe(sectionSessionId);
    });

    it('colaborador não pode adicionar participantes → 403', async () => {
      await request(app.getHttpServer())
        .post(`/live-classes/${sectionClassId}/attendance`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId })
        .expect(403);
    });

    it('GET /live-classes/participants — inclui o participante com dados de departamento/curso/sessão', async () => {
      const res = await request(app.getHttpServer())
        .get('/live-classes/participants')
        .query({ liveClassId: sectionClassId })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const row = res.body.data.find((p: any) => p.id === attendanceId);
      expect(row).toBeDefined();
      expect(row.session.id).toBe(sectionSessionId);
      expect(row.liveClass.course).toBeDefined();
      expect(row.computedStatus).toBe('AUSENTE');
    });

    it('RH regista presença (entrada/saída) → estado calculado a partir da duração', async () => {
      const joinedAt = new Date();
      const leftAt = new Date(joinedAt.getTime() + 60 * 60000);
      const res = await request(app.getHttpServer())
        .put(`/live-classes/${sectionClassId}/attendance/${attendanceId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ joinedAt: joinedAt.toISOString(), leftAt: leftAt.toISOString() })
        .expect(200);
      expect(res.body.computedStatus).toBe('PRESENTE');
      expect(res.body.attendancePercent).toBe(100);
    });

    it('RH justifica uma ausência → estado JUSTIFICADO com motivo', async () => {
      const res = await request(app.getHttpServer())
        .put(`/live-classes/${sectionClassId}/attendance/${attendanceId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'JUSTIFICADO', justification: 'Falha de rede' })
        .expect(200);
      expect(res.body.computedStatus).toBe('JUSTIFICADO');
      expect(res.body.justification).toBe('Falha de rede');
    });

    it('GET /live-classes/instructors — inclui o formador com estatísticas da aula', async () => {
      const res = await request(app.getHttpServer())
        .get('/live-classes/instructors')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const row = res.body.find((i: any) => i.id === instructorProfileId);
      expect(row).toBeDefined();
      expect(row.liveClassStats.scheduled).toBeGreaterThanOrEqual(1);
    });

    it('GET /live-classes/virtual-rooms — inclui a sala Zoom da aula', async () => {
      const res = await request(app.getHttpServer())
        .get('/live-classes/virtual-rooms')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const row = res.body.data.find((r: any) => r.liveClassId === sectionClassId);
      expect(row).toBeDefined();
      expect(row.platform).toBe('Zoom');
      expect(row.meetingId).toBe('zoom-int-test-123');
    });

    it('gravação: publicar → aparece em GET /recordings publicada; despublicar → deixa de o estar', async () => {
      await request(app.getHttpServer())
        .put(`/live-classes/${sectionClassId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ recordingUrl: 'https://example.com/rec.mp4' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/live-classes/${sectionClassId}/recording/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);

      let res = await request(app.getHttpServer())
        .get('/live-classes/recordings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      let row = res.body.data.find((r: any) => r.liveClassId === sectionClassId);
      expect(row.publishedAt).toBeTruthy();

      await request(app.getHttpServer())
        .post(`/live-classes/${sectionClassId}/recording/unpublish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);

      res = await request(app.getHttpServer())
        .get('/live-classes/recordings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      row = res.body.data.find((r: any) => r.liveClassId === sectionClassId);
      expect(row.publishedAt).toBeFalsy();
    });

    it('colaborador não pode publicar gravações → 403', async () => {
      await request(app.getHttpServer())
        .post(`/live-classes/${sectionClassId}/recording/publish`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH remove o participante (secção 6 — "Remover")', async () => {
      await request(app.getHttpServer())
        .delete(`/live-classes/${sectionClassId}/attendance/${attendanceId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/live-classes/participants')
        .query({ liveClassId: sectionClassId })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.find((p: any) => p.id === attendanceId)).toBeUndefined();
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
