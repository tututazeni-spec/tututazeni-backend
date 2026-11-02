import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MailService } from '../../../src/mail/mail.service';
import { InstructorAccessExpiryService } from '../../../src/instructor-invites/instructor-access-expiry.service';

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
    // UserAuditLog tem FK RESTRICT para User (userId e performedById): filhos primeiro.
    await quiet(
      prisma.userAuditLog.deleteMany({
        where: { OR: [{ userId: { in: ids } }, { performedById: { in: ids } }] },
      }),
    );
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

  describe('aceitação do convite', () => {
    const accept = (token: string, password = 'Segura@1234') =>
      request(app.getHttpServer()).post('/auth/instructor-invite/accept').send({ token, password });

    it('antes de aceitar o login falha; depois de aceitar funciona e o link fica inutilizado', async () => {
      const email = `${PREFIX}d@innova-test.com`;
      await invite(adminToken, { email, fullName: 'Duarte Externo' }).expect(201);
      const { token } = mailed.at(-1)!;
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Segura@1234' })
        .expect(401);

      await accept(token).expect(201);
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.accountStatus).toBe('ACTIVE');
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Segura@1234' })
        .expect(201);

      const again = await accept(token).expect(400);
      expect(again.body.message).toBe('Convite inválido ou expirado');
    });

    it('token inexistente e token revogado dão exatamente a mesma resposta', async () => {
      const unknown = await accept('f'.repeat(64)).expect(400);
      const created = await invite(adminToken, {
        email: `${PREFIX}e@innova-test.com`,
        fullName: 'Eva Externa',
      }).expect(201);
      const { token } = mailed.at(-1)!;
      await request(app.getHttpServer())
        .post(`/instructor-invites/${created.body.inviteId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const revoked = await accept(token).expect(400);
      expect(revoked.body.message).toBe(unknown.body.message);
    });

    it('duas aceitações em paralelo: só uma vence', async () => {
      await invite(adminToken, {
        email: `${PREFIX}f@innova-test.com`,
        fullName: 'Filipe Externo',
      }).expect(201);
      const { token } = mailed.at(-1)!;
      const results = await Promise.all([accept(token), accept(token)]);
      expect(results.map(r => r.status).sort()).toEqual([201, 400]);
    });
  });

  describe('validade do acesso', () => {
    it('depois do prazo: pedido com token ainda válido, login e refresh dão 401', async () => {
      const email = `${PREFIX}g@innova-test.com`;
      const created = await invite(adminToken, { email, fullName: 'Gil Externo' }).expect(201);
      await request(app.getHttpServer())
        .post('/auth/instructor-invite/accept')
        .send({ token: mailed.at(-1)!.token, password: 'Segura@1234' })
        .expect(201);
      // O iat do JWT tem resolução de 1 s; o JwtStrategy recusa tokens emitidos antes de passwordChangedAt.
      await new Promise(r => setTimeout(r, 1100));
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Segura@1234' })
        .expect(201);
      const access = loginRes.body.accessToken as string;
      const refresh = loginRes.body.refreshToken as string;

      await prisma.user.update({
        where: { id: created.body.userId },
        data: { accessExpiresAt: new Date(Date.now() + 4000) },
      });
      // Dentro do prazo (carrega o utilizador para a cache do JwtStrategy).
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(200);

      await new Promise(r => setTimeout(r, 4300));
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Segura@1234' })
        .expect(401);
      if (refresh) {
        await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', [`refresh_token=${refresh}`])
          .set('Authorization', `Bearer ${refresh}`)
          .expect(401);
      }
    });
  });

  describe('tarefa de expiração', () => {
    it('desativa a conta expirada, revoga as sessões e é idempotente', async () => {
      const email = `${PREFIX}h@innova-test.com`;
      const created = await invite(adminToken, { email, fullName: 'Hugo Externo' }).expect(201);
      await request(app.getHttpServer())
        .post('/auth/instructor-invite/accept')
        .send({ token: mailed.at(-1)!.token, password: 'Segura@1234' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Segura@1234' })
        .expect(201);
      await prisma.user.update({
        where: { id: created.body.userId },
        data: { accessExpiresAt: new Date(Date.now() - 1000) },
      });

      const job = app.get(InstructorAccessExpiryService);
      const first = await job.runExpiryJob();
      expect(first.deactivated).toBeGreaterThanOrEqual(1);
      const user = await prisma.user.findUnique({ where: { id: created.body.userId } });
      expect(user).toMatchObject({ active: false, accountStatus: 'INACTIVE' });
      expect(
        await prisma.refreshToken.count({
          where: { userId: created.body.userId, revokedAt: null },
        }),
      ).toBe(0);

      const second = await job.runExpiryJob();
      expect(second.deactivated).toBe(0);
    });

    it('prolongar uma conta já expirada e desativada reativa-a', async () => {
      const row = await prisma.user.findUnique({ where: { email: `${PREFIX}h@innova-test.com` } });
      await request(app.getHttpServer())
        .patch(`/instructor-invites/users/${row!.id}/extend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accessDays: 7 })
        .expect(200);
      const after = await prisma.user.findUnique({ where: { id: row!.id } });
      expect(after).toMatchObject({ active: true, accountStatus: 'ACTIVE' });
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: row!.email, password: 'Segura@1234' })
        .expect(201);
    });
  });
});
