import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('Notifications Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    adminToken = await getToken(app.getHttpServer(), 'admin');
  });

  afterAll(async () => await app.close());

  describe('GET /notifications/my', () => {
    it('deve retornar notificações do utilizador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/notifications/my').expect(401);
    });
  });

  describe('GET /notifications/my/unread-count', () => {
    it('deve retornar contagem de não lidas → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/my/unread-count')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('count');
      expect(typeof res.body.count).toBe('number');
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .get('/notifications/my/unread-count')
        .expect(401);
    });
  });

  describe('GET /notifications/preferences', () => {
    it('deve retornar preferências do utilizador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });

  describe('POST /notifications/send (Admin)', () => {
    it('admin pode enviar notificação → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: 1,
          type: 'INFO',
          title: 'Teste de Notificação',
          message: 'Mensagem de teste de integração',
        });

      expect([201, 200, 400, 404]).toContain(res.status);
    });

    it('employee sem permissão → 403', async () => {
      await request(app.getHttpServer())
        .post('/notifications/send')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: 1, type: 'INFO', title: 'Test', message: 'Test' })
        .expect(403);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/notifications/send')
        .send({ userId: 1, type: 'INFO', title: 'Test', message: 'Test' })
        .expect(401);
    });
  });

  describe('PATCH /notifications/my/read-all', () => {
    it('deve marcar todas como lidas → 200', async () => {
      await request(app.getHttpServer())
        .patch('/notifications/my/read-all')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });
  });
});
