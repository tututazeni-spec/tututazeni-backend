import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const MARK = `IntTestJoin${Date.now()}`;
const MIN = 60_000;

// POST /trainings/sessions/:id/join — ponte formação → execução.
describe('Trainings join (Entrar / Iniciar / Registar presença) Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let employeeId: number;
  let managerId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let trainingId: number;
  let courseTrainingId: number;
  let courseId: number;
  const sessionIds: number[] = [];

  const join = (token: string, sessionId: number) =>
    request(app.getHttpServer())
      .post(`/trainings/sessions/${sessionId}/join`)
      .set('Authorization', `Bearer ${token}`);

  /** Cria uma sessão que começou há `startedMinAgo` min (negativo = começa no futuro) e inscreve o colaborador. */
  async function makeSession(
    startedMinAgo: number,
    opts: {
      modality?: 'ONLINE' | 'PRESENTIAL' | 'HYBRID';
      meetingUrl?: string | null;
      forCourse?: boolean;
      participantStatus?: 'REGISTERED' | 'WAITLIST';
      enrol?: boolean;
    } = {},
  ) {
    const tId = opts.forCourse ? courseTrainingId : trainingId;
    const session = await prisma.trainingSession.create({
      data: {
        trainingId: tId,
        sessionDate: new Date(Date.now() - startedMinAgo * MIN),
        durationMinutes: 60,
        modality: opts.modality ?? 'ONLINE',
        meetingUrl:
          opts.meetingUrl === undefined ? 'https://meet.example.com/int' : opts.meetingUrl,
      },
    });
    sessionIds.push(session.id);
    if (opts.enrol !== false) {
      await prisma.trainingParticipant.create({
        data: {
          sessionId: session.id,
          userId: employeeId,
          trainingId: tId,
          status: opts.participantStatus ?? 'REGISTERED',
        },
      });
    }
    return session.id;
  }

  const participantOf = (sessionId: number) =>
    prisma.trainingParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId: employeeId } },
    });

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
    employeeId = (await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    }))!.id;
    managerId = (await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    }))!.id;

    const course = await prisma.course.create({
      data: {
        title: `${MARK} Curso`,
        internalCode: `INT-JOIN-${Date.now()}`,
        description: 'x',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;

    // MANUAL + sem certificado: nenhum efeito colateral de emissão neste teste.
    const base = {
      type: 'ONLINE' as const,
      level: 'BEGINNER' as const,
      status: 'PUBLISHED' as const,
      completionMode: 'MANUAL' as const,
      issueCertificate: false,
      minAttendancePercent: 75,
    };
    trainingId = (await prisma.training.create({ data: { ...base, title: `${MARK} A` } })).id;
    courseTrainingId = (
      await prisma.training.create({ data: { ...base, title: `${MARK} B`, courseId } })
    ).id;
  });

  afterAll(async () => {
    // filhos antes de pais (FK RESTRICT): participantes → sessões → formações → matrículas → curso
    await prisma.trainingParticipant
      .deleteMany({ where: { sessionId: { in: sessionIds } } })
      .catch((): undefined => undefined);
    await prisma.trainingSession
      .deleteMany({ where: { id: { in: sessionIds } } })
      .catch((): undefined => undefined);
    await prisma.training
      .deleteMany({ where: { id: { in: [trainingId, courseTrainingId].filter(Boolean) } } })
      .catch((): undefined => undefined);
    await prisma.enrollment.deleteMany({ where: { courseId } }).catch((): undefined => undefined);
    await prisma.course.deleteMany({ where: { id: courseId } }).catch((): undefined => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  it('sem token → 401', async () => {
    await request(app.getHttpServer()).post('/trainings/sessions/1/join').expect(401);
  });

  it('sessão inexistente → 404', async () => {
    await join(employeeToken, 2147483000).expect(404);
  });

  it('utilizador não inscrito na sessão → 404 (sem IDOR: a inscrição do colaborador não é afectada)', async () => {
    const sessionId = await makeSession(5);
    await join(managerToken, sessionId).expect(404);
    const p = await participantOf(sessionId);
    expect(p!.status).toBe('REGISTERED');
    expect(p!.joinedAt).toBeNull();
    expect(
      await prisma.trainingParticipant.count({ where: { sessionId, userId: managerId } }),
    ).toBe(0);
  });

  it('em lista de espera → 403', async () => {
    const sessionId = await makeSession(5, { participantStatus: 'WAITLIST' });
    await join(employeeToken, sessionId).expect(403);
    expect((await participantOf(sessionId))!.joinedAt).toBeNull();
  });

  it('antes da janela (começa daqui a 16 min) → 400 e nada é gravado', async () => {
    const sessionId = await makeSession(-16);
    const res = await join(employeeToken, sessionId).expect(400);
    expect(res.body.message).toBe('A entrada ainda não está aberta para esta sessão');
    expect((await participantOf(sessionId))!.joinedAt).toBeNull();
  });

  it('depois do fim da sessão → 400', async () => {
    const sessionId = await makeSession(61);
    await join(employeeToken, sessionId).expect(400);
  });

  it('online com link: devolve o link, grava joinedAt, marca ATTENDED e é idempotente', async () => {
    const sessionId = await makeSession(5);
    const first = await join(employeeToken, sessionId).expect(201);
    expect(first.body.destination).toEqual({
      type: 'MEETING',
      url: 'https://meet.example.com/int',
    });
    expect(first.body.status).toBe('ATTENDED');

    const afterFirst = await participantOf(sessionId);
    expect(afterFirst!.status).toBe('ATTENDED');
    expect(afterFirst!.joinedAt).not.toBeNull();

    const second = await join(employeeToken, sessionId).expect(201);
    expect(second.body.status).toBe('ATTENDED');
    const afterSecond = await participantOf(sessionId);
    expect(afterSecond!.joinedAt!.getTime()).toBe(afterFirst!.joinedAt!.getTime());
  });

  it('entrada com atraso que compromete minAttendancePercent: guarda joinedAt e fica REGISTERED', async () => {
    const sessionId = await makeSession(30);
    const res = await join(employeeToken, sessionId).expect(201);
    expect(res.body.late).toBe(true);
    expect(res.body.status).toBe('REGISTERED');
    const p = await participantOf(sessionId);
    expect(p!.status).toBe('REGISTERED');
    expect(p!.joinedAt).not.toBeNull();
  });

  it('online sem link nem curso → 400 "Link ainda não disponível" e NÃO regista presença', async () => {
    const sessionId = await makeSession(5, { meetingUrl: null });
    const res = await join(employeeToken, sessionId).expect(400);
    expect(res.body.message).toBe('Link ainda não disponível');
    const p = await participantOf(sessionId);
    expect(p!.status).toBe('REGISTERED');
    expect(p!.joinedAt).toBeNull();
  });

  it('formação com curso: matricula (courseId_userId) uma só vez e devolve a rota do curso', async () => {
    const sessionId = await makeSession(5, { meetingUrl: null, forCourse: true });
    const res = await join(employeeToken, sessionId).expect(201);
    expect(res.body.destination).toEqual({ type: 'COURSE', route: `/courses/${courseId}/learn` });

    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId: employeeId } },
    });
    expect(enrollment).not.toBeNull();

    await join(employeeToken, sessionId).expect(201);
    expect(await prisma.enrollment.count({ where: { courseId, userId: employeeId } })).toBe(1);
  });

  it('presencial: só check-in (REGISTERED + joinedAt); o formador confirma com o bulk de presenças existente', async () => {
    const sessionId = await makeSession(5, { modality: 'PRESENTIAL', meetingUrl: null });
    const res = await join(employeeToken, sessionId).expect(201);
    expect(res.body.destination).toEqual({ type: 'CHECKIN' });
    expect(res.body.status).toBe('REGISTERED');
    const checkedIn = await participantOf(sessionId);
    expect(checkedIn!.status).toBe('REGISTERED');
    expect(checkedIn!.joinedAt).not.toBeNull();

    await request(app.getHttpServer())
      .post('/trainings/sessions/attendance/bulk')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ sessionId, presentUserIds: [employeeId] })
      .expect(200);
    expect((await participantOf(sessionId))!.status).toBe('ATTENDED');
  });

  it('GET /trainings/:id devolve a janela de entrada da participação do utilizador', async () => {
    const res = await request(app.getHttpServer())
      .get(`/trainings/${trainingId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(res.body.myParticipations.length).toBeGreaterThan(0);
    const part = res.body.myParticipations[0];
    expect(new Date(part.joinClosesAt).getTime()).toBeGreaterThan(
      new Date(part.joinOpensAt).getTime(),
    );
  });

  it('GET /trainings/my inclui joinOpensAt/joinClosesAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/trainings/my')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const mine = res.body.find((e: any) => sessionIds.includes(e.sessionId));
    expect(mine.joinOpensAt).toBeTruthy();
    expect(mine.joinClosesAt).toBeTruthy();
  });
});
