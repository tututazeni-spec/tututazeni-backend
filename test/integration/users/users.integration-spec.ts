import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('Users Integration', () => {
  let app: INestApplication;
  let rhToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    rhToken = await getToken(app.getHttpServer(), 'rh');
    employeeToken = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => await app.close());

  describe('GET /users', () => {
    it('RH lista utilizadores → 200 com fullName', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : res.body.data;
      if (items?.length > 0) {
        // REGRA: campo fullName (nunca name)
        expect(items[0]).toHaveProperty('fullName');
        expect(items[0]).not.toHaveProperty('name');
      }
    });

    it('Employee não pode listar utilizadores → 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });
  });
});
