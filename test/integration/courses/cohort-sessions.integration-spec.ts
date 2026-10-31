// Sessões e presenças de turma contra um Postgres real: apanha divergências
// schema ↔ código que os mocks do Prisma escondem (ver CLAUDE.md).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Cohort sessions & attendance Integration', () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeToken: string;
  let courseId: number;
  let cohortId: number;
  let sessionId: number;
  let employeeId: number;
  let adminId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    adminToken = await getToken(app.getHttpServer(), 'admin');
    employeeToken = await getToken(app.getHttpServer(), 'employee');

    const emp = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    const adm = await prisma.user.findUnique({
      where: { email: 'int.admin@innova-test.com' },
    });
    employeeId = emp!.id;
    adminId = adm!.id;

    const course = await prisma.course.create({
      data: { title: 'Curso sessões INT', description: 'int' } as any,
    });
    courseId = course.id;
    const cohort = await prisma.courseCohort.create({
      data: {
        courseId,
        name: 'Turma sessões INT',
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
        status: 'ACTIVE',
        participants: { create: [{ userId: employeeId }] },
      },
    });
    cohortId = cohort.id;
  });

  afterAll(async () => {
    // filhos antes de pais (FK); cada passo engole o erro como em teardown.ts
    await prisma.courseCohortAttendanceLog
      .deleteMany({ where: { session: { cohortId } } })
      .catch((): undefined => undefined);
    await prisma.courseCohortAttendance
      .deleteMany({ where: { session: { cohortId } } })
      .catch((): undefined => undefined);
    await prisma.courseCohortSession
      .deleteMany({ where: { cohortId } })
      .catch((): undefined => undefined);
    await prisma.courseCohortParticipant
      .deleteMany({ where: { cohortId } })
      .catch((): undefined => undefined);
    await prisma.courseCohort
      .deleteMany({ where: { id: cohortId } })
      .catch((): undefined => undefined);
    await prisma.course.deleteMany({ where: { id: courseId } }).catch((): undefined => undefined);
    await prisma.$disconnect().catch((): undefined => undefined);
    await pool.end().catch((): undefined => undefined);
    await app.close();
  });

  it('cria uma sessão e recusa outra sobreposta', async () => {
    const body = {
      title: 'Dia 1',
      date: '2026-02-02',
      startTime: '09:00',
      endTime: '12:00',
    };
    const res = await request(app.getHttpServer())
      .post(`/courses/cohorts/${cohortId}/sessions`)
      .set(auth(adminToken))
      .send(body)
      .expect(201);
    sessionId = res.body.id;
    await request(app.getHttpServer())
      .post(`/courses/cohorts/${cohortId}/sessions`)
      .set(auth(adminToken))
      .send({ ...body, title: 'Colide', startTime: '11:00', endTime: '13:00' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/courses/cohorts/${cohortId}/sessions`)
      .set(auth(adminToken))
      .send({ ...body, title: 'Tarde', startTime: '14:00', endTime: '17:00' })
      .expect(201);
  });

  it('um colaborador sem papel de gestão não gere sessões (403)', async () => {
    await request(app.getHttpServer())
      .get(`/courses/cohorts/${cohortId}/sessions`)
      .set(auth(employeeToken))
      .expect(403);
  });

  it('lista os inscritos, guarda presenças e persiste', async () => {
    const before = await request(app.getHttpServer())
      .get(`/courses/cohorts/${cohortId}/sessions/${sessionId}/attendance`)
      .set(auth(adminToken))
      .expect(200);
    expect(before.body.participants).toHaveLength(1);
    expect(before.body.participants[0].status).toBeNull();

    await request(app.getHttpServer())
      .put(`/courses/cohorts/${cohortId}/sessions/${sessionId}/attendance`)
      .set(auth(adminToken))
      .send({ records: [{ userId: employeeId, status: 'LATE', checkInTime: '09:10' }] })
      .expect(200);
    // segunda gravação com outro estado → histórico guarda o anterior
    await request(app.getHttpServer())
      .put(`/courses/cohorts/${cohortId}/sessions/${sessionId}/attendance`)
      .set(auth(adminToken))
      .send({
        records: [{ userId: employeeId, status: 'JUSTIFIED', note: 'atestado' }],
        reason: 'documento entregue',
      })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/courses/cohorts/${cohortId}/sessions/${sessionId}/attendance`)
      .set(auth(adminToken))
      .expect(200);
    expect(after.body.participants[0]).toMatchObject({ status: 'JUSTIFIED', note: 'atestado' });

    const history = await request(app.getHttpServer())
      .get(`/courses/cohorts/${cohortId}/sessions/${sessionId}/attendance/history`)
      .set(auth(adminToken))
      .expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body[0]).toMatchObject({
      previousStatus: 'LATE',
      newStatus: 'JUSTIFIED',
      changedById: adminId,
    });
  });

  it('recusa registar quem não está inscrito', async () => {
    await request(app.getHttpServer())
      .put(`/courses/cohorts/${cohortId}/sessions/${sessionId}/attendance`)
      .set(auth(adminToken))
      .send({ records: [{ userId: adminId, status: 'PRESENT' }] })
      .expect(400);
  });

  it('relatório: sessão passada conta; com a justificada fora do total fica "sem dados"', async () => {
    const res = await request(app.getHttpServer())
      .get(`/courses/cohorts/${cohortId}/attendance-report`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.general.sessionsCompleted).toBe(2);
    expect(res.body.criteria.minAttendancePercent).toBe(75);
    // 1.ª sessão justificada (fora do total); 2.ª sem registo (falta) → 0%
    expect(res.body.participants[0].rate).toBe(0);
    expect(res.body.participants[0].meetsMinimum).toBe(false);
  });

  it('o participante vê a própria assiduidade', async () => {
    const res = await request(app.getHttpServer())
      .get(`/courses/cohorts/${cohortId}/attendance-mine`)
      .set(auth(employeeToken))
      .expect(200);
    expect(res.body.summary.eligibleSessions).toBe(2);
  });

  it('exporta o relatório em CSV', async () => {
    const res = await request(app.getHttpServer())
      .get(`/courses/cohorts/${cohortId}/attendance-report/export?format=csv`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.text).toContain('Turma sessões INT');
  });

  it('cancelar preserva as presenças e a sessão deixa de contar', async () => {
    await request(app.getHttpServer())
      .post(`/courses/cohorts/${cohortId}/sessions/${sessionId}/cancel`)
      .set(auth(adminToken))
      .send({ reason: 'greve' })
      .expect(201);
    expect(await prisma.courseCohortAttendance.count({ where: { sessionId } })).toBe(1);
    const res = await request(app.getHttpServer())
      .get(`/courses/cohorts/${cohortId}/attendance-report`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.general.sessionsCompleted).toBe(1);
    expect(res.body.general.sessionsCancelled).toBe(1);
  });
});
