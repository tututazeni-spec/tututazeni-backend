import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { getToken } from '../helpers/auth.helper';
import { bootApp, cleanupScope, makeExternal, TestExternal } from './scope.helper';

const TOPIC = 'ScopeAula ';

describe('Instrutor externo — aulas ao vivo', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let A: TestExternal;
  let B: TestExternal;
  let C: TestExternal; // externo sem perfil nem aulas
  let profA: number;
  let profB: number;
  let employeeId: number;
  const lc: Record<string, number> = {};
  const ses: Record<string, number> = {};
  const att: Record<string, number> = {};

  const api = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const when = (days: number) => new Date(Date.now() + days * 86_400_000);
  const listOf = (body: unknown): Array<{ id: number }> =>
    (Array.isArray(body) ? body : ((body as { data?: unknown[] }).data ?? [])) as Array<{
      id: number;
    }>;
  const ids = (body: unknown): number[] => listOf(body).map(x => x.id);

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    adminToken = await getToken(app.getHttpServer(), 'admin');
    A = await makeExternal(app, prisma, 'la');
    B = await makeExternal(app, prisma, 'lb');
    C = await makeExternal(app, prisma, 'lc');
    profA = (
      await prisma.trainingInstructorProfile.create({
        data: { type: 'EXTERNAL', userId: A.id, name: 'Externo A' },
      })
    ).id;
    profB = (
      await prisma.trainingInstructorProfile.create({
        data: { type: 'EXTERNAL', userId: B.id, name: 'Externo B' },
      })
    ).id;
    employeeId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'int.employee@innova-test.com' } })
    ).id;
    const mk = (key: string, instructorId: number | null) =>
      prisma.liveClass.create({
        data: {
          topic: `${TOPIC}${key}`,
          scheduledAt: when(3),
          duration: 60,
          ...(instructorId ? { instructorId } : {}),
          recordingUrl: 'https://exemplo.pt/gravacao.mp4',
          status: 'AGENDADA',
        },
        select: { id: true },
      });
    lc.A = (await mk('A', profA)).id;
    lc.B = (await mk('B', profB)).id;
    lc.Co = (await mk('Empresa', null)).id;
    ses.A = (
      await prisma.liveClassSession.create({
        data: { liveClassId: lc.A, seq: 1, sessionDate: when(3), durationMinutes: 60 },
      })
    ).id;
    ses.B = (
      await prisma.liveClassSession.create({
        data: { liveClassId: lc.B, seq: 1, sessionDate: when(3), durationMinutes: 60 },
      })
    ).id;
    att.A = (
      await prisma.liveAttendance.create({ data: { liveClassId: lc.A, userId: employeeId } })
    ).id;
    att.B = (
      await prisma.liveAttendance.create({ data: { liveClassId: lc.B, userId: employeeId } })
    ).id;
    // avaliações pós-aula: A recebe 5 estrelas, B recebe 1
    const evalA = await prisma.postClassEvaluation.create({
      data: { liveClassId: lc.A, averageScore: 5 },
    });
    const evalB = await prisma.postClassEvaluation.create({
      data: { liveClassId: lc.B, averageScore: 1 },
    });
    await prisma.postClassResponse.create({
      data: {
        evaluationId: evalA.id,
        userId: employeeId,
        rating: 5,
        feedback: 'Excelente aula de A',
      },
    });
    await prisma.postClassResponse.create({
      data: { evaluationId: evalB.id, userId: employeeId, rating: 1, feedback: 'Aula fraca de B' },
    });
  }, 120_000);

  afterAll(async () => {
    await cleanupScope(prisma, TOPIC);
    await app.close();
  });

  describe('listagens: só as suas, mesmo com filtros do cliente', () => {
    it('GET /live-classes', async () => {
      const res = await api().get('/live-classes?limit=100').set(as(A.token)).expect(200);
      expect(ids(res.body)).toEqual([lc.A]);
      // instructorId do cliente não alarga o âmbito
      const hack = await api()
        .get(`/live-classes?limit=100&instructorId=${profB}`)
        .set(as(A.token))
        .expect(200);
      expect(ids(hack.body)).toEqual([]);
    });

    it('um externo sem perfil nem aulas vê tudo vazio', async () => {
      for (const path of [
        '/live-classes?limit=100',
        '/live-classes/sessions?limit=100',
        '/live-classes/virtual-rooms?limit=100',
      ]) {
        const res = await api().get(path).set(as(C.token)).expect(200);
        expect(listOf(res.body)).toHaveLength(0);
      }
      const upcoming = await api().get('/live-classes/upcoming').set(as(C.token)).expect(200);
      expect(upcoming.body).toHaveLength(0);
      const rec = await api().get('/live-classes/recordings').set(as(C.token)).expect(200);
      expect(JSON.stringify(rec.body)).not.toContain(TOPIC);
    });

    it('upcoming, sessions, recordings, virtual-rooms e calendar só trazem as suas', async () => {
      const up = await api().get('/live-classes/upcoming').set(as(A.token)).expect(200);
      expect(ids(up.body)).toEqual([lc.A]);

      const sess = await api().get('/live-classes/sessions?limit=100').set(as(A.token)).expect(200);
      expect(ids(sess.body)).toEqual([ses.A]);

      const rec = await api().get('/live-classes/recordings').set(as(A.token)).expect(200);
      const recText = JSON.stringify(rec.body);
      expect(recText).toContain(`${TOPIC}A`);
      expect(recText).not.toContain(`${TOPIC}B`);
      expect(recText).not.toContain(`${TOPIC}Empresa`);

      const rooms = await api()
        .get('/live-classes/virtual-rooms?limit=100')
        .set(as(A.token))
        .expect(200);
      expect(listOf(rooms.body)).toHaveLength(1);
      const roomsText = JSON.stringify(rooms.body);
      expect(roomsText).toContain(`${TOPIC}A`);
      expect(roomsText).not.toContain(`${TOPIC}B`);

      const from = new Date(Date.now() - 86_400_000).toISOString();
      const to = when(30).toISOString();
      const cal = await api()
        .get(`/live-classes/calendar?from=${from}&to=${to}`)
        .set(as(A.token))
        .expect(200);
      const calText = JSON.stringify(cal.body);
      expect(calText).toContain(`${TOPIC}A`);
      expect(calText).not.toContain(`${TOPIC}B`);
      expect(calText).not.toContain(`${TOPIC}Empresa`);
    });

    it('participantes: só os das suas aulas e sem dados de contacto', async () => {
      const res = await api()
        .get('/live-classes/participants?limit=100')
        .set(as(A.token))
        .expect(200);
      const rows = res.body.data as Array<{ liveClassId: number; user: Record<string, unknown> }>;
      expect(rows.map(r => r.liveClassId)).toEqual([lc.A]);
      expect(rows[0].user.fullName).toBeDefined();
      expect(rows[0].user.email).toBeUndefined();
      expect(rows[0].user.department).toBeUndefined();
    });

    it('instrutores: só ele próprio', async () => {
      const res = await api().get('/live-classes/instructors').set(as(A.token)).expect(200);
      const text = JSON.stringify(res.body);
      expect(text).toContain(String(profA));
      expect(text).not.toContain(`"instructorId":${profB}`);
    });

    it('dashboard conta só as suas aulas', async () => {
      const res = await api().get('/live-classes/dashboard').set(as(A.token)).expect(200);
      expect(res.body.cards.scheduled).toBe(1);
      const none = await api().get('/live-classes/dashboard').set(as(C.token)).expect(200);
      expect(none.body.cards.scheduled).toBe(0);
    });
  });

  describe('por id: a aula de outro é 404', () => {
    it('leitura', async () => {
      await api().get(`/live-classes/${lc.A}`).set(as(A.token)).expect(200);
      for (const id of [lc.B, lc.Co]) {
        await api().get(`/live-classes/${id}`).set(as(A.token)).expect(404);
        await api().get(`/live-classes/${id}/room`).set(as(A.token)).expect(404);
        await api().get(`/live-classes/${id}/messages`).set(as(A.token)).expect(404);
        await api().get(`/live-classes/${id}/sessions`).set(as(A.token)).expect(404);
        await api().get(`/live-classes/${id}/attendance-report`).set(as(A.token)).expect(404);
      }
    });

    it('relatório de presenças da sua aula: nome sem email', async () => {
      const res = await api()
        .get(`/live-classes/${lc.A}/attendance-report`)
        .set(as(A.token))
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].user.fullName).toBeDefined();
      expect(res.body[0].user.email).toBeUndefined();
    });

    it('edição, cancelamento e início', async () => {
      await api()
        .put(`/live-classes/${lc.A}`)
        .set(as(A.token))
        .send({ topic: `${TOPIC}A editada` })
        .expect(200);
      await api().put(`/live-classes/${lc.B}`).set(as(A.token)).send({ topic: 'hack' }).expect(404);
      await api()
        .post(`/live-classes/${lc.B}/cancel`)
        .set(as(A.token))
        .send({ reason: 'x' })
        .expect(404);
      await api().post(`/live-classes/${lc.B}/start`).set(as(A.token)).expect(404);
      const intacta = await prisma.liveClass.findUnique({ where: { id: lc.B } });
      expect(intacta?.status).toBe('AGENDADA');
      expect(intacta?.topic).toBe(`${TOPIC}B`);
    });

    it('sessões: cria na sua; não toca nas de outras aulas, nem usa o id da sua para chegar à alheia', async () => {
      await api()
        .post(`/live-classes/${lc.A}/sessions`)
        .set(as(A.token))
        .send({ sessionDate: when(5).toISOString(), durationMinutes: 45 })
        .expect(201);
      await api()
        .post(`/live-classes/${lc.B}/sessions`)
        .set(as(A.token))
        .send({ sessionDate: when(5).toISOString(), durationMinutes: 45 })
        .expect(404);
      // aula própria + sessão alheia
      await api()
        .put(`/live-classes/${lc.A}/sessions/${ses.B}`)
        .set(as(A.token))
        .send({ notes: 'hack' })
        .expect(404);
      await api()
        .put(`/live-classes/${lc.A}/sessions/${ses.A}`)
        .set(as(A.token))
        .send({ notes: 'ok' })
        .expect(200);
    });

    it('participantes: adiciona na sua aula; presença alheia via aula própria → 404', async () => {
      const manager = await prisma.user.findUniqueOrThrow({
        where: { email: 'int.manager@innova-test.com' },
      });
      await api()
        .post(`/live-classes/${lc.A}/attendance`)
        .set(as(A.token))
        .send({ userId: manager.id })
        .expect(201);
      await api()
        .post(`/live-classes/${lc.B}/attendance`)
        .set(as(A.token))
        .send({ userId: manager.id })
        .expect(404);
      await api()
        .put(`/live-classes/${lc.A}/attendance/${att.B}`)
        .set(as(A.token))
        .send({ status: 'PRESENTE' })
        .expect(404);
      await api().delete(`/live-classes/${lc.A}/attendance/${att.B}`).set(as(A.token)).expect(404);
    });

    it('presenças em massa: só indicando utilizadores; departamentos e "todos" são recusados', async () => {
      await api()
        .post(`/live-classes/${lc.A}/attendance/bulk`)
        .set(as(A.token))
        .send({ all: true })
        .expect(403);
      await api()
        .post(`/live-classes/${lc.A}/attendance/bulk`)
        .set(as(A.token))
        .send({ departmentIds: [1] })
        .expect(403);
      await api()
        .post(`/live-classes/${lc.A}/attendance/bulk`)
        .set(as(A.token))
        .send({ userIds: [employeeId] })
        .expect(201);
    });
  });

  describe('avaliações e relatórios: só os das suas aulas', () => {
    it('avaliações (feedback) e o resumo', async () => {
      const list = await api()
        .get('/live-classes/evaluations?limit=100')
        .set(as(A.token))
        .expect(200);
      const text = JSON.stringify(list.body);
      expect(text).toContain('Excelente aula de A');
      expect(text).not.toContain('Aula fraca de B');

      const sum = await api().get('/live-classes/evaluations/summary').set(as(A.token)).expect(200);
      expect(sum.body.responses).toBe(1);
      expect(sum.body.avgRating).toBe(5);

      const none = await api()
        .get('/live-classes/evaluations/summary')
        .set(as(C.token))
        .expect(200);
      expect(none.body.responses).toBe(0);
    });

    it('o filtro liveClassId de uma aula alheia não devolve nada', async () => {
      const res = await api()
        .get(`/live-classes/evaluations?liveClassId=${lc.B}&limit=100`)
        .set(as(A.token))
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('Aula fraca de B');
    });

    it('relatório geral e exportação só contam as suas aulas', async () => {
      const rep = await api().get('/live-classes/reports/overview').set(as(A.token)).expect(200);
      expect(rep.body.totals.classes).toBe(1);
      // só os participantes da aula A (outros testes acrescentam presenças à A, nunca à B)
      expect(rep.body.attendance.participants).toBe(
        await prisma.liveAttendance.count({ where: { liveClassId: lc.A } }),
      );
      const csv = await api().get('/live-classes/reports/export').set(as(A.token)).expect(200);
      expect(csv.text).toContain('Aulas (total)');
      const none = await api().get('/live-classes/reports/overview').set(as(C.token)).expect(200);
      expect(none.body.totals.classes).toBe(0);
    });

    it('o relatório de outro instrutor não se obtém filtrando por ele', async () => {
      const res = await api()
        .get(`/live-classes/reports/overview?instructorId=${profB}`)
        .set(as(A.token))
        .expect(200);
      expect(res.body.totals.classes).toBe(0);
    });
  });

  describe('criar aula', () => {
    it('é sempre dele: o instrutor e o co-instrutor vindos do cliente são ignorados', async () => {
      const res = await api()
        .post('/live-classes')
        .set(as(A.token))
        .send({
          topic: `${TOPIC}Nova`,
          scheduledAt: when(10).toISOString(),
          duration: 90,
          instructorId: profB,
          coInstructorId: profB,
        })
        .expect(201);
      const row = await prisma.liveClass.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.instructorId).toBe(profA);
      expect(row.coInstructorId).toBeNull();
    });

    it('o primeiro uso cria o perfil de instrutor externo', async () => {
      expect(
        await prisma.trainingInstructorProfile.findUnique({ where: { userId: C.id } }),
      ).toBeNull();
      await api()
        .post('/live-classes')
        .set(as(C.token))
        .send({ topic: `${TOPIC}Primeira`, scheduledAt: when(10).toISOString(), duration: 30 })
        .expect(201);
      const profile = await prisma.trainingInstructorProfile.findUnique({
        where: { userId: C.id },
      });
      expect(profile?.type).toBe('EXTERNAL');
    });

    it('um curso que não é seu → 404', async () => {
      const course = await prisma.course.create({
        data: {
          title: `${TOPIC}Curso`,
          internalCode: `SCOPEL-${Date.now()}`,
          description: 't',
          status: 'PUBLISHED',
        },
        select: { id: true },
      });
      await api()
        .post('/live-classes')
        .set(as(A.token))
        .send({
          topic: `${TOPIC}X`,
          scheduledAt: when(10).toISOString(),
          duration: 30,
          courseId: course.id,
        })
        .expect(404);
    });
  });

  describe('o que continua fechado', () => {
    it('apagar, duplicar, definições, publicar gravação e avaliação pós-aula', async () => {
      await api().delete(`/live-classes/${lc.A}`).set(as(A.token)).expect(403);
      await api().post(`/live-classes/${lc.A}/duplicate`).set(as(A.token)).expect(403);
      await api().get('/live-classes/settings').set(as(A.token)).expect(403);
      await api().post(`/live-classes/${lc.A}/recording/publish`).set(as(A.token)).expect(403);
      await api().post(`/live-classes/${lc.A}/recording/unpublish`).set(as(A.token)).expect(403);
      await api()
        .post(`/live-classes/${lc.A}/post-evaluation`)
        .set(as(A.token))
        .send({})
        .expect(403);
    });
  });

  describe('os outros papéis não mudam', () => {
    it('ADMIN continua a ver todas as aulas e a gerir qualquer uma', async () => {
      const res = await api().get('/live-classes?limit=100').set(as(adminToken)).expect(200);
      expect(ids(res.body)).toEqual(expect.arrayContaining([lc.A, lc.B, lc.Co]));
      await api().get(`/live-classes/${lc.B}`).set(as(adminToken)).expect(200);
      await api()
        .put(`/live-classes/${lc.B}`)
        .set(as(adminToken))
        .send({ topic: `${TOPIC}B` })
        .expect(200);
    });
  });
});
