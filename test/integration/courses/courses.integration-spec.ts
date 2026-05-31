import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('Courses Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let courseId: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => await app.close());

  describe('GET /courses', () => {
    it('lista cursos com token → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/courses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : res.body.data;
      expect(items).toBeDefined();

      if (items.length > 0) courseId = items[0].id;
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/courses').expect(401);
    });
  });

  describe('GET /courses/:id', () => {
    it('detalhe de curso existente → 200', async () => {
      if (!courseId) return;
      const res = await request(app.getHttpServer())
        .get(`/courses/${courseId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', courseId);
      expect(res.body).toHaveProperty('title');
    });

    it('curso inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/courses/999999')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });
});
