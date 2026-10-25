import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Certificates admin API (Postgres real)', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let auditorToken: string;
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  let employeeId: number;
  let employeeName: string;
  let courseId: number;
  let certId: number;
  const http = () => app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    employeeId = employee!.id;
    employeeName = employee!.fullName;
    const course = await prisma.course.create({
      data: {
        title: 'Curso Certificados Admin',
        internalCode: `INT-CERT-ADM-${Date.now()}`,
        description: 'x',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;
    await prisma.enrollment.create({
      data: {
        courseId,
        userId: employeeId,
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
      },
    });
    const res = await request(http())
      .post('/certificates/issue')
      .set(as(rhToken))
      .send({ userId: employeeId, activityKind: 'COURSE', activityId: courseId })
      .expect(201);
    certId = res.body.certificate.id;
  });

  afterAll(async () => {
    // filhos antes de pais: certificate → rule/enrollment → course
    await prisma.certificate.deleteMany({ where: { courseId } }).catch((): undefined => undefined);
    await prisma.certificateRule
      .deleteMany({ where: { activityId: courseId } })
      .catch((): undefined => undefined);
    await prisma.enrollment.deleteMany({ where: { courseId } }).catch((): undefined => undefined);
    await prisma.course.deleteMany({ where: { id: courseId } }).catch((): undefined => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('autorização', () => {
    it.each(['/certificates/admin/history', '/certificates/rules', '/certificates/templates'])(
      'colaborador e gestor → 403 em %s',
      async path => {
        await request(http()).get(path).set(as(employeeToken)).expect(403);
        await request(http()).get(path).set(as(managerToken)).expect(403);
      },
    );

    // O gestor lê visão geral e lista, mas só da sua equipa (ver certificates-scope).
    it.each(['/certificates/admin/overview', '/certificates/admin/list'])(
      'colaborador → 403 e gestor → 200 em %s',
      async path => {
        await request(http()).get(path).set(as(employeeToken)).expect(403);
        await request(http()).get(path).set(as(managerToken)).expect(200);
      },
    );

    it('sem token → 401', async () => {
      await request(http()).get('/certificates/admin/overview').expect(401);
    });

    it('auditor lê (200) mas não escreve regras (403)', async () => {
      await request(http()).get('/certificates/admin/overview').set(as(auditorToken)).expect(200);
      await request(http())
        .put('/certificates/rules')
        .set(as(auditorToken))
        .send({
          activityKind: 'COURSE',
          activityId: courseId,
          mode: 'AUTOMATIC',
          criteria: { minScore: 70 },
        })
        .expect(403);
    });
  });

  describe('visão geral e lista', () => {
    it('overview conta o certificado emitido como ativo', async () => {
      const res = await request(http())
        .get('/certificates/admin/overview')
        .set(as(rhToken))
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.active).toBeGreaterThanOrEqual(1);
      expect(Object.keys(res.body).sort()).toEqual(
        [
          'active',
          'expired',
          'expiringSoon',
          'mandatoryCoveragePct',
          'pendingApproval',
          'revoked',
          'total',
        ].sort(),
      );
    });

    it('pesquisa pelo nome do titular encontra o certificado', async () => {
      const res = await request(http())
        .get('/certificates/admin/list')
        .query({ search: employeeName, courseId })
        .set(as(rhToken))
        .expect(200);
      expect(res.body.data.map((r: { id: number }) => r.id)).toContain(certId);
      expect(res.body.data[0]).toMatchObject({
        title: 'Curso Certificados Admin',
        status: 'ACTIVE',
      });
    });

    it('pesquisa com % e aspas devolve vazio sem erro', async () => {
      const res = await request(http())
        .get('/certificates/admin/list')
        .query({ search: "%' OR 1=1 --" })
        .set(as(rhToken))
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it.each([['limit=1000'], ['limit=-1'], ['page=0'], ['sort=password'], ['status=XYZ']])(
      'parâmetro inválido %s → 400',
      async qs => {
        await request(http()).get(`/certificates/admin/list?${qs}`).set(as(rhToken)).expect(400);
      },
    );

    it('expirado (status gravado ACTIVE) aparece em EXPIRED e não em ACTIVE', async () => {
      await prisma.certificate.update({
        where: { id: certId },
        data: { expiresAt: new Date(Date.now() - 86_400_000) },
      });
      const expired = await request(http())
        .get('/certificates/admin/list')
        .query({ status: 'EXPIRED', courseId })
        .set(as(rhToken))
        .expect(200);
      expect(expired.body.data.map((r: { id: number }) => r.id)).toContain(certId);
      const active = await request(http())
        .get('/certificates/admin/list')
        .query({ status: 'ACTIVE', courseId })
        .set(as(rhToken))
        .expect(200);
      expect(active.body.data).toEqual([]);
    });
  });

  describe('regras', () => {
    const body = (over: Record<string, unknown> = {}) => ({
      activityKind: 'COURSE',
      activityId: courseId,
      mode: 'APPROVAL',
      criteria: { requireFullCompletion: true, minScore: 70 },
      validityDays: 365,
      ...over,
    });

    it('critérios vazios → 400', async () => {
      await request(http())
        .put('/certificates/rules')
        .set(as(rhToken))
        .send(body({ criteria: {} }))
        .expect(400);
    });

    it('minScore 150 → 400 e curso inexistente → 404', async () => {
      await request(http())
        .put('/certificates/rules')
        .set(as(rhToken))
        .send(body({ criteria: { minScore: 150 } }))
        .expect(400);
      await request(http())
        .put('/certificates/rules')
        .set(as(rhToken))
        .send(body({ activityId: 999999999 }))
        .expect(404);
    });

    it('RH grava e a regra aparece em GET /rules com o título do curso', async () => {
      await request(http()).put('/certificates/rules').set(as(rhToken)).send(body()).expect(200);
      const res = await request(http())
        .get('/certificates/rules')
        .set(as(auditorToken))
        .expect(200);
      const rule = res.body.find((r: { activityId: number }) => r.activityId === courseId);
      expect(rule).toMatchObject({
        activityTitle: 'Curso Certificados Admin',
        mode: 'APPROVAL',
        criteria: { requireFullCompletion: true, minScore: 70 },
        validityDays: 365,
        active: true,
      });
    });
  });

  describe('modelos e histórico', () => {
    it('GET /templates não expõe html nem css', async () => {
      const res = await request(http()).get('/certificates/templates').set(as(rhToken)).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const t of res.body) {
        expect(t).not.toHaveProperty('html');
        expect(t).not.toHaveProperty('cssStyle');
      }
    });

    it('histórico do certificado inclui a emissão', async () => {
      const res = await request(http())
        .get('/certificates/admin/history')
        .query({ certificateId: certId })
        .set(as(rhToken))
        .expect(200);
      expect(res.body.data.map((r: { action: string }) => r.action)).toContain(
        'CERTIFICATE_ISSUED',
      );
    });
  });
});
