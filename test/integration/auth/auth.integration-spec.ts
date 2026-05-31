import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';

describe('Auth Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => await app.close());

  describe('POST /auth/login', () => {
    it('login com credenciais correctas → 201 + accessToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'int.rh@innova-test.com', password: 'Test@1234' })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.accessToken.length).toBeGreaterThan(20);
    });

    it('password errada → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'int.rh@innova-test.com', password: 'errada' })
        .expect(401);
    });

    it('email inexistente → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nao.existe@innova-test.com', password: 'Test@1234' })
        .expect(401);
    });

    it('body vazio → 400', async () => {
      await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
    });

    it('sem token em rota protegida → 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });
  });
});
