import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { getToken } from '../helpers/auth.helper';
import { bootApp, cleanupScope, makeExternal, TestExternal } from './scope.helper';

const TITLE = 'ScopeCurso ';

describe('Instrutor externo — cursos, módulos e lições', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let A: TestExternal;
  let B: TestExternal;
  const c: Record<string, number> = {};

  const api = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  const newCourse = (key: string, instructorId: number | null, extra: object = {}) =>
    prisma.course.create({
      data: {
        title: `${TITLE}${key}`,
        internalCode: `SCOPE-${key}-${Date.now()}`,
        description: 'Curso de teste de âmbito',
        status: 'PUBLISHED',
        ...(instructorId ? { primaryInstructorId: instructorId } : {}),
        ...extra,
      },
      select: { id: true },
    });
  const newModule = (courseId: number, title: string, seq = 1) =>
    prisma.courseModule.create({ data: { courseId, title, seq }, select: { id: true } });
  const newLesson = (moduleId: number, title: string, seq = 1) =>
    prisma.lesson.create({
      data: { moduleId, title, seq, type: 'TEXT', textContent: 'conteúdo' },
      select: { id: true },
    });

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    adminToken = await getToken(app.getHttpServer(), 'admin');
    A = await makeExternal(app, prisma, 'a');
    B = await makeExternal(app, prisma, 'b');

    c.courseA = (await newCourse('A', A.id)).id;
    c.courseB = (await newCourse('B', B.id)).id;
    c.courseCo = (await newCourse('Empresa', null)).id;
    // A é co-instrutor (tabela CourseInstructor) do curso da empresa? Não — só do curso A.
    c.modA = (await newModule(c.courseA, 'Módulo A')).id;
    c.modB = (await newModule(c.courseB, 'Módulo B')).id;
    c.modCo = (await newModule(c.courseCo, 'Módulo Empresa')).id;
    c.lesA = (await newLesson(c.modA, 'Lição A')).id;
    c.lesB = (await newLesson(c.modB, 'Lição B')).id;
    c.lesCo = (await newLesson(c.modCo, 'Lição Empresa')).id;
  }, 120_000);

  afterAll(async () => {
    await cleanupScope(prisma, TITLE);
    await app.close();
  });

  describe('barreira geral', () => {
    it('o externo não chega a endpoints partilhados @AnyAuthenticated (ex.: pesquisa, IA, carreira)', async () => {
      for (const path of ['/search?q=a', '/career/me', '/leave-management/balances/me', '/ai-tutor/sessions']) {
        const r = await api().get(path).set(as(A.token));
        expect([401, 403, 404]).toContain(r.status);
        expect(r.status).not.toBe(200);
      }
    });
    it('mas continua a ver a própria conta', async () => {
      await api().get('/auth/me').set(as(A.token)).expect(200);
    });
  });

  describe('cursos', () => {
    it('GET /courses devolve só os cursos onde é instrutor', async () => {
      const res = await api().get('/courses?limit=100').set(as(A.token)).expect(200);
      const ids = res.body.data.map((x: { id: number }) => x.id);
      expect(ids).toContain(c.courseA);
      expect(ids).not.toContain(c.courseB);
      expect(ids).not.toContain(c.courseCo);
    });

    it('a pesquisa por texto não deixa escapar cursos alheios', async () => {
      const res = await api().get(`/courses?limit=100&search=${encodeURIComponent(TITLE)}`).set(as(A.token)).expect(200);
      const ids = res.body.data.map((x: { id: number }) => x.id);
      expect(ids).toEqual([c.courseA]);
    });

    it('GET /courses/:id do seu curso → 200, sem cursos relacionados nem percursos; alheio → 404', async () => {
      const own = await api().get(`/courses/${c.courseA}`).set(as(A.token)).expect(200);
      expect(own.body.relatedCourses).toBeUndefined();
      expect(own.body.learningPaths).toBeUndefined();
      await api().get(`/courses/${c.courseB}`).set(as(A.token)).expect(404);
      await api().get(`/courses/${c.courseCo}`).set(as(A.token)).expect(404);
    });

    it('não cria, publica, arquiva nem apaga cursos', async () => {
      await api().post('/courses').set(as(A.token)).send({ title: 'X' }).expect(403);
      await api().patch(`/courses/${c.courseA}/publish`).set(as(A.token)).expect(403);
      await api().patch(`/courses/${c.courseA}/archive`).set(as(A.token)).expect(403);
      await api().delete(`/courses/${c.courseA}`).set(as(A.token)).expect(403);
    });

    it('B não vê nada de A', async () => {
      const res = await api().get('/courses?limit=100').set(as(B.token)).expect(200);
      const ids = res.body.data.map((x: { id: number }) => x.id);
      expect(ids).toContain(c.courseB);
      expect(ids).not.toContain(c.courseA);
      await api().get(`/courses/${c.courseA}`).set(as(B.token)).expect(404);
    });
  });

  describe('módulos (controlador /modules)', () => {
    it('cria módulo no seu curso; no alheio/da empresa → 404', async () => {
      await api()
        .post('/modules')
        .set(as(A.token))
        .send({ courseId: c.courseA, title: 'Novo módulo', seq: 5 })
        .expect(201);
      await api().post('/modules').set(as(A.token)).send({ courseId: c.courseB, title: 'X', seq: 1 }).expect(404);
      await api().post('/modules').set(as(A.token)).send({ courseId: c.courseCo, title: 'X', seq: 1 }).expect(404);
    });

    it('lê, edita e apaga o seu módulo; o alheio → 404', async () => {
      await api().get(`/modules/${c.modA}`).set(as(A.token)).expect(200);
      await api().put(`/modules/${c.modA}`).set(as(A.token)).send({ title: 'Módulo A editado' }).expect(200);
      await api().get(`/modules/${c.modB}`).set(as(A.token)).expect(404);
      await api().put(`/modules/${c.modB}`).set(as(A.token)).send({ title: 'hack' }).expect(404);
      await api().delete(`/modules/${c.modCo}`).set(as(A.token)).expect(404);
      const stillThere = await prisma.courseModule.findUnique({ where: { id: c.modB } });
      expect(stillThere?.title).toBe('Módulo B');
    });

    it('não reordena módulos de outro curso nem clona módulos', async () => {
      await api().patch(`/modules/reorder/${c.courseB}`).set(as(A.token)).send({ items: [] }).expect(404);
      await api().post(`/modules/${c.modA}/clone`).set(as(A.token)).send({ targetCourseId: c.courseB }).expect(403);
    });

    it('material do módulo: só no seu', async () => {
      await api()
        .post(`/modules/${c.modB}/materials`)
        .set(as(A.token))
        .send({ title: 'x', type: 'LINK', url: 'https://exemplo.pt' })
        .expect(404);
    });
  });

  describe('lições', () => {
    it('cria lição no seu módulo; no alheio → 404', async () => {
      await api()
        .post('/lessons')
        .set(as(A.token))
        .send({ moduleId: c.modA, title: 'Nova lição', contentType: 'TEXT', seq: 9 })
        .expect(201);
      await api()
        .post('/lessons')
        .set(as(A.token))
        .send({ moduleId: c.modB, title: 'X', contentType: 'TEXT', seq: 1 })
        .expect(404);
    });

    it('edita/apaga só as suas; ficheiros de lições alheias → 404', async () => {
      await api().put(`/lessons/${c.lesA}`).set(as(A.token)).send({ title: 'Lição A editada' }).expect(200);
      await api().put(`/lessons/${c.lesB}`).set(as(A.token)).send({ title: 'hack' }).expect(404);
      await api().delete(`/lessons/${c.lesCo}`).set(as(A.token)).expect(404);
      await api().get(`/lessons/${c.lesB}/file`).set(as(A.token)).expect(404);
      await api().get(`/lessons/${c.lesB}/audio`).set(as(A.token)).expect(404);
    });

    it('não move uma lição sua para um módulo alheio (nem a alheia para o seu)', async () => {
      await api().patch(`/lessons/${c.lesA}/move`).set(as(A.token)).send({ targetModuleId: c.modB, seq: 1 }).expect(404);
      await api().patch(`/lessons/${c.lesB}/move`).set(as(A.token)).send({ targetModuleId: c.modA, seq: 1 }).expect(404);
      const les = await prisma.lesson.findUnique({ where: { id: c.lesA } });
      expect(les?.moduleId).toBe(c.modA);
    });
  });

  describe('rotas de edição em /courses/…', () => {
    it('módulo no curso: seu → 201; alheio → 404', async () => {
      await api().post(`/courses/${c.courseA}/modules`).set(as(A.token)).send({ title: 'M via curso', seq: 20 }).expect(201);
      await api().post(`/courses/${c.courseB}/modules`).set(as(A.token)).send({ title: 'X', seq: 1 }).expect(404);
    });

    it('lição, atividade e recurso: só os seus', async () => {
      await api()
        .post(`/courses/modules/${c.modA}/lessons`)
        .set(as(A.token))
        .send({ title: 'L via curso', type: 'TEXT', seq: 30 })
        .expect(201);
      await api()
        .post(`/courses/modules/${c.modB}/lessons`)
        .set(as(A.token))
        .send({ title: 'X', type: 'TEXT', seq: 1 })
        .expect(404);
      await api().delete(`/courses/lessons/${c.lesB}`).set(as(A.token)).expect(404);
      await api().post(`/courses/lessons/${c.lesB}/activities`).set(as(A.token)).send({}).expect(404);
      await api().post(`/courses/lessons/${c.lesB}/resources`).set(as(A.token)).send({}).expect(404);
    });

    it('quizzes e competências continuam fechados', async () => {
      await api().get(`/courses/lessons/${c.lesA}/quiz`).set(as(A.token)).expect(403);
      await api().post(`/courses/${c.courseA}/competencies/1`).set(as(A.token)).expect(403);
    });
  });

  describe('os outros papéis não mudam', () => {
    it('ADMIN continua a gerir módulos de qualquer curso', async () => {
      await api()
        .post('/modules')
        .set(as(adminToken))
        .send({ courseId: c.courseB, title: 'Admin', seq: 7 })
        .expect(201);
      const all = await api().get('/courses?limit=100').set(as(adminToken)).expect(200);
      const ids = all.body.data.map((x: { id: number }) => x.id);
      expect(ids).toEqual(expect.arrayContaining([c.courseA, c.courseB, c.courseCo]));
    });
  });
});
