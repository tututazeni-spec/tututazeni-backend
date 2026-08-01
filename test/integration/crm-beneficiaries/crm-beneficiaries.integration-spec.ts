import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const BENEFICIARY_NAME = 'Int Test Beneficiary — João Manuel';

describe('CRM Beneficiaries Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let beneficiaryId: string;
  let needId: string;

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
    if (beneficiaryId) {
      await prisma.beneficiaryInteraction
        .deleteMany({ where: { beneficiaryId } })
        .catch(() => undefined);
      await prisma.beneficiaryNeed.deleteMany({ where: { beneficiaryId } }).catch(() => undefined);
      await prisma.beneficiary.deleteMany({ where: { id: beneficiaryId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('CRUD', () => {
    it('colaborador não pode criar beneficiário → 403', async () => {
      await request(app.getHttpServer())
        .post('/crm/beneficiaries')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ type: 'INDIVIDUAL', fullName: BENEFICIARY_NAME })
        .expect(403);
    });

    it('RH cria beneficiário (código gerado automaticamente) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/crm/beneficiaries')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ type: 'INDIVIDUAL', fullName: BENEFICIARY_NAME, province: 'LUANDA' })
        .expect(201);
      beneficiaryId = res.body.id;
      expect(beneficiaryId).toBeDefined();
      expect(res.body.code).toBeTruthy();
    });

    it('GET /crm/beneficiaries — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/crm/beneficiaries')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /crm/beneficiaries — RH lista (paginado) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/beneficiaries')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const items = res.body.data ?? res.body;
      expect(Array.isArray(items) ? items : items.data).toBeDefined();
    });

    it('GET /crm/beneficiaries/:id — detalhe → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/crm/beneficiaries/${beneficiaryId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(beneficiaryId);
    });

    it('GET /crm/beneficiaries/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/crm/beneficiaries/nonexistent-cuid')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('PUT /crm/beneficiaries/:id — actualiza → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/crm/beneficiaries/${beneficiaryId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ notes: 'Contacto inicial feito' })
        .expect(200);
      expect(res.body.notes).toBe('Contacto inicial feito');
    });
  });

  describe('Interacções', () => {
    it('POST /crm/beneficiaries/:id/interactions — adiciona interacção com satisfação → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/crm/beneficiaries/${beneficiaryId}/interactions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          type: 'CALL',
          subject: 'Chamada de acompanhamento',
          description: 'Confirmação de dados de contacto',
          satisfaction: 5,
        })
        .expect(201);
      expect(res.body.beneficiaryId).toBe(beneficiaryId);
    });

    it('GET /crm/beneficiaries/:id/interactions — lista paginada → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/crm/beneficiaries/${beneficiaryId}/interactions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const items = res.body.data ?? res.body;
      expect(items).toBeDefined();
    });

    it('satisfação média do beneficiário foi actualizada', async () => {
      const b = await prisma.beneficiary.findUnique({ where: { id: beneficiaryId } });
      expect(b!.satisfactionAvg).toBe(5);
    });
  });

  describe('Necessidades', () => {
    it('POST /crm/beneficiaries/:id/needs — regista necessidade → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/crm/beneficiaries/${beneficiaryId}/needs`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ category: 'Educação', description: 'Apoio em material escolar', priority: 'HIGH' })
        .expect(201);
      needId = res.body.id;
      expect(res.body.status).toBe('OPEN');
    });

    it('PUT /crm/beneficiaries/needs/:needId/resolve — resolve → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/crm/beneficiaries/needs/${needId}/resolve`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('RESOLVED');
      expect(res.body.resolvedAt).toBeTruthy();
    });

    it('PUT /crm/beneficiaries/needs/:needId/resolve — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .put('/crm/beneficiaries/needs/nonexistent-cuid/resolve')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });
  });

  describe('Dashboard, follow-ups e relatório', () => {
    it('GET /crm/beneficiaries/dashboard — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/beneficiaries/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /crm/beneficiaries/follow-ups — qualquer autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/beneficiaries/follow-ups')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /crm/beneficiaries/report — período → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/crm/beneficiaries/report')
        .query({ start: '2024-01-01', end: '2030-01-01' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Remoção (soft delete)', () => {
    it('DELETE /crm/beneficiaries/:id — RH → 200 e marca INACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/crm/beneficiaries/${beneficiaryId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();

      const b = await prisma.beneficiary.findUnique({ where: { id: beneficiaryId } });
      expect(b!.status).toBe('INACTIVE');
      expect(b!.deletedAt).toBeTruthy();
    });
  });
});
