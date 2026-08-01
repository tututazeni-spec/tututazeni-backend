import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const PARTNER_NAME = 'Int Test Partner — TechCorp';

describe('CRM Partners Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let partnerId: string;
  let milestoneId: string;

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
    if (partnerId) {
      await prisma.partnerInteraction.deleteMany({ where: { partnerId } }).catch(() => undefined);
      await prisma.partnerMilestone.deleteMany({ where: { partnerId } }).catch(() => undefined);
      await prisma.partner.deleteMany({ where: { id: partnerId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('CRUD', () => {
    it('colaborador não pode criar parceiro → 403', async () => {
      await request(app.getHttpServer())
        .post('/crm/partners')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', type: 'TECHNOLOGY' })
        .expect(403);
    });

    it('RH cria parceiro (código gerado automaticamente) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/crm/partners')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: PARTNER_NAME, type: 'TECHNOLOGY', tier: 'PLATINUM' })
        .expect(201);
      partnerId = res.body.id;
      expect(partnerId).toBeDefined();
      expect(res.body.code).toBeTruthy();
    });

    it('GET /crm/partners/:id — detalhe → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/crm/partners/${partnerId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(partnerId);
    });

    it('PUT /crm/partners/:id — actualiza → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/crm/partners/${partnerId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ notes: 'Contrato em negociação' })
        .expect(200);
      expect(res.body.notes).toBe('Contrato em negociação');
    });
  });

  describe('Interacções', () => {
    it('POST /crm/partners/:id/interactions — adiciona interacção → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/crm/partners/${partnerId}/interactions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          type: 'MEETING',
          subject: 'Reunião de kick-off',
          description: 'Alinhamento de expectativas',
          satisfaction: 4,
        })
        .expect(201);
      expect(res.body.partnerId).toBe(partnerId);
    });

    it('GET /crm/partners/:id/interactions — lista paginada → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/crm/partners/${partnerId}/interactions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const items = res.body.data ?? res.body;
      expect(items).toBeDefined();
    });

    it('satisfação média do parceiro foi actualizada', async () => {
      const p = await prisma.partner.findUnique({ where: { id: partnerId } });
      expect(p!.satisfactionAvg).toBe(4);
    });
  });

  describe('Milestones', () => {
    it('POST /crm/partners/:id/milestones — cria milestone → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/crm/partners/${partnerId}/milestones`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Entrega da fase 1', dueDate: '2026-06-30' })
        .expect(201);
      milestoneId = res.body.id;
      expect(res.body.status).toBe('PENDING');
    });

    it('PUT /crm/partners/milestones/:milestoneId/complete → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/crm/partners/milestones/${milestoneId}/complete`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.completedAt).toBeTruthy();
    });

    it('PUT /crm/partners/milestones/:milestoneId/complete — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .put('/crm/partners/milestones/nonexistent-cuid/complete')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });
  });

  describe('Dashboard e relatórios', () => {
    it('GET /crm/partners/dashboard — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/partners/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /crm/partners/expiring-contracts — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/partners/expiring-contracts')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /crm/partners/overdue-milestones — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/partners/overdue-milestones')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /crm/partners/report — período → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/partners/report')
        .query({ start: '2024-01-01', end: '2030-01-01' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Remoção (soft delete)', () => {
    it('DELETE /crm/partners/:id — RH → 200 e marca INACTIVE', async () => {
      await request(app.getHttpServer())
        .delete(`/crm/partners/${partnerId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const p = await prisma.partner.findUnique({ where: { id: partnerId } });
      expect(p!.status).toBe('INACTIVE');
      expect(p!.deletedAt).toBeTruthy();
    });
  });
});
