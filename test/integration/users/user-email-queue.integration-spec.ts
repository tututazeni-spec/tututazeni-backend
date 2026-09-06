import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const INVITE_EMAIL = 'int.users.emailqueue@innova-test.com';

// Fase J J-c: POST /users/invite deixa de enviar o email de forma síncrona
// (que impedia a criação do utilizador quando o SMTP estava em baixo) — o
// utilizador é criado e o convite vai para a fila Bull `email` + EmailProcessor.
describe('User invite email → fila `email` — Integration', () => {
  let app: INestApplication;
  let rhToken: string;
  let emailQueue: Queue;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = new PrismaClient({ adapter } as any);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    rhToken = await getToken(app.getHttpServer(), 'rh');
    emailQueue = app.get<Queue>(getQueueToken('email'));
    await emailQueue.empty().catch(() => undefined);
  });

  afterAll(async () => {
    // Não deixar jobs (retries com backoff) pendentes na fila partilhada.
    await emailQueue.empty().catch(() => undefined);
    await Promise.all(
      (['failed', 'delayed', 'wait', 'completed'] as const).map(t =>
        emailQueue.clean(0, t).catch(() => undefined),
      ),
    );

    const stale = await prisma.user.findUnique({ where: { email: INVITE_EMAIL } });
    if (stale) {
      await prisma.notificationLog
        .deleteMany({ where: { userId: stale.id } })
        .catch(() => undefined);
      await prisma.userAuditLog
        .deleteMany({ where: { OR: [{ userId: stale.id }, { performedById: stale.id }] } })
        .catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: INVITE_EMAIL } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  it('cria o utilizador e enfileira um job "userInvite" que o EmailProcessor consome (a criação não depende do envio)', async () => {
    // O EmailProcessor pega no job independentemente de o envio ter sucesso —
    // no ambiente de teste o SMTP recusa auth, o que é exactamente o cenário
    // que a Fase J protege: o utilizador tem de ser criado à mesma.
    const picked = new Promise<{ name: string; email: string }>(resolve => {
      const onEvent = (job: { name: string; data?: { email?: string } }) => {
        if (job?.name === 'userInvite' && job.data?.email === INVITE_EMAIL) {
          resolve({ name: job.name, email: job.data.email });
        }
      };
      emailQueue.on('completed', onEvent);
      emailQueue.on('failed', onEvent);
    });

    const res = await request(app.getHttpServer())
      .post('/users/invite')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ email: INVITE_EMAIL, fullName: 'Convidada Fila Email' })
      .expect(201);

    expect(res.body).toHaveProperty('userId');

    // O utilizador foi criado, independentemente do resultado do envio do email.
    const created = await prisma.user.findUnique({ where: { email: INVITE_EMAIL } });
    expect(created).not.toBeNull();

    const job = await Promise.race([
      picked,
      new Promise<null>(r => setTimeout(() => r(null), 15000)),
    ]);
    expect(job).not.toBeNull();
    expect(job!.email).toBe(INVITE_EMAIL);
  });
});
