import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const FUNDER_NAME = 'Int Test Funder — Fundação XYZ';

describe('CRM Funders Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let funderId: string;
  let grantId: string;
  let reportId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    rhToken = await getToken(app.getHttpServer(), 'rh');
  });

  afterAll(async () => {
    if (grantId) {
      await prisma.grantDisbursement.deleteMany({ where: { grantId } }).catch(() => undefined);
    }
    if (funderId) {
      await prisma.funderInteraction.deleteMany({ where: { funderId } }).catch(() => undefined);
      await prisma.funderReport.deleteMany({ where: { funderId } }).catch(() => undefined);
    }
    if (grantId) {
      await prisma.fundingGrant.deleteMany({ where: { id: grantId } }).catch(() => undefined);
    }
    if (funderId) {
      await prisma.funder.deleteMany({ where: { id: funderId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('CRUD financiadores', () => {
    it('colaborador não pode criar financiador → 403', async () => {
      await request(app.getHttpServer())
        .post('/crm/funders')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', type: 'NGO' })
        .expect(403);
    });

    it('RH cria financiador (código gerado automaticamente) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/crm/funders')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: FUNDER_NAME, type: 'NGO' })
        .expect(201);
      funderId = res.body.id;
      expect(funderId).toBeDefined();
      expect(res.body.code).toBeTruthy();
    });

    it('GET /crm/funders/:id — detalhe → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/crm/funders/${funderId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(funderId);
    });

    it('PUT /crm/funders/:id — actualiza → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/crm/funders/${funderId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ notes: 'Reunião inicial agendada' })
        .expect(200);
      expect(res.body.notes).toBe('Reunião inicial agendada');
    });
  });

  describe('Grants e desembolsos', () => {
    it('POST /crm/funders/:id/grants — cria grant → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/crm/funders/${funderId}/grants`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Financiamento Programa Educação 2026',
          amount: 100000,
          startDate: '2026-01-01',
        })
        .expect(201);
      grantId = res.body.id;
      expect(res.body.code).toBeTruthy();
      expect(res.body.disbursed).toBe(0);
    });

    it('GET /crm/funders/:id/grants — lista paginada → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/crm/funders/${funderId}/grants`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.some((g: any) => g.id === grantId)).toBe(true);
    });

    it('POST /crm/funders/grants/:grantId/disbursements — regista desembolso → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/crm/funders/grants/${grantId}/disbursements`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ amount: 25000, receivedAt: '2026-02-01' })
        .expect(201);
      expect(res.body.grantId).toBe(grantId);

      const grant = await prisma.fundingGrant.findUnique({ where: { id: grantId } });
      expect(grant!.disbursed).toBe(25000);
    });

    it('POST /crm/funders/grants/:grantId/disbursements — excede o valor do grant → 400', async () => {
      await request(app.getHttpServer())
        .post(`/crm/funders/grants/${grantId}/disbursements`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ amount: 999999, receivedAt: '2026-02-02' })
        .expect(400);
    });

    it('GET /crm/funders/grants/:grantId/disbursements — lista paginada → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/crm/funders/grants/${grantId}/disbursements`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('financiador reflecte totais actualizados', async () => {
      const funder = await prisma.funder.findUnique({ where: { id: funderId } });
      expect(funder!.totalReceived).toBe(25000);
    });

    it('PUT /crm/funders/grants/:grantId/status — actualiza estado → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/crm/funders/grants/${grantId}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(res.body.status).toBe('SUSPENDED');
    });
  });

  describe('Interacções e relatórios', () => {
    it('POST /crm/funders/:id/interactions — adiciona interacção → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/crm/funders/${funderId}/interactions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          type: 'MEETING',
          subject: 'Reunião de acompanhamento',
          description: 'Ponto de situação do programa',
          satisfaction: 4,
        })
        .expect(201);
      expect(res.body.funderId).toBe(funderId);
    });

    it('POST /crm/funders/:id/reports — cria relatório → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/crm/funders/${funderId}/reports`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Relatório trimestral', period: '2026-Q1', dueDate: '2026-04-15' })
        .expect(201);
      reportId = res.body.id;
      expect(res.body.status).toBe('PENDING');
    });

    it('PUT /crm/funders/reports/:reportId/submit — submete com ficheiro → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/crm/funders/reports/${reportId}/submit`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ fileUrl: 'https://ci.innova.test/relatorio.pdf' })
        .expect(200);
      expect(res.body.status).toBe('SUBMITTED');
      expect(res.body.submittedAt).toBeTruthy();
    });

    it('PUT /crm/funders/reports/:reportId/submit — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .put('/crm/funders/reports/nonexistent-cuid/submit')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ fileUrl: 'https://ci.innova.test/x.pdf' })
        .expect(404);
    });
  });

  describe('Dashboard e relatórios agregados', () => {
    it('GET /crm/funders/dashboard — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/funders/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /crm/funders/overdue-reports — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/funders/overdue-reports')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /crm/funders/report — período → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/funders/report')
        .query({ start: '2024-01-01', end: '2030-01-01' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Remoção (soft delete)', () => {
    it('DELETE /crm/funders/:id — RH → 200 e marca INACTIVE', async () => {
      await request(app.getHttpServer())
        .delete(`/crm/funders/${funderId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const f = await prisma.funder.findUnique({ where: { id: funderId } });
      expect(f!.status).toBe('INACTIVE');
      expect(f!.deletedAt).toBeTruthy();
    });
  });
});
