import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('Badges & Milestones Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let adminToken: string;
  let rhToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    adminToken = await getToken(app.getHttpServer(), 'admin');
    rhToken = await getToken(app.getHttpServer(), 'rh');
  });

  afterAll(async () => await app.close());

  describe('GET /history/milestones/me', () => {
    it('deve retornar milestones do utilizador (badges, certificados, promoções) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/milestones/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/history/milestones/me').expect(401);
    });
  });

  describe('GET /history/timeline/me', () => {
    it('deve retornar timeline pessoal (inclui badges) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/timeline/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/history/timeline/me').expect(401);
    });
  });

  describe('GET /history/stats/me', () => {
    it('deve retornar estatísticas pessoais → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/stats/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });

  describe('GET /history/milestones/user/:userId (Admin/RH)', () => {
    it('admin pode ver milestones de outro utilizador → 200', async () => {
      await request(app.getHttpServer())
        .get('/history/milestones/user/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('employee sem permissão → 403', async () => {
      await request(app.getHttpServer())
        .get('/history/milestones/user/1')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/history/milestones/user/1').expect(401);
    });
  });

  describe('GET /history (Admin — Audit Log)', () => {
    it('admin pode ver audit log → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/history')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('employee sem permissão → 403', async () => {
      await request(app.getHttpServer())
        .get('/history')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });
});
