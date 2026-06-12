import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('PDI (Development Plans) Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let adminToken: string;
  let planId: number;

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

  describe('GET /development-plans/my', () => {
    it('deve retornar planos do utilizador autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/development-plans/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(Array.isArray(res.body) || res.body.data !== undefined || res.body.plans !== undefined).toBe(true);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/development-plans/my').expect(401);
    });
  });

  describe('GET /development-plans/my/stats', () => {
    it('deve retornar estatísticas do utilizador → 200', async () => {
      await request(app.getHttpServer())
        .get('/development-plans/my/stats')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/development-plans/my/stats').expect(401);
    });
  });

  describe('GET /development-plans/team/dashboard', () => {
    it('admin pode ver dashboard de equipa → 200', async () => {
      await request(app.getHttpServer())
        .get('/development-plans/team/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('employee sem permissão → 403', async () => {
      await request(app.getHttpServer())
        .get('/development-plans/team/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('POST /development-plans', () => {
    it('admin pode criar plano de desenvolvimento → 201', async () => {
      // Endpoint é @Roles('ADMIN','RH','GESTOR') e o DTO exige name, goal e
      // userId (não title/description) — plano criado para o employee
      const employeeId = Number(
        JSON.parse(
          Buffer.from(employeeToken.split('.')[1], 'base64').toString(),
        ).sub,
      );

      const res = await request(app.getHttpServer())
        .post('/development-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Plano Teste Integração',
          goal: 'Plano para testes de integração',
          userId: employeeId,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      planId = res.body.id;
    });

    it('employee sem permissão → 403', async () => {
      await request(app.getHttpServer())
        .post('/development-plans')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'Plano Teste', goal: 'Objectivo', userId: 1 })
        .expect(403);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/development-plans')
        .send({ title: 'Test' })
        .expect(401);
    });
  });

  describe('GET /development-plans/:id', () => {
    it('deve retornar plano por id → 200', async () => {
      if (!planId) return;
      const res = await request(app.getHttpServer())
        .get(`/development-plans/${planId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', planId);
    });

    it('plano inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/development-plans/999999')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });
});
