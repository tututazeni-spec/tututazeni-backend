import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MailService } from '../../../src/mail/mail.service';

const PREFIX = 'inv.test.';
const quiet = async (p: Promise<unknown>): Promise<void> => {
  try {
    await p;
  } catch {
    /* limpeza best-effort */
  }
};
const mailed: { email: string; token: string; days: number }[] = [];

describe('Instructor invites Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Test@1234' })
      .expect(201);
    return res.body.accessToken as string;
  };
  const invite = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/instructor-invites')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendInstructorInvite: jest.fn(
          async (email: string, _n: string, token: string, days: number) => {
            mailed.push({ email, token, days });
          },
        ),
        sendPasswordReset: jest.fn(),
        sendUserInvite: jest.fn(),
        sendNotification: jest.fn(),
      })
      .compile();
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
    prisma = app.get(PrismaService);
    adminToken = await login('int.admin@innova-test.com');
    employeeToken = await login('int.employee@innova-test.com');
  });

  afterAll(async () => {
    // Filhos antes dos pais (InstructorInvite -> User), por userId explícito.
    const users = await prisma.user.findMany({
      where: { email: { startsWith: PREFIX } },
      select: { id: true },
    });
    const ids = users.map(u => u.id);
    await quiet(prisma.instructorInvite.deleteMany({ where: { userId: { in: ids } } }));
    await quiet(prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
    await quiet(prisma.user.deleteMany({ where: { id: { in: ids } } }));
    await app.close();
  });

  it('ADMIN cria convite → 201, utilizador PENDING com validade de 30 dias e e-mail enviado', async () => {
    const res = await invite(adminToken, {
      email: `${PREFIX}a@innova-test.com`,
      fullName: 'Ana Externa',
    }).expect(201);
    const user = await prisma.user.findUnique({
      where: { id: res.body.userId },
      include: { role: true },
    });
    expect(user?.role?.name).toBe('INSTRUCTOR_EXTERNO');
    expect(user?.accountStatus).toBe('PENDING');
    const days = ((user?.accessExpiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(mailed.at(-1)?.email).toBe(`${PREFIX}a@innova-test.com`);
    const stored = await prisma.instructorInvite.findUnique({ where: { id: res.body.inviteId } });
    expect(stored?.tokenHash).not.toBe(mailed.at(-1)?.token);
  });

  it('EMPLOYEE → 403', async () => {
    await invite(employeeToken, {
      email: `${PREFIX}b@innova-test.com`,
      fullName: 'Bia Externa',
    }).expect(403);
  });

  it('e-mail duplicado → 409 e nada novo é criado', async () => {
    await invite(adminToken, {
      email: `${PREFIX}a@innova-test.com`,
      fullName: 'Outra Pessoa',
    }).expect(409);
    await invite(adminToken, { email: 'int.rh@innova-test.com', fullName: 'Outra Pessoa' }).expect(
      409,
    );
    expect(await prisma.user.count({ where: { email: `${PREFIX}a@innova-test.com` } })).toBe(1);
  });

  it('listar, reenviar (revoga o anterior) e revogar', async () => {
    const created = await invite(adminToken, {
      email: `${PREFIX}c@innova-test.com`,
      fullName: 'Carla Externa',
      accessDays: 5,
    }).expect(201);
    const resent = await request(app.getHttpServer())
      .post(`/instructor-invites/${created.body.inviteId}/resend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(resent.body.inviteId).not.toBe(created.body.inviteId);
    const first = await prisma.instructorInvite.findUnique({
      where: { id: created.body.inviteId },
    });
    expect(first?.revokedAt).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get('/instructor-invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const byId = Object.fromEntries(
      list.body.map((i: { id: string; status: string }) => [i.id, i.status]),
    );
    expect(byId[created.body.inviteId]).toBe('REVOKED');
    expect(byId[resent.body.inviteId]).toBe('PENDING');

    await request(app.getHttpServer())
      .post(`/instructor-invites/${resent.body.inviteId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/instructor-invites/${resent.body.inviteId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
