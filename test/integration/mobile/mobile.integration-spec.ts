import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Mobile Integration (bug: MobileModule nunca foi registado em app.module.ts — 404 sempre)', () => {
  let app: INestApplication;
  let employeeToken: string;
  let employeeId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let sessionId: number;

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
    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    employeeId = employee!.id;
  });

  afterAll(async () => {
    await prisma.mobileSession.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    await prisma.mobileSyncLog.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  it('sem token → 401 (guard global continua a proteger a rota)', async () => {
    await request(app.getHttpServer()).post('/mobile/session').send({}).expect(401);
  });

  it('POST /mobile/session sem deviceId → 400 (bug: sem DTO, ia direto ao Prisma e 500ava)', async () => {
    await request(app.getHttpServer())
      .post('/mobile/session')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ platform: 'ios' })
      .expect(400);
  });

  it('POST /mobile/session válido → 201, regista sessão real na BD', async () => {
    const res = await request(app.getHttpServer())
      .post('/mobile/session')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ deviceId: 'int-test-device-001', platform: 'android', pushToken: 'tok-abc' })
      .expect(201);
    sessionId = res.body.id;

    const row = await prisma.mobileSession.findUnique({ where: { id: sessionId } });
    expect(row!.userId).toBe(employeeId);
    expect(row!.deviceId).toBe('int-test-device-001');
  });

  it('PATCH /mobile/session/:id/push-token sem pushToken → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/mobile/session/${sessionId}/push-token`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({})
      .expect(400);
  });

  it('PATCH /mobile/session/:id/push-token de outro utilizador → 404 (IDOR fix já existente)', async () => {
    const adminToken = await getToken(app.getHttpServer(), 'admin');
    await request(app.getHttpServer())
      .patch(`/mobile/session/${sessionId}/push-token`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pushToken: 'roubado' })
      .expect(404);
  });

  it('PATCH /mobile/session/:id/push-token válido → 200, actualiza de facto', async () => {
    await request(app.getHttpServer())
      .patch(`/mobile/session/${sessionId}/push-token`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ pushToken: 'tok-novo' })
      .expect(200);

    const row = await prisma.mobileSession.findUnique({ where: { id: sessionId } });
    expect(row!.pushToken).toBe('tok-novo');
  });

  it('POST /mobile/sync-log com status inválido → 400', async () => {
    await request(app.getHttpServer())
      .post('/mobile/sync-log')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ entity: 'enrollment', status: 'MAYBE' })
      .expect(400);
  });

  it('POST /mobile/sync-log válido → 201, regista na BD', async () => {
    await request(app.getHttpServer())
      .post('/mobile/sync-log')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ entity: 'enrollment', status: 'SUCCESS' })
      .expect(201);

    const log = await prisma.mobileSyncLog.findFirst({
      where: { userId: employeeId, entity: 'enrollment' },
    });
    expect(log).toBeTruthy();
  });

  it('GET /mobile/dashboard → 200, agrega enrollments e evaluations do utilizador', async () => {
    const res = await request(app.getHttpServer())
      .get('/mobile/dashboard')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(Array.isArray(res.body.enrollments)).toBe(true);
    expect(Array.isArray(res.body.evaluations)).toBe(true);
  });
});
