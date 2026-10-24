import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const PDF_BYTES = Buffer.from('%PDF-1.4\n% integração\n%%EOF\n');
const PDF = `data:application/pdf;base64,${PDF_BYTES.toString('base64')}`;
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Certificates lifecycle API (Postgres real)', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let auditorToken: string;
  let rhToken: string;
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  let employeeId: number;
  let managerId: number;
  let courseRevoke: number;
  let courseMain: number;
  const stamp = Date.now();
  const externalTitle = `Externo Integração ${stamp}`;
  const http = () => app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const issue = async (courseId: number) => {
    const res = await request(http())
      .post('/certificates/issue')
      .set(as(rhToken))
      .send({ userId: employeeId, activityKind: 'COURSE', activityId: courseId })
      .expect(201);
    return res.body.certificate as { id: number; validationCode: string };
  };
  const verify = (code: string) => request(http()).get(`/certificates/verify/${code}`);

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
    auditorToken = await getToken(http(), 'auditor');
    rhToken = await getToken(http(), 'rh');

    employeeId = (await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    }))!.id;
    managerId = (await prisma.user.findUnique({ where: { email: 'int.manager@innova-test.com' } }))!
      .id;
    const mk = (n: string) =>
      prisma.course.create({
        data: {
          title: `Curso Ciclo ${n}`,
          internalCode: `INT-CERT-LC-${n}-${stamp}`,
          description: 'x',
          status: 'PUBLISHED',
        },
      });
    courseRevoke = (await mk('R')).id;
    courseMain = (await mk('M')).id;
    const done = { status: 'COMPLETED' as const, progress: 100, completedAt: new Date() };
    await prisma.enrollment.createMany({
      data: [
        { courseId: courseRevoke, userId: employeeId, ...done },
        { courseId: courseMain, userId: employeeId, ...done },
        { courseId: courseMain, userId: managerId, ...done },
      ],
    });
  });

  afterAll(async () => {
    const ids = [courseRevoke, courseMain];
    // filhos antes de pais: certificate (reemissão → original) → enrollment → course
    await prisma.certificate
      .deleteMany({ where: { replacesId: { not: null }, courseId: { in: ids } } })
      .catch(() => undefined);
    await prisma.certificate
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch(() => undefined);
    await prisma.certificate.deleteMany({ where: { title: externalTitle } }).catch(() => undefined);
    await prisma.enrollment.deleteMany({ where: { courseId: { in: ids } } }).catch(() => undefined);
    await prisma.course.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('autorização', () => {
    it.each([
      ['post', '/certificates/1/revoke', { reason: 'motivo' }],
      ['post', '/certificates/1/reissue', { reason: 'motivo' }],
      ['post', '/certificates/1/resend', {}],
      ['post', '/certificates/external', {}],
      ['post', '/certificates/issue-batch', {}],
    ] as const)('colaborador, gestor e auditor → 403 em %s %s', async (_m, path, body) => {
      for (const t of [employeeToken, managerToken, auditorToken]) {
        await request(http()).post(path).set(as(t)).send(body).expect(403);
      }
    });
  });

  describe('revogação', () => {
    let cert: { id: number; validationCode: string };

    it('sem motivo → 400 e continua válido', async () => {
      cert = await issue(courseRevoke);
      await request(http())
        .post(`/certificates/${cert.id}/revoke`)
        .set(as(rhToken))
        .send({})
        .expect(400);
      expect((await verify(cert.validationCode).expect(200)).body.status).toBe('ACTIVE');
    });

    it('com motivo → revogado e a verificação pública mostra REVOKED', async () => {
      await request(http())
        .post(`/certificates/${cert.id}/revoke`)
        .set(as(rhToken))
        .send({ reason: 'Fraude comprovada' })
        .expect(201);
      expect((await verify(cert.validationCode).expect(200)).body).toMatchObject({
        valid: false,
        status: 'REVOKED',
      });
      const stored = await prisma.certificate.findUnique({ where: { id: cert.id } });
      expect(stored).toMatchObject({
        revoked: true,
        status: 'REVOKED',
        revokeReason: 'Fraude comprovada',
      });
    });

    it('revogar de novo → 409 e o motivo original mantém-se', async () => {
      await request(http())
        .post(`/certificates/${cert.id}/revoke`)
        .set(as(rhToken))
        .send({ reason: 'Outro motivo' })
        .expect(409);
      expect((await prisma.certificate.findUnique({ where: { id: cert.id } }))!.revokeReason).toBe(
        'Fraude comprovada',
      );
    });

    it('certificado inexistente → 404', async () => {
      await request(http())
        .post('/certificates/999999999/revoke')
        .set(as(rhToken))
        .send({ reason: 'motivo' })
        .expect(404);
    });
  });

  describe('reenvio, reemissão e lote', () => {
    let original: { id: number; validationCode: string };
    let replacementId: number;

    it('reenviar certificado válido → notificado', async () => {
      original = await issue(courseMain);
      const res = await request(http())
        .post(`/certificates/${original.id}/resend`)
        .set(as(rhToken))
        .expect(201);
      expect(res.body.notified).toBe(true);
    });

    it('reemitir sem motivo → 400', async () => {
      await request(http())
        .post(`/certificates/${original.id}/reissue`)
        .set(as(rhToken))
        .send({})
        .expect(400);
    });

    it('reemitir → o antigo fica REVOGADO, o novo ACTIVE e ambos aparecem na lista', async () => {
      const res = await request(http())
        .post(`/certificates/${original.id}/reissue`)
        .set(as(rhToken))
        .send({ reason: 'Correcção do nome' })
        .expect(201);
      replacementId = res.body.replacement.id;
      const newCode: string = res.body.replacement.validationCode;
      expect(newCode).not.toBe(original.validationCode);

      expect((await verify(original.validationCode).expect(200)).body).toMatchObject({
        valid: false,
        status: 'REVOKED',
      });
      expect((await verify(newCode).expect(200)).body).toMatchObject({
        valid: true,
        status: 'ACTIVE',
      });

      const list = await request(http())
        .get('/certificates/admin/list')
        .query({ courseId: courseMain })
        .set(as(rhToken))
        .expect(200);
      const ids = list.body.data.map((r: { id: number }) => r.id);
      expect(ids).toEqual(expect.arrayContaining([original.id, replacementId]));

      const stored = await prisma.certificate.findUnique({ where: { id: replacementId } });
      expect(stored).toMatchObject({ replacesId: original.id, cycleKey: '2' });
    });

    it('o histórico regista a reemissão', async () => {
      const res = await request(http())
        .get('/certificates/admin/history')
        .query({ certificateId: replacementId })
        .set(as(rhToken))
        .expect(200);
      expect(res.body.data.map((r: { action: string }) => r.action)).toContain(
        'CERTIFICATE_REISSUED',
      );
    });

    it('reemitir o certificado já revogado → 409', async () => {
      await request(http())
        .post(`/certificates/${original.id}/reissue`)
        .set(as(rhToken))
        .send({ reason: 'outra vez' })
        .expect(409);
    });

    it('reenviar um revogado → 409', async () => {
      await request(http())
        .post(`/certificates/${original.id}/resend`)
        .set(as(rhToken))
        .expect(409);
    });

    it('lote misto: 1 emitido, 1 já existente, 1 falha, sem perder os emitidos', async () => {
      const res = await request(http())
        .post('/certificates/issue-batch')
        .set(as(rhToken))
        .send({
          activityKind: 'COURSE',
          activityId: courseMain,
          userIds: [employeeId, managerId, 999999999],
        })
        .expect(201);
      expect(res.body).toMatchObject({ total: 3, issued: 1, existing: 1, failed: 1 });
      const byUser = Object.fromEntries(
        res.body.results.map((r: { userId: number }) => [r.userId, r]),
      );
      expect(byUser[managerId].outcome).toBe('ISSUED');
      expect(byUser[employeeId].outcome).toBe('EXISTS');
      expect(
        await prisma.certificate.count({ where: { courseId: courseMain, userId: managerId } }),
      ).toBe(1);
    });

    it('lote sem titulares ou com ambos os modos → 400', async () => {
      const base = { activityKind: 'COURSE', activityId: courseMain };
      await request(http())
        .post('/certificates/issue-batch')
        .set(as(rhToken))
        .send({ ...base, userIds: [] })
        .expect(400);
      await request(http())
        .post('/certificates/issue-batch')
        .set(as(rhToken))
        .send(base)
        .expect(400);
      await request(http())
        .post('/certificates/issue-batch')
        .set(as(rhToken))
        .send({ ...base, userIds: [employeeId], allEligible: true })
        .expect(400);
    });
  });

  describe('importação externa', () => {
    const body = (over: Record<string, unknown> = {}) => ({
      userId: employeeId,
      title: externalTitle,
      issuerName: 'Cruz Vermelha',
      completedAt: '2026-03-01',
      expiresAt: '2030-03-01',
      hours: 12,
      document: PDF,
      ...over,
    });
    let id: number;
    let code: string;

    it('imagem (PNG) → 400', async () => {
      await request(http())
        .post('/certificates/external')
        .set(as(rhToken))
        .send(body({ document: PNG }))
        .expect(400);
    });

    it('titular inexistente → 404 e validade antes da conclusão → 400', async () => {
      await request(http())
        .post('/certificates/external')
        .set(as(rhToken))
        .send(body({ userId: 999999999 }))
        .expect(404);
      await request(http())
        .post('/certificates/external')
        .set(as(rhToken))
        .send(body({ expiresAt: '2025-01-01' }))
        .expect(400);
    });

    it('importa e fica a aguardar validação; repetir devolve o mesmo registo', async () => {
      const res = await request(http())
        .post('/certificates/external')
        .set(as(rhToken))
        .send(body())
        .expect(201);
      expect(res.body).toMatchObject({ outcome: 'IMPORTED' });
      id = res.body.certificate.id;
      code = res.body.certificate.validationCode;
      expect(res.body.certificate.status).toBe('PENDING_APPROVAL');

      const again = await request(http())
        .post('/certificates/external')
        .set(as(rhToken))
        .send(body())
        .expect(201);
      expect(again.body).toMatchObject({ outcome: 'EXISTS', certificate: { id } });
    });

    it('antes de validado a verificação pública não o mostra (404)', async () => {
      await verify(code).expect(404);
    });

    it('depois de aprovado a verificação diz que é externo e de quem', async () => {
      await request(http()).post(`/certificates/${id}/approve`).set(as(rhToken)).expect(201);
      expect((await verify(code).expect(200)).body).toMatchObject({
        valid: true,
        origin: 'EXTERNAL',
        issuerName: 'Cruz Vermelha',
        title: externalTitle,
      });
    });

    it('o titular descarrega o PDF carregado, byte a byte', async () => {
      const res = await request(http())
        .get(`/certificates/${id}/pdf`)
        .set(as(employeeToken))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);
    });

    it('a lista do colaborador não devolve o documento', async () => {
      const res = await request(http()).get('/certificates/my').set(as(employeeToken)).expect(200);
      const mine = res.body.find((c: { id: number }) => c.id === id);
      expect(mine).toMatchObject({ origin: 'EXTERNAL' });
      expect(mine).not.toHaveProperty('fileUrl');
    });

    it('reemitir um externo → 409', async () => {
      await request(http())
        .post(`/certificates/${id}/reissue`)
        .set(as(rhToken))
        .send({ reason: 'tentativa' })
        .expect(409);
    });
  });
});
