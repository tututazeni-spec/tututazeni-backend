import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { dataUrl, png } from '../../../src/common/files/file-fixtures';
import { runWithRequestContext } from '../../../src/common/logging/request-context';
import { runWithRls } from '../../../src/common/rls/rls-context';
import { getToken } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
// "MZ" + NUL: cabeçalho de um executável Windows, enviado com prefixo de imagem.
const EXE_AS_PNG = dataUrl('image/png', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]));

describe('Validação do conteúdo dos uploads (Postgres real)', () => {
  let app: NestExpressApplication;
  let token: string;
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  const previousMode = process.env.UPLOAD_VALIDATION_MODE;
  const startedAt = new Date();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    // Espelha o middleware de src/main.ts: sem contexto de pedido o guard não regista o userId.
    app.use((req: Request, _res: Response, next: () => void) => {
      runWithRequestContext({ reqId: (req as Request & { id?: string }).id }, () =>
        runWithRls(next),
      );
    });
    app.useBodyParser('json', { limit: '1mb' });
    await app.init();
    token = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => {
    if (previousMode === undefined) delete process.env.UPLOAD_VALIDATION_MODE;
    else process.env.UPLOAD_VALIDATION_MODE = previousMode;
    await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  // A auditoria passa pela fila 'audit' e pode demorar um pouco a aparecer.
  async function waitForAudit(action: string) {
    for (let i = 0; i < 40; i++) {
      const row = await prisma.auditLog.findFirst({
        where: { entity: 'UploadValidation', action, createdAt: { gte: startedAt } },
        orderBy: { id: 'desc' },
      });
      if (row) return row;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  const putAvatar = (avatarUrl: string) =>
    request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl });

  it('enforce: recusa um executável com prefixo de imagem e regista UPLOAD_REJECTED', async () => {
    process.env.UPLOAD_VALIDATION_MODE = 'enforce';
    const res = await putAvatar(EXE_AS_PNG);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('executável');

    const row = await waitForAudit('UPLOAD_REJECTED');
    expect(row).not.toBeNull();
    expect(row).toMatchObject({ status: 'DENIED', severity: 'HIGH' });
    const meta = JSON.parse(row?.metadata ?? '{}');
    expect(meta).toMatchObject({ policy: 'AVATAR', stage: 'content', enforced: true });
    // A auditoria nunca guarda o conteúdo do ficheiro.
    expect(row?.metadata).not.toContain('data:image');
  });

  it('enforce: uma imagem verdadeira continua a ser aceite', async () => {
    process.env.UPLOAD_VALIDATION_MODE = 'enforce';
    await putAvatar(dataUrl('image/png', png(64, 64))).expect(200);
  });

  it('warn: aceita o mesmo ficheiro e regista UPLOAD_FLAGGED', async () => {
    process.env.UPLOAD_VALIDATION_MODE = 'warn';
    await putAvatar(EXE_AS_PNG).expect(200);

    const row = await waitForAudit('UPLOAD_FLAGGED');
    expect(row).not.toBeNull();
    expect(row).toMatchObject({ status: 'SUCCESS', severity: 'HIGH' });
    expect(JSON.parse(row?.metadata ?? '{}')).toMatchObject({ enforced: false });
  });

  it('warn: tamanho e formato continuam a recusar', async () => {
    process.env.UPLOAD_VALIDATION_MODE = 'warn';
    await putAvatar(dataUrl('image/png', png(10, 10, 160_000))).expect(400);
    await putAvatar('data:image/png;base64,@@@').expect(400);
  });
});
