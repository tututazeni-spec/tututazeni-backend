import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n% escopo\n%%EOF\n').toString('base64')}`;

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Certificates scope, exports and personal area (Postgres real)', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let auditorToken: string;
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  let employeeId: number;
  let managerId: number;
  let outsiderId: number; // int.auditor: nunca é subordinado do gestor
  let courseMain: number;
  let courseMandatoryOpen: number;
  let courseMandatoryDone: number;
  let teamCert: { id: number; validationCode: string };
  let outsideCert: { id: number; validationCode: string };
  let teamPendingId: number;
  let outsidePendingId: number;
  const stamp = Date.now();
  const titleTeamPending = `Externo Equipa ${stamp}`;
  const titleOutPending = `Externo Fora ${stamp}`;
  const http = () => app.getHttpServer();
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const getBin = (path: string, token: string) =>
    request(http()).get(path).set(as(token)).buffer(true).parse(binary);

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
    employeeToken = await getToken(http(), 'employee');
    managerToken = await getToken(http(), 'manager');
    rhToken = await getToken(http(), 'rh');
    auditorToken = await getToken(http(), 'auditor');

    const id = async (email: string) => (await prisma.user.findUnique({ where: { email } }))!.id;
    employeeId = await id('int.employee@innova-test.com');
    managerId = await id('int.manager@innova-test.com');
    outsiderId = await id('int.auditor@innova-test.com');
    await prisma.user.update({ where: { id: employeeId }, data: { managerId: null } });

    const mk = (n: string) =>
      prisma.course.create({
        data: {
          title: `Curso Escopo ${n}`,
          internalCode: `INT-CERT-SC-${n}-${stamp}`,
          description: 'x',
          status: 'PUBLISHED',
        },
      });
    courseMain = (await mk('Main')).id;
    courseMandatoryOpen = (await mk('ObrigAberta')).id;
    courseMandatoryDone = (await mk('ObrigConcluida')).id;
    const done = { status: 'COMPLETED' as const, progress: 100, completedAt: new Date() };
    await prisma.enrollment.createMany({
      data: [
        { courseId: courseMain, userId: employeeId, ...done },
        {
          courseId: courseMandatoryOpen,
          userId: employeeId,
          status: 'IN_PROGRESS',
          mandatory: true,
        },
        { courseId: courseMandatoryDone, userId: employeeId, mandatory: true, ...done },
      ],
    });

    const issued = await request(http())
      .post('/certificates/issue')
      .set(as(rhToken))
      .send({ userId: employeeId, activityKind: 'COURSE', activityId: courseMain })
      .expect(201);
    teamCert = issued.body.certificate;

    // Certificado de alguém fora da equipa (criado directamente, já válido).
    outsideCert = await prisma.certificate.create({
      data: {
        type: 'COURSE',
        userId: outsiderId,
        courseId: courseMain,
        validationCode: `SCOPEOUT${stamp}`.slice(0, 16).toUpperCase(),
        title: `Fora da equipa ${stamp}`,
        status: 'ACTIVE',
      },
      select: { id: true, validationCode: true },
    });

    const ext = (userId: number, title: string) =>
      request(http())
        .post('/certificates/external')
        .set(as(rhToken))
        .send({ userId, title, issuerName: 'Entidade X', completedAt: '2026-03-01', document: PDF })
        .expect(201);
    teamPendingId = (await ext(employeeId, titleTeamPending)).body.certificate.id;
    outsidePendingId = (await ext(outsiderId, titleOutPending)).body.certificate.id;
  });

  afterAll(async () => {
    const ids = [courseMain, courseMandatoryOpen, courseMandatoryDone];
    // filhos antes de pais: certificate → enrollment → course (e repor a hierarquia)
    await prisma.certificate
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.certificate
      .deleteMany({ where: { title: { in: [titleTeamPending, titleOutPending] } } })
      .catch((): undefined => undefined);
    await prisma.enrollment
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.course
      .deleteMany({ where: { id: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.user
      .update({ where: { id: employeeId }, data: { managerId: null } })
      .catch((): undefined => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('gestor sem equipa', () => {
    it('lista, visão geral e resumo vêm vazios (nunca a empresa inteira)', async () => {
      const list = await request(http())
        .get('/certificates/admin/list')
        .set(as(managerToken))
        .expect(200);
      expect(list.body).toMatchObject({ data: [], total: 0 });
      const overview = await request(http())
        .get('/certificates/admin/overview')
        .set(as(managerToken))
        .expect(200);
      expect(overview.body.total).toBe(0);
      const team = await request(http())
        .get('/certificates/team/summary')
        .set(as(managerToken))
        .expect(200);
      expect(team.body.members).toEqual([]);
    });
  });

  describe('autorização', () => {
    it.each([
      '/certificates/admin/list',
      '/certificates/admin/export',
      '/certificates/team/summary',
    ])('colaborador → 403 em %s', async path => {
      await request(http()).get(path).set(as(employeeToken)).expect(403);
    });
  });

  describe('gestor com equipa', () => {
    beforeAll(async () => {
      await prisma.user.update({ where: { id: employeeId }, data: { managerId } });
    });

    it('a lista só tem a equipa', async () => {
      const res = await request(http())
        .get('/certificates/admin/list')
        .query({ limit: 100 })
        .set(as(managerToken))
        .expect(200);
      const ids: number[] = res.body.data.map((r: { id: number }) => r.id);
      expect(ids).toContain(teamCert.id);
      expect(ids).not.toContain(outsideCert.id);
      expect(ids).not.toContain(outsidePendingId);
    });

    it('pesquisar o certificado de fora da equipa não o encontra', async () => {
      const res = await request(http())
        .get('/certificates/admin/list')
        .query({ search: `Fora da equipa ${stamp}` })
        .set(as(managerToken))
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('a visão geral conta só a equipa', async () => {
      const inDb = await prisma.certificate.count({
        where: { userId: employeeId, deletedAt: null },
      });
      const res = await request(http())
        .get('/certificates/admin/overview')
        .set(as(managerToken))
        .expect(200);
      expect(res.body.total).toBe(inDb);
    });

    it('o resumo da equipa mostra o subordinado e a obrigatória em curso', async () => {
      const res = await request(http())
        .get('/certificates/team/summary')
        .set(as(managerToken))
        .expect(200);
      expect(res.body.totals.members).toBe(1);
      const me = res.body.members[0];
      expect(me.userId).toBe(employeeId);
      expect(me.active).toBeGreaterThanOrEqual(1);
      expect(me.mandatoryPending).toBe(1);
      expect(me.inProgress).toBeGreaterThanOrEqual(1);
    });

    it('RH precisa de indicar o departamento (400 sem ele)', async () => {
      await request(http()).get('/certificates/team/summary').set(as(rhToken)).expect(400);
    });

    it('aprova o certificado pendente de um subordinado → 201', async () => {
      await request(http())
        .post(`/certificates/${teamPendingId}/approve`)
        .set(as(managerToken))
        .expect(201);
    });

    it('aprovar o de fora da equipa → 404; o RH aprova → 201', async () => {
      await request(http())
        .post(`/certificates/${outsidePendingId}/approve`)
        .set(as(managerToken))
        .expect(404);
      expect(
        (await prisma.certificate.findUnique({ where: { id: outsidePendingId } }))!.status,
      ).toBe('PENDING_APPROVAL');
      await request(http())
        .post(`/certificates/${outsidePendingId}/approve`)
        .set(as(rhToken))
        .expect(201);
    });

    it('o auditor lê mas continua sem poder aprovar', async () => {
      await request(http()).get('/certificates/admin/list').set(as(auditorToken)).expect(200);
      await request(http())
        .post(`/certificates/${teamPendingId}/approve`)
        .set(as(auditorToken))
        .expect(403);
    });
  });

  describe('exportações', () => {
    it('RH: CSV com BOM e o certificado emitido', async () => {
      const res = await getBin(
        `/certificates/admin/export?format=csv&courseId=${courseMain}`,
        rhToken,
      ).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/certificados-\d{4}-\d{2}-\d{2}\.csv/);
      const text = (res.body as Buffer).toString('utf8');
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text).toContain(teamCert.validationCode);
      expect(text).toContain(outsideCert.validationCode);
    });

    it('XLSX começa por PK e PDF por %PDF-', async () => {
      const x = await getBin('/certificates/admin/export?format=xlsx', rhToken).expect(200);
      expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
      const p = await getBin('/certificates/admin/export?format=pdf', rhToken).expect(200);
      expect((p.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('formato inválido → 400', async () => {
      await request(http())
        .get('/certificates/admin/export?format=zip')
        .set(as(rhToken))
        .expect(400);
    });

    it('a exportação do gestor só tem a equipa', async () => {
      const res = await getBin(
        `/certificates/admin/export?format=csv&courseId=${courseMain}`,
        managerToken,
      ).expect(200);
      const text = (res.body as Buffer).toString('utf8');
      expect(text).toContain(teamCert.validationCode);
      expect(text).not.toContain(outsideCert.validationCode);
    });

    it('a exportação fica auditada', async () => {
      const res = await request(http())
        .get('/certificates/admin/history')
        .set(as(rhToken))
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const logs = await prisma.auditLog.count({
        where: { entity: 'Certificate', action: 'CERTIFICATE_EXPORTED' },
      });
      expect(logs).toBeGreaterThanOrEqual(1);
    });
  });

  describe('área pessoal do colaborador', () => {
    it('a lista traz a ligação de verificação e o LinkedIn oficial só no certificado válido', async () => {
      const res = await request(http()).get('/certificates/my').set(as(employeeToken)).expect(200);
      const mine = res.body.find((c: { id: number }) => c.id === teamCert.id);
      expect(mine.verifyUrl).toMatch(new RegExp(`/verify/${teamCert.validationCode}$`));
      expect(mine.linkedInUrl).toContain('startTask=CERTIFICATION_NAME');
    });

    it('o resumo mostra a obrigatória em curso e não mostra a concluída', async () => {
      const res = await request(http())
        .get('/certificates/my/summary')
        .set(as(employeeToken))
        .expect(200);
      const titles = res.body.mandatoryMissing.map((m: { title: string }) => m.title);
      expect(titles).toContain('Curso Escopo ObrigAberta');
      expect(titles).not.toContain('Curso Escopo ObrigConcluida');
      expect(typeof res.body.emailEnabled).toBe('boolean');
    });

    it('enviar por e-mail o certificado de outra pessoa → 404', async () => {
      await request(http())
        .post(`/certificates/${outsideCert.id}/email-me`)
        .set(as(employeeToken))
        .expect(404);
    });

    it('enviar por e-mail o próprio: 409 se o SMTP não estiver configurado, senão 201', async () => {
      const summary = await request(http())
        .get('/certificates/my/summary')
        .set(as(employeeToken))
        .expect(200);
      const res = await request(http())
        .post(`/certificates/${teamCert.id}/email-me`)
        .set(as(employeeToken));
      // SMTP configurado mas inoperante no ambiente de teste → 502 (nunca um 500 genérico).
      const expected = summary.body.emailEnabled ? [201, 502] : [409];
      expect(expected).toContain(res.status);
    });
  });
});
