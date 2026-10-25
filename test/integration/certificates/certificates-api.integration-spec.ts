import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Certificates API (Postgres real)', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  let employeeId: number;
  let courseId: number;
  let strictCourseId: number;
  let certId: number;
  let code: string;

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

    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    employeeId = employee!.id;
    const stamp = Date.now();
    const course = await prisma.course.create({
      data: {
        title: 'Curso Certificados API',
        internalCode: `INT-CERT-API-${stamp}`,
        description: 'x',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;
    const strict = await prisma.course.create({
      data: {
        title: 'Curso Nota Mínima',
        internalCode: `INT-CERT-API2-${stamp}`,
        description: 'x',
        status: 'PUBLISHED',
      },
    });
    strictCourseId = strict.id;
    await prisma.enrollment.createMany({
      data: [
        {
          courseId,
          userId: employeeId,
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
        },
        {
          courseId: strictCourseId,
          userId: employeeId,
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
        },
      ],
    });
    await prisma.certificateRule.create({
      data: {
        activityKind: 'COURSE',
        activityId: strictCourseId,
        mode: 'AUTOMATIC',
        criteria: JSON.stringify({ requireFullCompletion: true, minScore: 70 }),
      },
    });
  });

  afterAll(async () => {
    const ids = [courseId, strictCourseId];
    // filhos antes de pais: certificate → rule/enrollment → course
    await prisma.certificate
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.certificateRule
      .deleteMany({ where: { activityId: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.enrollment
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.course
      .deleteMany({ where: { id: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('emissão manual', () => {
    it('colaborador não pode emitir → 403', async () => {
      await request(app.getHttpServer())
        .post('/certificates/issue')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, activityKind: 'COURSE', activityId: courseId })
        .expect(403);
    });

    it('RH emite quando os requisitos estão cumpridos → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/certificates/issue')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, activityKind: 'COURSE', activityId: courseId })
        .expect(201);
      expect(res.body.outcome).toBe('ISSUED');
      certId = res.body.certificate.id;
      code = res.body.certificate.validationCode;
      expect(code).toMatch(/^[0-9A-Z]{16}$/);
    });

    it('segunda emissão devolve o mesmo certificado (EXISTS)', async () => {
      const res = await request(app.getHttpServer())
        .post('/certificates/issue')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, activityKind: 'COURSE', activityId: courseId })
        .expect(201);
      expect(res.body).toMatchObject({ outcome: 'EXISTS', certificate: { id: certId } });
    });

    it('nota em falta com regra minScore → 422 e nada emitido', async () => {
      const res = await request(app.getHttpServer())
        .post('/certificates/issue')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, activityKind: 'COURSE', activityId: strictCourseId })
        .expect(422);
      expect(res.body.message).toEqual(['Nota mínima não atingida']);
      expect(await prisma.certificate.count({ where: { courseId: strictCourseId } })).toBe(0);
    });
  });

  describe('download do PDF (ownership)', () => {
    it('dono → 200 application/pdf', async () => {
      const res = await request(app.getHttpServer())
        .get(`/certificates/${certId}/pdf`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('outro colaborador (gestor sem privilégio) → 404', async () => {
      await request(app.getHttpServer())
        .get(`/certificates/${certId}/pdf`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });

    it('RH → 200', async () => {
      await request(app.getHttpServer())
        .get(`/certificates/${certId}/pdf`)
        .set('Authorization', `Bearer ${rhToken}`)
        .buffer(true)
        .parse(binary)
        .expect(200);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get(`/certificates/${certId}/pdf`).expect(401);
    });
  });

  describe('verificação pública (sem autenticação)', () => {
    it('código válido → ACTIVE, só campos públicos e nome completo', async () => {
      const res = await request(app.getHttpServer())
        .get(`/certificates/verify/${code}`)
        .expect(200);
      expect(res.body).toMatchObject({
        valid: true,
        status: 'ACTIVE',
        title: 'Curso Certificados API',
      });
      expect(res.body.holderName.length).toBeGreaterThan(0);
      for (const forbidden of [
        'userId',
        'id',
        'email',
        'fileUrl',
        'metadata',
        'snapshot',
        'validationCode',
      ]) {
        expect(res.body).not.toHaveProperty(forbidden);
      }
    });

    it('aceita o código em minúsculas', async () => {
      await request(app.getHttpServer())
        .get(`/certificates/verify/${code.toLowerCase()}`)
        .expect(200);
    });

    it('expirado → valid false, EXPIRED', async () => {
      await prisma.certificate.update({
        where: { id: certId },
        data: { expiresAt: new Date(Date.now() - 86_400_000) },
      });
      const res = await request(app.getHttpServer())
        .get(`/certificates/verify/${code}`)
        .expect(200);
      expect(res.body).toMatchObject({ valid: false, status: 'EXPIRED' });
    });

    it('revogado → valid false, REVOKED; PDF indisponível (409)', async () => {
      await prisma.certificate.update({
        where: { id: certId },
        data: { revoked: true, status: 'REVOKED', revokedAt: new Date(), revokeReason: 'teste' },
      });
      const res = await request(app.getHttpServer())
        .get(`/certificates/verify/${code}`)
        .expect(200);
      expect(res.body).toMatchObject({ valid: false, status: 'REVOKED' });
      await request(app.getHttpServer())
        .get(`/certificates/${certId}/pdf`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);
    });

    it.each([["1' OR 1=1"], ['x'.repeat(65)], ['NAOEXISTE1234567']])(
      'código %p → 404',
      async raw => {
        await request(app.getHttpServer())
          .get(`/certificates/verify/${encodeURIComponent(raw)}`)
          .expect(404);
      },
    );
  });
});
