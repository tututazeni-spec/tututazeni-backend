import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { bootApp, cleanupScope, makeExternal, TestExternal } from './scope.helper';

const TITLE = 'ScopeTurma ';

describe('Instrutor externo — turmas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: TestExternal;
  let B: TestExternal;
  const c: Record<string, number> = {};
  const h: Record<string, number> = {};

  const api = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    A = await makeExternal(app, prisma, 'ta');
    B = await makeExternal(app, prisma, 'tb');
    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: 'int.employee@innova-test.com' },
    });
    const mkCourse = (key: string, primary: number) =>
      prisma.course.create({
        data: {
          title: `${TITLE}${key}`,
          internalCode: `SCOPET-${key}-${Date.now()}`,
          description: 'teste',
          status: 'PUBLISHED',
          primaryInstructorId: primary,
        },
        select: { id: true },
      });
    c.A = (await mkCourse('A', A.id)).id;
    c.B = (await mkCourse('B', B.id)).id;
    const mkCohort = (courseId: number, instructorId: number, name: string) =>
      prisma.courseCohort.create({
        data: { courseId, instructorId, name, status: 'OPEN', startDate: new Date(Date.now() + 86_400_000) },
        select: { id: true },
      });
    h.a1 = (await mkCohort(c.A, A.id, 'Turma A1')).id;
    // turma do curso de A mas dada por B (co-ensino): A não a gere
    h.aByB = (await mkCohort(c.A, B.id, 'Turma A dada por B')).id;
    h.b1 = (await mkCohort(c.B, B.id, 'Turma B1')).id;
    await prisma.courseCohortParticipant.create({ data: { cohortId: h.a1, userId: employee.id } });
  }, 120_000);

  afterAll(async () => {
    await cleanupScope(prisma, TITLE);
    await app.close();
  });

  it('lista de turmas de um curso: só as que ele dá; curso alheio → 404', async () => {
    const res = await api().get(`/courses/${c.A}/cohorts`).set(as(A.token)).expect(200);
    const ids = res.body.map((x: { id: number }) => x.id);
    expect(ids).toEqual([h.a1]);
    await api().get(`/courses/${c.B}/cohorts`).set(as(A.token)).expect(404);
  });

  it('turmas abertas: só as suas', async () => {
    const res = await api().get('/courses/cohorts/open').set(as(A.token)).expect(200);
    const ids = res.body.map((x: { id: number }) => x.id);
    expect(ids).toContain(h.a1);
    expect(ids).not.toContain(h.aByB);
    expect(ids).not.toContain(h.b1);
  });

  it('detalhe da turma: participantes só com nome (sem email nem nº de colaborador); alheia → recusada', async () => {
    const res = await api().get(`/courses/cohorts/${h.a1}`).set(as(A.token)).expect(200);
    expect(res.body.participants).toHaveLength(1);
    const user = res.body.participants[0].user;
    expect(user.fullName).toBeDefined();
    expect(user.email).toBeUndefined();
    expect(user.employeeNumber).toBeUndefined();
    const other = await api().get(`/courses/cohorts/${h.b1}`).set(as(A.token));
    expect([403, 404]).toContain(other.status);
    const dividida = await api().get(`/courses/cohorts/${h.aByB}`).set(as(A.token));
    expect([403, 404]).toContain(dividida.status);
  });

  it('não cria nem apaga turmas', async () => {
    await api()
      .post(`/courses/${c.A}/cohorts`)
      .set(as(A.token))
      .send({ name: 'x', startDate: new Date().toISOString(), capacity: 5 })
      .expect(403);
    await api().delete(`/courses/cohorts/${h.a1}`).set(as(A.token)).expect(403);
  });
});
