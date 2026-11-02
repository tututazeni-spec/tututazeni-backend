import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { getToken } from '../helpers/auth.helper';
import { bootApp, cleanupScope, makeExternal, TestExternal } from './scope.helper';

const TITLE = 'ScopeHard ';

// Cada teste tenta uma exploração concreta: um campo do CORPO que aponta para fora do âmbito do
// externo (o id da rota é dele, o que vai no corpo não). Verifica-se o estado na BD, não só o código HTTP.
describe('Instrutor externo — campos do corpo que apontam para fora do âmbito', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let A: TestExternal;
  let B: TestExternal;
  let profA: number;
  let profB: number;
  let employeeId: number;
  let adminId: number;
  const c: Record<string, number> = {};
  const m: Record<string, number> = {};
  const l: Record<string, number> = {};
  const lc: Record<string, number> = {};
  const h: Record<string, number> = {};
  let foreignDocId: number;
  let competencyId: number;

  const api = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const when = (days: number) => new Date(Date.now() + days * 86_400_000);

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    adminToken = await getToken(app.getHttpServer(), 'admin');
    A = await makeExternal(app, prisma, 'ha');
    B = await makeExternal(app, prisma, 'hb');
    const emp = await prisma.user.findUniqueOrThrow({
      where: { email: 'int.employee@innova-test.com' },
    });
    const adm = await prisma.user.findUniqueOrThrow({
      where: { email: 'int.admin@innova-test.com' },
    });
    employeeId = emp.id;
    adminId = adm.id;
    profA = (
      await prisma.trainingInstructorProfile.create({
        data: { type: 'EXTERNAL', userId: A.id, name: 'HA' },
      })
    ).id;
    profB = (
      await prisma.trainingInstructorProfile.create({
        data: { type: 'EXTERNAL', userId: B.id, name: 'HB' },
      })
    ).id;

    const mkCourse = (key: string, primary: number) =>
      prisma.course.create({
        data: {
          title: `${TITLE}${key}`,
          internalCode: `SCOPEH-${key}-${Date.now()}`,
          description: 't',
          status: 'PUBLISHED',
          primaryInstructorId: primary,
        },
        select: { id: true },
      });
    c.A = (await mkCourse('A', A.id)).id;
    c.B = (await mkCourse('B', B.id)).id;
    const mkMod = (courseId: number, title: string, seq: number) =>
      prisma.courseModule.create({ data: { courseId, title, seq }, select: { id: true } });
    const mkLes = (moduleId: number, title: string, seq: number) =>
      prisma.lesson.create({
        data: { moduleId, title, seq, type: 'TEXT', textContent: 'x' },
        select: { id: true },
      });
    m.A = (await mkMod(c.A, 'Mod A', 1)).id;
    m.A2 = (await mkMod(c.A, 'Mod A2', 2)).id;
    m.B = (await mkMod(c.B, 'Mod B', 1)).id;
    l.A = (await mkLes(m.A, 'Les A', 1)).id;
    l.A2 = (await mkLes(m.A, 'Les A2', 2)).id;
    l.B = (await mkLes(m.B, 'Les B', 1)).id;
    l.B2 = (await mkLes(m.B, 'Les B2', 2)).id;

    const mkLc = (key: string, instructorId: number) =>
      prisma.liveClass.create({
        data: {
          topic: `${TITLE}${key}`,
          scheduledAt: when(3),
          duration: 60,
          instructorId,
          recordingUrl: `https://exemplo.pt/${key}.mp4`,
          recordingPublishedAt: new Date(),
        },
        select: { id: true },
      });
    lc.A = (await mkLc('LA', profA)).id;
    lc.B = (await mkLc('LB', profB)).id;
    lc.ASession = (
      await prisma.liveClassSession.create({
        data: {
          liveClassId: lc.A,
          seq: 1,
          sessionDate: when(3),
          durationMinutes: 30,
          recordingUrl: 'https://exemplo.pt/s.mp4',
        },
      })
    ).id;

    // documento confidencial da empresa, criado por outro utilizador
    foreignDocId = (
      await prisma.document.create({
        data: {
          title: `${TITLE}Doc confidencial`,
          category: 'COMPLIANCE',
          sensitivity: 'CONFIDENTIAL',
          fileUrl: 'data:text/plain;base64,U0VDUkVUTw==',
          mimeType: 'text/plain',
          createdById: adminId,
        },
      })
    ).id;
    competencyId = (
      await prisma.competency.upsert({
        where: { name: `${TITLE}Competência` },
        update: {},
        create: { name: `${TITLE}Competência` },
      })
    ).id;

    const mkCohort = (courseId: number, instructorId: number, name: string) =>
      prisma.courseCohort.create({
        data: { courseId, instructorId, name, status: 'OPEN', startDate: when(2), capacity: 5 },
        select: { id: true },
      });
    h.A = (await mkCohort(c.A, A.id, 'Turma HA')).id;
  }, 120_000);

  afterAll(async () => {
    await prisma.document
      .deleteMany({ where: { title: { startsWith: TITLE } } })
      .catch((): void => undefined);
    await prisma.competency
      .deleteMany({ where: { name: { startsWith: TITLE } } })
      .catch((): void => undefined);
    await cleanupScope(prisma, TITLE);
    await app.close();
  });

  describe('mover conteúdo para fora (C1, C2)', () => {
    it('PUT /modules/:id não muda o curso do módulo', async () => {
      await api()
        .put(`/modules/${m.A}`)
        .set(as(A.token))
        .send({ title: 'Mod A ok', courseId: c.B });
      const mod = await prisma.courseModule.findUniqueOrThrow({ where: { id: m.A } });
      expect(mod.courseId).toBe(c.A);
    });

    it('PUT /lessons/:id não muda o módulo da lição', async () => {
      await api()
        .put(`/lessons/${l.A}`)
        .set(as(A.token))
        .send({ title: 'Les A ok', moduleId: m.B });
      const les = await prisma.lesson.findUniqueOrThrow({ where: { id: l.A } });
      expect(les.moduleId).toBe(m.A);
    });

    it('PUT /courses/lessons/:lessonId também não muda o módulo', async () => {
      await api()
        .put(`/courses/lessons/${l.A}`)
        .set(as(A.token))
        .send({ title: 'Les A ok2', moduleId: m.B });
      const les = await prisma.lesson.findUniqueOrThrow({ where: { id: l.A } });
      expect(les.moduleId).toBe(m.A);
    });

    it('o ADMIN continua a poder mover um módulo de curso', async () => {
      await api().put(`/modules/${m.A2}`).set(as(adminToken)).send({ courseId: c.B }).expect(200);
      const mod = await prisma.courseModule.findUniqueOrThrow({ where: { id: m.A2 } });
      expect(mod.courseId).toBe(c.B);
      await prisma.courseModule.update({ where: { id: m.A2 }, data: { courseId: c.A } });
    });
  });

  describe('aulas ao vivo: atualizar não foge ao âmbito (C3, I4)', () => {
    it('curso, lição, instrutores e gravação do corpo são ignorados ou recusados', async () => {
      await api()
        .put(`/live-classes/${lc.A}`)
        .set(as(A.token))
        .send({
          topic: `${TITLE}LA editada`,
          courseId: c.B,
          lessonId: l.B,
          moduleId: m.B,
          instructorId: profB,
          coInstructorId: profB,
          recordingUrl: 'https://phishing.example/x.mp4',
          allowRecordingDownload: true,
        });
      const row = await prisma.liveClass.findUniqueOrThrow({ where: { id: lc.A } });
      expect(row.courseId).toBeNull();
      expect(row.lessonId).toBeNull();
      expect(row.moduleId).toBeNull();
      expect(row.instructorId).toBe(profA);
      expect(row.coInstructorId).toBeNull();
      expect(row.recordingUrl).toBe('https://exemplo.pt/LA.mp4');
      expect(row.allowRecordingDownload).toBe(false);
    });

    it('sessões: instrutor e gravação do corpo são ignorados', async () => {
      await api()
        .put(`/live-classes/${lc.A}/sessions/${lc.ASession}`)
        .set(as(A.token))
        .send({ notes: 'ok', instructorId: profB, recordingUrl: 'https://phishing.example/s.mp4' });
      const s = await prisma.liveClassSession.findUniqueOrThrow({ where: { id: lc.ASession } });
      expect(s.recordingUrl).toBe('https://exemplo.pt/s.mp4');
      expect(s.instructorId).not.toBe(profB);
    });

    it('criar aula também ignora a gravação enviada', async () => {
      const res = await api()
        .post('/live-classes')
        .set(as(A.token))
        .send({
          topic: `${TITLE}Nova`,
          scheduledAt: when(8).toISOString(),
          duration: 30,
          recordingUrl: 'https://phishing.example/n.mp4',
        })
        .expect(201);
      const row = await prisma.liveClass.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.recordingUrl).toBeNull();
    });
  });

  describe('biblioteca de documentos (C4)', () => {
    it('controlo: o ADMIN consegue anexar o documento (o fixture é válido)', async () => {
      const r = await api()
        .post(`/live-classes/${lc.B}/materials`)
        .set(as(adminToken))
        .send({ documentId: foreignDocId });
      expect([200, 201]).toContain(r.status);
      await prisma.liveClass.update({ where: { id: lc.B }, data: { materialDocumentIds: [] } });
    });

    it('não anexa documentos da empresa ao material da sua aula', async () => {
      const r = await api()
        .post(`/live-classes/${lc.A}/materials`)
        .set(as(A.token))
        .send({ documentId: foreignDocId });
      expect([403, 404]).toContain(r.status);
      const row = await prisma.liveClass.findUniqueOrThrow({ where: { id: lc.A } });
      expect(row.materialDocumentIds).not.toContain(foreignDocId);
    });

    it('nem pela criação/atualização com materialDocumentIds, nem pelas sessões', async () => {
      await api()
        .put(`/live-classes/${lc.A}`)
        .set(as(A.token))
        .send({ materialDocumentIds: [foreignDocId] });
      await api()
        .put(`/live-classes/${lc.A}/sessions/${lc.ASession}`)
        .set(as(A.token))
        .send({ materialDocumentIds: [foreignDocId] });
      const row = await prisma.liveClass.findUniqueOrThrow({ where: { id: lc.A } });
      const ses = await prisma.liveClassSession.findUniqueOrThrow({ where: { id: lc.ASession } });
      expect(row.materialDocumentIds).not.toContain(foreignDocId);
      expect(ses.materialDocumentIds).not.toContain(foreignDocId);
    });

    it('a lista de materiais nunca devolve o conteúdo do ficheiro ao externo', async () => {
      await prisma.liveClass.update({
        where: { id: lc.A },
        data: { materialDocumentIds: [foreignDocId] },
      });
      const res = await api().get('/live-classes/materials').set(as(A.token)).expect(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('U0VDUkVUTw==');
      expect(text).not.toContain('data:text/plain');
      await prisma.liveClass.update({ where: { id: lc.A }, data: { materialDocumentIds: [] } });
    });
  });

  describe('reordenar só dentro do seu contentor (I1)', () => {
    it('lições de outro módulo não mudam de posição', async () => {
      await api()
        .patch(`/lessons/reorder/${m.A}`)
        .set(as(A.token))
        .send({
          order: [
            { id: l.B, seq: 99 },
            { id: l.A, seq: 1 },
          ],
        });
      await api()
        .patch(`/courses/modules/${m.A}/lessons/reorder`)
        .set(as(A.token))
        .send({ orderedIds: [l.B2, l.A] });
      const b = await prisma.lesson.findUniqueOrThrow({ where: { id: l.B } });
      const b2 = await prisma.lesson.findUniqueOrThrow({ where: { id: l.B2 } });
      expect(b.seq).toBe(1);
      expect(b2.seq).toBe(2);
    });

    it('módulos de outro curso não mudam de posição', async () => {
      await api()
        .patch(`/courses/${c.A}/modules/reorder`)
        .set(as(A.token))
        .send({ orderedIds: [m.B, m.A] });
      const mb = await prisma.courseModule.findUniqueOrThrow({ where: { id: m.B } });
      expect(mb.seq).toBe(1);
    });

    it('reordenar o que é de facto do contentor continua a funcionar', async () => {
      await api()
        .patch(`/courses/modules/${m.A}/lessons/reorder`)
        .set(as(A.token))
        .send({ orderedIds: [l.A2, l.A] })
        .expect(200);
      const a2 = await prisma.lesson.findUniqueOrThrow({ where: { id: l.A2 } });
      expect(a2.seq).toBe(0);
    });
  });

  describe('turmas (I2, I3)', () => {
    it('não adiciona departamentos inteiros à turma', async () => {
      await api()
        .post(`/courses/cohorts/${h.A}/participants`)
        .set(as(A.token))
        .send({ departmentIds: [1] })
        .expect(403);
      expect(await prisma.courseCohortParticipant.count({ where: { cohortId: h.A } })).toBe(0);
    });

    it('adiciona participantes indicados individualmente', async () => {
      await api()
        .post(`/courses/cohorts/${h.A}/participants`)
        .set(as(A.token))
        .send({ userIds: [employeeId] })
        .expect(201);
    });

    it('não passa a turma a outro instrutor', async () => {
      await api().patch(`/courses/cohorts/${h.A}`).set(as(A.token)).send({ instructorId: B.id });
      const cohort = await prisma.courseCohort.findUniqueOrThrow({ where: { id: h.A } });
      expect(cohort.instructorId).toBe(A.id);
    });
  });

  describe('competências do módulo (I5)', () => {
    it('competencyIds é ignorado ao criar e editar módulos', async () => {
      const created = await api()
        .post(`/courses/${c.A}/modules`)
        .set(as(A.token))
        .send({ title: 'Com competência', seq: 40, competencyIds: [competencyId] })
        .expect(201);
      await api()
        .put(`/courses/${c.A}/modules/${m.A}`)
        .set(as(A.token))
        .send({ competencyIds: [competencyId] });
      expect(await prisma.moduleCompetency.count({ where: { competencyId } })).toBe(0);
      expect(created.body.id).toBeDefined();
    });
  });

  describe('fugas menores', () => {
    it('o detalhe do curso não traz os grupos de público (com ids de colaboradores)', async () => {
      const res = await api().get(`/courses/${c.A}`).set(as(A.token)).expect(200);
      expect(res.body.audienceGroups).toBeUndefined();
    });

    it('filtros por departamento/unidade nas inscrições são ignorados', async () => {
      await prisma.enrollment.create({
        data: { userId: employeeId, courseId: c.A, status: 'IN_PROGRESS', progress: 10 },
      });
      const res = await api()
        .get(`/enrollments?courseId=${c.A}&departmentId=999999`)
        .set(as(A.token))
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
