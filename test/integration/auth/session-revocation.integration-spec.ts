import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { INT_CREDENTIALS } from '../helpers/auth.helper';

describe('Revogação de sessão e deny-by-default (integração)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logout invalida o access token já emitido (401 no mesmo token)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(INT_CREDENTIALS.employee);
    if (login.status !== 201) throw new Error(`login ${login.status}: ${JSON.stringify(login.body)}`);
    const token: string = login.body.accessToken;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('COLABORADOR não acede a rota administrativa (403)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send(INT_CREDENTIALS.employee)
      .expect(201);
    await request(app.getHttpServer())
      .get('/settings/organization')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
  });

  it('sem token → 401 em rota protegida', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
