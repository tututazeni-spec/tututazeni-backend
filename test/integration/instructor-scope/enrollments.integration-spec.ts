import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { getToken } from '../helpers/auth.helper';
import { bootApp, cleanupScope, makeExternal, TestExternal } from './scope.helper';

const TITLE = 'ScopeInscr ';

describe('Instrutor externo — inscritos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let A: TestExternal;
  let B: TestExternal;
  const c: Record<string, number> = {};
  const e: Record<string, number> = {};

  const api = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    adminToken = await getToken(app.getHttpServer(), 'admin');
    A = await makeExternal(app, prisma, 'ea');
    B = await makeExternal(app, prisma, 'eb');
    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: 'int.employee@innova-test.com' },
    });
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: 'int.manager@innova-test.com' },
    });
    const mk = (key: string, instructorId: number | null) =>
      prisma.course.create({
        data: {
          title: `${TITLE}${key}`,
          internalCode: `SCOPEI-${key}-${Date.now()}`,
          description: 'teste',
          status: 'PUBLISHED',
          ...(instructorId ? { primaryInstructorId: instructorId } : {}),
        },
        select: { id: true },
      });
    c.A = (await mk('A', A.id)).id;
    c.B = (await mk('B', B.id)).id;
    c.Co = (await mk('Empresa', null)).id;
    const enr = (userId: number, courseId: number) =>
      prisma.enrollment.create({
        data: { userId, courseId, status: 'IN_PROGRESS', progress: 40 },
        select: { id: true },
      });
    e.empA = (await enr(employee.id, c.A)).id;
    e.empB = (await enr(employee.id, c.B)).id;
    e.mgrCo = (await enr(manager.id, c.Co)).id;
    e.employeeId = employee.id;
  }, 120_000);

  afterAll(async () => {
    await cleanupScope(prisma, TITLE);
    await app.close();
  });

  it('lista os inscritos dos seus cursos e só esses, sem email nem departamento', async () => {
    const res = await api().get('/enrollments?limit=100').set(as(A.token)).expect(200);
    const rows = res.body.data as Array<{
      id: number;
      courseId: number;
      user: Record<string, unknown>;
    }>;
    const ids = rows.map(r => r.id);
    expect(ids).toContain(e.empA);
    expect(ids).not.toContain(e.empB);
    expect(ids).not.toContain(e.mgrCo);
    const mine = rows.find(r => r.id === e.empA)!;
    expect(mine.user.fullName).toBeDefined();
    expect(mine.user.email).toBeUndefined();
    expect(mine.user.department).toBeUndefined();
    expect(mine.user.unit).toBeUndefined();
  });

  it('com courseId de curso alheio ou da empresa → 404', async () => {
    await api().get(`/enrollments?courseId=${c.B}`).set(as(A.token)).expect(404);
    await api().get(`/enrollments?courseId=${c.Co}`).set(as(A.token)).expect(404);
    await api().get(`/enrollments?courseId=${c.A}`).set(as(A.token)).expect(200);
  });

  it('o filtro userId não faz sair do âmbito dos seus cursos', async () => {
    const res = await api()
      .get(`/enrollments?userId=${e.employeeId}&limit=100`)
      .set(as(A.token))
      .expect(200);
    const ids = res.body.data.map((r: { id: number }) => r.id);
    expect(ids).toEqual([e.empA]);
  });

  it('cursos geríveis: só os seus, com a contagem de inscritos', async () => {
    const res = await api().get('/enrollments/manageable-courses').set(as(A.token)).expect(200);
    const ids = res.body.map((x: { id: number }) => x.id);
    expect(ids).toEqual([c.A]);
    expect(res.body[0].enrollments).toBe(1);
  });

  it('detalhe de uma matrícula: do seu curso → 200 (sem email); alheia → 404', async () => {
    const own = await api().get(`/enrollments/${e.empA}`).set(as(A.token)).expect(200);
    expect(own.body.user.email).toBeUndefined();
    await api().get(`/enrollments/${e.empB}`).set(as(A.token)).expect(404);
    await api().get(`/enrollments/${e.mgrCo}`).set(as(B.token)).expect(404);
  });

  it('não escreve nem consulta o que é de RH/gestão/aluno', async () => {
    await api()
      .post('/enrollments')
      .set(as(A.token))
      .send({ userId: e.employeeId, courseId: c.A })
      .expect(403);
    await api()
      .put(`/enrollments/${e.empA}/status`)
      .set(as(A.token))
      .send({ status: 'COMPLETED' })
      .expect(403);
    await api().patch(`/enrollments/${e.empA}/cancel`).set(as(A.token)).expect(403);
    await api().get('/enrollments/team').set(as(A.token)).expect(403);
    await api().get('/enrollments/compliance').set(as(A.token)).expect(403);
    await api().get('/enrollments/by-department').set(as(A.token)).expect(403);
    await api().get(`/enrollments/users/${e.employeeId}`).set(as(A.token)).expect(403);
    await api().get('/enrollments/my').set(as(A.token)).expect(403);
    await api().post(`/enrollments/self-enroll/${c.A}`).set(as(A.token)).expect(403);
  });

  it('o ADMIN continua a ver tudo, com email', async () => {
    const res = await api().get(`/enrollments?courseId=${c.B}`).set(as(adminToken)).expect(200);
    const row = res.body.data.find((r: { id: number }) => r.id === e.empB);
    expect(row.user.email).toBe('int.employee@innova-test.com');
  });
});
