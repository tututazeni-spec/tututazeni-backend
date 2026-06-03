import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('Attendance Integration', () => {
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

  describe('GET /attendance/my', () => {
    it('deve retornar presenças do utilizador autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/attendance/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body).toHaveProperty('records');
      expect(res.body).toHaveProperty('summary');
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/attendance/my').expect(401);
    });
  });

  describe('GET /attendance/my/leave-balance', () => {
    it('deve retornar saldo de licenças → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/attendance/my/leave-balance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/attendance/my/leave-balance').expect(401);
    });
  });

  describe('GET /attendance/my/overtime', () => {
    it('deve retornar banco de horas → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/attendance/my/overtime')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalHours');
    });
  });

  describe('GET /attendance (Admin)', () => {
    it('admin pode listar todas as presenças → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
    });

    it('employee sem permissão → 403', async () => {
      await request(app.getHttpServer())
        .get('/attendance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('GET /attendance/dashboard (Admin)', () => {
    it('admin pode ver dashboard → 200', async () => {
      await request(app.getHttpServer())
        .get('/attendance/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('employee sem permissão → 403', async () => {
      await request(app.getHttpServer())
        .get('/attendance/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/attendance/dashboard').expect(401);
    });
  });

  describe('POST /attendance/leaves', () => {
    it('employee pode solicitar licença → 201', async () => {
      const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const futureEnd = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const res = await request(app.getHttpServer())
        .post('/attendance/leaves')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          type: 'VACATION',
          startDate: futureStart,
          endDate: futureEnd,
          reason: 'Férias de integração teste',
        });

      expect([201, 409]).toContain(res.status);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/attendance/leaves')
        .send({ type: 'VACATION', startDate: '2026-07-01', endDate: '2026-07-05' })
        .expect(401);
    });
  });
});
