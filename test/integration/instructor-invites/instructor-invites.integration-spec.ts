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
const codes: { email: string; code: string; purpose: string }[] = [];
const alerts: string[] = [];
const resets: { email: string; token: string }[] = [];
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

  const DEVICE_A = '11111111-1111-4111-8111-111111111111';
  const DEVICE_B = '22222222-2222-4222-8222-222222222222';
  const PASS = 'Segura@1234';

  /** Login completo de instrutor externo: 401 com pedido de código → repete com o código do e-mail. */
  const loginExternal = async (email: string, deviceId = DEVICE_A) => {
    const first = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASS, deviceId })
      .expect(401);
    expect(JSON.stringify(first.body)).toContain('EMAIL_CODE_REQUIRED');
    const sent = codes.filter(c => c.email === email).at(-1)!;
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASS, deviceId, emailCode: sent.code })
      .expect(201);
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendInstructorInvite: jest.fn(
          async (email: string, _n: string, token: string, days: number) => {
            mailed.push({ email, token, days });
          },
        ),
        sendLoginCode: jest.fn(async (email: string, _n: string, code: string, purpose: string) => {
          codes.push({ email, code, purpose });
        }),
        sendNewDeviceAlert: jest.fn(async (email: string) => {
          alerts.push(email);
        }),
        sendPasswordReset: jest.fn(async (email: string, token: string) => {
          resets.push({ email, token });
        }),
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
      await loginExternal(email);

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

    it('a política de senhas da organização é aplicada: senha fraca → 400 e o convite continua utilizável', async () => {
      await invite(adminToken, {
        email: `${PREFIX}k@innova-test.com`,
        fullName: 'Kátia Externa',
      }).expect(201);
      const { token } = mailed.at(-1)!;
      await accept(token, 'abcdef').expect(400);
      await accept(token, 'Segura@1234').expect(201);
    });

    it('revogar o convite não pode ser contornado por "esqueci a senha"', async () => {
      const email = `${PREFIX}l@innova-test.com`;
      const created = await invite(adminToken, { email, fullName: 'Luís Externo' }).expect(201);
      await request(app.getHttpServer())
        .post(`/instructor-invites/${created.body.inviteId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const before = resets.length;
      await request(app.getHttpServer()).post('/auth/forgot-password').send({ email });
      expect(resets.length).toBe(before); // nenhum token de recuperação emitido
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Segura@1234' })
        .expect(401);
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
      const loginRes = await loginExternal(email);
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
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${refresh}`])
        .set('Authorization', `Bearer ${refresh}`)
        .expect(401);
      expect(JSON.stringify(refreshRes.body)).toMatch(/expirad|Unauthorized/i);
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
      await loginExternal(email);
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

    it('prolongar uma conta já aceite, expirada e desativada reativa-a', async () => {
      const email = `${PREFIX}i@innova-test.com`;
      const created = await invite(adminToken, { email, fullName: 'Inês Externa' }).expect(201);
      await request(app.getHttpServer())
        .post('/auth/instructor-invite/accept')
        .send({ token: mailed.at(-1)!.token, password: 'Segura@1234' })
        .expect(201);
      await prisma.user.update({
        where: { id: created.body.userId },
        data: { accessExpiresAt: new Date(Date.now() - 1000) },
      });
      await app.get(InstructorAccessExpiryService).runExpiryJob();
      expect((await prisma.user.findUnique({ where: { email } }))?.active).toBe(false);

      await request(app.getHttpServer())
        .patch(`/instructor-invites/users/${created.body.userId}/extend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accessDays: 7 })
        .expect(200);
      const after = await prisma.user.findUnique({ where: { email } });
      expect(after).toMatchObject({ active: true, accountStatus: 'ACTIVE' });
      await new Promise(r => setTimeout(r, 1100));
      await loginExternal(email);
    });

    it('conta por aceitar cujo prazo passou: prolongar + reenviar permite aceitar e entrar', async () => {
      const email = `${PREFIX}j@innova-test.com`;
      const created = await invite(adminToken, { email, fullName: 'Jorge Externo' }).expect(201);
      await prisma.user.update({
        where: { id: created.body.userId },
        data: { accessExpiresAt: new Date(Date.now() - 1000) },
      });
      await app.get(InstructorAccessExpiryService).runExpiryJob();
      expect((await prisma.user.findUnique({ where: { email } }))?.active).toBe(false);

      await request(app.getHttpServer())
        .patch(`/instructor-invites/users/${created.body.userId}/extend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accessDays: 5 })
        .expect(200);
      const pending = await prisma.user.findUnique({ where: { email } });
      expect(pending).toMatchObject({ active: true, accountStatus: 'PENDING' });

      await request(app.getHttpServer())
        .post(`/instructor-invites/${created.body.inviteId}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post('/auth/instructor-invite/accept')
        .send({ token: mailed.at(-1)!.token, password: 'Segura@1234' })
        .expect(201);
      await loginExternal(email);
    });

    it('extend e deactivate só aceitam instrutores externos (404 para outros utilizadores)', async () => {
      const rh = await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } });
      await request(app.getHttpServer())
        .patch(`/instructor-invites/users/${rh!.id}/extend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accessDays: 7 })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/instructor-invites/users/${rh!.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('código por e-mail e dispositivo', () => {
    const activate = async (local: string) => {
      const email = `${PREFIX}${local}@innova-test.com`;
      const created = await invite(adminToken, { email, fullName: `Externo ${local}` }).expect(201);
      await request(app.getHttpServer())
        .post('/auth/instructor-invite/accept')
        .send({ token: mailed.at(-1)!.token, password: PASS })
        .expect(201);
      return { email, userId: created.body.userId as number };
    };
    const attempt = (email: string, extra: object = {}, deviceId = DEVICE_A) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASS, deviceId, ...extra });

    it('login sem código → 401 EMAIL_CODE_REQUIRED, e o código só serve uma vez', async () => {
      const { email } = await activate('m');
      const first = await attempt(email).expect(401);
      expect(first.body.code ?? JSON.stringify(first.body)).toContain('EMAIL_CODE_REQUIRED');
      const code = codes.filter(c => c.email === email).at(-1)!.code;
      expect(code).toMatch(/^\d{6}$/);

      await attempt(email, { emailCode: code }).expect(201);
      // mesmo código outra vez: já foi consumido
      await attempt(email, { emailCode: code }).expect(401);
    });

    it('5 códigos errados queimam o desafio: o certo a seguir também falha', async () => {
      const { email } = await activate('n');
      await attempt(email).expect(401);
      const good = codes.filter(c => c.email === email).at(-1)!.code;
      const wrong = good === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        const r = await attempt(email, { emailCode: wrong }).expect(401);
        expect(JSON.stringify(r.body)).toContain('Código inválido ou expirado');
      }
      await attempt(email, { emailCode: good }).expect(401);
    });

    it('pedido repetido em menos de 60 s não envia segundo e-mail', async () => {
      const { email } = await activate('o');
      await attempt(email).expect(401);
      await attempt(email).expect(401);
      expect(codes.filter(c => c.email === email)).toHaveLength(1);
    });

    it('dispositivo A registado; B pede código de dispositivo novo, regista-se e A deixa de ser confiável', async () => {
      const { email, userId } = await activate('p');
      await loginExternal(email, DEVICE_A); // regista A (NEW_DEVICE)
      expect(codes.filter(c => c.email === email).at(-1)!.purpose).toBe('NEW_DEVICE');

      // A é conhecido: pede código de login normal
      const known = await attempt(email, {}, DEVICE_A).expect(401);
      expect(JSON.stringify(known.body)).toContain('"purpose":"LOGIN"');
      const codeA = codes.filter(c => c.email === email).at(-1)!.code;
      await attempt(email, { emailCode: codeA }, DEVICE_A).expect(201);

      // B é novo: NEW_DEVICE, regista-se, A é revogado e o instrutor é avisado
      await loginExternal(email, DEVICE_B);
      expect(alerts).toContain(email);
      const active = await prisma.trustedDevice.findMany({ where: { userId, revokedAt: null } });
      expect(active).toHaveLength(1);
      const afterA = await attempt(email, {}, DEVICE_A).expect(401);
      expect(JSON.stringify(afterA.body)).toContain('"purpose":"NEW_DEVICE"');
    });

    it('utilizador que não é instrutor externo continua a entrar sem código', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'int.employee@innova-test.com', password: 'Test@1234', deviceId: DEVICE_A })
        .expect(201);
    });
  });
});
