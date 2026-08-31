import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

// 1x1 PNG transparente — data URL válida e pequena.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=';

describe('Users Avatar Integration', () => {
  let app: NestExpressApplication;
  let token: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication<NestExpressApplication>();
    // Espelha src/main.ts (convenção deste repo — ver users.integration-spec.ts).
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useBodyParser('json', { limit: '1mb' });
    await app.init();

    token = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => {
    // Repõe o estado: o utilizador de teste 'employee' não deve ficar com avatar.
    await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`);
    await app.close();
  });

  it('PATCH define o avatar e GET /auth/me devolve-o', async () => {
    const patch = await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: TINY_PNG })
      .expect(200);
    expect(patch.body.avatarUrl).toBe(TINY_PNG);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.avatarUrl).toBe(TINY_PNG);
  });

  it('DELETE remove o avatar e GET /auth/me devolve null', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: TINY_PNG })
      .expect(200);

    await request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.avatarUrl).toBeNull();
  });

  it('recusa uma URL https (não é data URL de imagem) → 400', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'https://evil.example/x.png' })
      .expect(400);
  });

  it('recusa data URL svg → 400', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
      .expect(400);
  });

  it('aceita um payload grande (~120 KB) válido → 200 (body parser não dá 413)', async () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(120_000);
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: big })
      .expect(200);
  });

  it('recusa um payload acima de 200 000 caracteres → 400 (MaxLength)', async () => {
    const tooBig = 'data:image/png;base64,' + 'A'.repeat(210_000);
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: tooBig })
      .expect(400);
  });

  it('sem token → 401', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/avatar')
      .send({ avatarUrl: TINY_PNG })
      .expect(401);
  });
});
