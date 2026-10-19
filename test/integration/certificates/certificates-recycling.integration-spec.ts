import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { CertificateIssuanceService } from '../../../src/certificates/certificate-issuance.service';
import { CertificateExpiryService } from '../../../src/certificates/certificate-expiry.service';
import { getToken } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const DAY = 86_400_000;

describe('Reciclagem de certificados (Postgres real)', () => {
  let app: INestApplication;
  let rhToken: string;
  let employeeToken: string;
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  let employeeId: number;
  let rhId: number;
  let issuance: CertificateIssuanceService;
  let expiry: CertificateExpiryService;
  let manualCourse: number;
  let autoCourse: number;
  let offCourse: number;
  let lessonId: number;
  const enrollments: Record<string, number> = {};
  const stamp = Date.now();
  const http = () => app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const issue = (courseId: number) =>
    issuance.issue({
      userId: employeeId,
      activityKind: 'COURSE',
      activityId: courseId,
      actorId: rhId,
      trigger: 'MANUAL',
    });
  const complete = (enrollmentId: number) =>
    prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
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
    issuance = app.get(CertificateIssuanceService);
    expiry = app.get(CertificateExpiryService);
    rhToken = await getToken(http(), 'rh');
    employeeToken = await getToken(http(), 'employee');
    employeeId = (await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    }))!.id;
    rhId = (await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } }))!.id;

    const mk = (n: string, mode: 'OFF' | 'MANUAL' | 'AUTOMATIC') =>
      prisma.course.create({
        data: {
          title: `Curso Reciclagem ${n}`,
          internalCode: `INT-CERT-RC-${n}-${stamp}`,
          description: 'x',
          status: 'PUBLISHED',
          certificateValidityDays: 30,
          recyclingMode: mode,
          recyclingLeadDays: 30,
        },
      });
    manualCourse = (await mk('M', 'MANUAL')).id;
    autoCourse = (await mk('A', 'AUTOMATIC')).id;
    offCourse = (await mk('O', 'OFF')).id;
    for (const [key, courseId] of [
      ['manual', manualCourse],
      ['auto', autoCourse],
      ['off', offCourse],
    ] as const) {
      const e = await prisma.enrollment.create({
        data: {
          courseId,
          userId: employeeId,
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
        },
      });
      await prisma.enrollmentRun.create({ data: { enrollmentId: e.id, cycle: 1 } });
      enrollments[key] = e.id;
    }
    // Uma aula concluída na 1.ª realização do curso MANUAL: tem de sobreviver à reciclagem.
    const mod = await prisma.courseModule.create({
      data: { courseId: manualCourse, title: 'M1', seq: 0, learningObjectives: [] },
    });
    const lesson = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'L1', seq: 0, learningObjectives: [] } as never,
    });
    lessonId = lesson.id;
    await prisma.lessonProgress.create({
      data: {
        lessonId,
        userId: employeeId,
        enrollmentId: enrollments.manual,
        completed: true,
        completedAt: new Date(),
        watchedSeconds: 42,
      },
    });
  });

  afterAll(async () => {
    const ids = [manualCourse, autoCourse, offCourse];
    // filhos antes de pais: certificate → run → enrollment → course
    await prisma.certificate
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch(() => undefined);
    await prisma.lessonProgress.deleteMany({ where: { lessonId } }).catch(() => undefined);
    await prisma.lesson.deleteMany({ where: { id: lessonId } }).catch(() => undefined);
    await prisma.courseModule
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch(() => undefined);
    await prisma.enrollmentRun
      .deleteMany({ where: { enrollment: { courseId: { in: ids } } } })
      .catch(() => undefined);
    await prisma.enrollment.deleteMany({ where: { courseId: { in: ids } } }).catch(() => undefined);
    await prisma.course.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('reciclagem manual', () => {
    let first: number;

    it('1.ª conclusão emite o primeiro certificado (realização 1)', async () => {
      const r = await issue(manualCourse);
      expect(r.outcome).toBe('ISSUED');
      expect(r.certificate).toMatchObject({ enrollmentCycle: 1, enrollmentId: enrollments.manual });
      first = r.certificate!.id;
    });

    it('colaborador não pode iniciar a reciclagem (403)', async () => {
      await request(http())
        .post(`/enrollments/${enrollments.manual}/recycle`)
        .set(as(employeeToken))
        .expect(403);
    });

    it('RH inicia a reciclagem: mesma matrícula, nova realização, progresso a zero', async () => {
      const res = await request(http())
        .post(`/enrollments/${enrollments.manual}/recycle`)
        .set(as(rhToken))
        .expect(200);
      expect(res.body).toMatchObject({ outcome: 'STARTED', cycle: 2 });
      const e = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollments.manual } });
      expect(e).toMatchObject({ cycle: 2, status: 'NOT_STARTED', progress: 0, completedAt: null });
    });

    it('o progresso da aula é limpo na matrícula mas fica guardado na realização 1', async () => {
      expect(await prisma.lessonProgress.count({ where: { lessonId, userId: employeeId } })).toBe(
        0,
      );
      const run1 = await prisma.enrollmentRun.findUniqueOrThrow({
        where: { enrollmentId_cycle: { enrollmentId: enrollments.manual, cycle: 1 } },
        include: { lessons: true },
      });
      expect(run1.closedAt).not.toBeNull();
      expect(run1.lessons).toEqual([
        expect.objectContaining({ lessonId, completed: true, watchedSeconds: 42 }),
      ]);
    });

    it('repetir a reciclagem não duplica realizações (409, a realização está em curso)', async () => {
      await request(http())
        .post(`/enrollments/${enrollments.manual}/recycle`)
        .set(as(rhToken))
        .expect(409);
      expect(
        await prisma.enrollmentRun.count({ where: { enrollmentId: enrollments.manual } }),
      ).toBe(2);
    });

    it('não emite certificado enquanto a realização não está concluída', async () => {
      const r = await issue(manualCourse);
      expect(r.outcome).toBe('NOT_ELIGIBLE');
      expect(await prisma.certificate.count({ where: { courseId: manualCourse } })).toBe(1);
    });

    it('depois de concluir emite um 2.º certificado, sem tocar no 1.º, e é idempotente', async () => {
      await complete(enrollments.manual);
      const r = await issue(manualCourse);
      expect(r.outcome).toBe('ISSUED');
      expect(r.certificate).toMatchObject({ enrollmentCycle: 2 });
      expect(r.certificate!.id).not.toBe(first);

      const again = await issue(manualCourse);
      expect(again.outcome).toBe('EXISTS');
      expect(again.certificate!.id).toBe(r.certificate!.id);

      const old = await prisma.certificate.findUniqueOrThrow({ where: { id: first } });
      expect(old).toMatchObject({ status: 'ACTIVE', revoked: false, enrollmentCycle: 1 });
      expect(old.validationCode).not.toBe(r.certificate!.validationCode);
    });

    it('as realizações listam um certificado cada, só o último é o vigente', async () => {
      const res = await request(http())
        .get(`/enrollments/${enrollments.manual}/runs`)
        .set(as(rhToken))
        .expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].certificates).toHaveLength(1);
      expect(res.body[0].certificates[0]).toMatchObject({ id: first, current: false });
      expect(res.body[1].certificates[0].current).toBe(true);
    });
  });

  describe('reciclagem desactivada', () => {
    it('curso com recyclingMode OFF → 409 e matrícula inalterada', async () => {
      await request(http())
        .post(`/enrollments/${enrollments.off}/recycle`)
        .set(as(rhToken))
        .expect(409);
      const e = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollments.off } });
      expect(e).toMatchObject({ cycle: 1, status: 'COMPLETED' });
    });
  });

  describe('reciclagem automática', () => {
    it('o job recicla certificados a expirar, uma só vez, mesmo reprocessado', async () => {
      const r = await issue(autoCourse);
      await prisma.certificate.update({
        where: { id: r.certificate!.id },
        data: { expiresAt: new Date(Date.now() + 10 * DAY) },
      });

      const run1 = await expiry.runExpiryJob();
      expect(run1.recycled).toBeGreaterThanOrEqual(1);
      const e = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollments.auto } });
      expect(e).toMatchObject({ cycle: 2, status: 'NOT_STARTED' });
      const run = await prisma.enrollmentRun.findUniqueOrThrow({
        where: { enrollmentId_cycle: { enrollmentId: enrollments.auto, cycle: 2 } },
      });
      expect(run).toMatchObject({ reason: 'EXPIRY_AUTO', fromCertificateId: r.certificate!.id });

      await expiry.runExpiryJob();
      expect(await prisma.enrollmentRun.count({ where: { enrollmentId: enrollments.auto } })).toBe(
        2,
      );
    });

    it('certificado expirado de curso MANUAL não abre reciclagem sozinho', async () => {
      await prisma.certificate.updateMany({
        where: { courseId: manualCourse },
        data: { expiresAt: new Date(Date.now() - DAY) },
      });
      await expiry.runExpiryJob();
      const e = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollments.manual } });
      expect(e.cycle).toBe(2);
      const states = await prisma.certificate.findMany({
        where: { courseId: manualCourse },
        select: { status: true },
      });
      expect(states.every(c => c.status === 'EXPIRED')).toBe(true);
    });
  });
});
