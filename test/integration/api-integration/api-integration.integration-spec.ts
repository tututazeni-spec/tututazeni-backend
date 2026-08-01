import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('API Integration (integrations/api-keys/webhooks) — Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let integrationId: number;

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
    if (integrationId) {
      await prisma.apiIntegrationLog
        .deleteMany({ where: { integrationId } })
        .catch(() => undefined);
      await prisma.integrationConfig
        .deleteMany({ where: { id: integrationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Integrações — CRUD (ADMIN/RH apenas — controller-level @Roles)', () => {
    it('colaborador não pode listar → 403', async () => {
      await request(app.getHttpServer())
        .get('/api-integrations')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH cria integração (tenantId derivado automaticamente) → 201', async () => {
      // NOTA: IntegrationType no DTO (HRIS, ERP, LMS, BI, SSO, MESSAGING, HEALTH,
      // CUSTOM, WEBHOOK...) não corresponde ao enum real no schema.prisma
      // (ERP_HR, MICROSOFT_TEAMS, SLACK, SSO_GOOGLE, SCORM_PROVIDER, XAPI_LRS,
      // BI_TOOL, CUSTOM_WEBHOOK...) — só 'PAYROLL' e 'ATS' existem em ambos.
      // Qualquer outro valor do DTO seria aceite pela validação mas rejeitado
      // pelo Prisma com 500 ("Invalid value for argument type"). Usa-se 'ATS'
      // aqui porque é o único valor que atravessa toda a stack real.
      const res = await request(app.getHttpServer())
        .post('/api-integrations')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Integração de teste',
          type: 'ATS',
          endpoint: 'https://invalid.integration.test.invalid/api',
        })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('tenantId');
      integrationId = res.body.id;
    });

    it('GET /api-integrations — lista com apiKey mascarada → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api-integrations')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((i: any) => i.id === integrationId)).toBe(true);
    });

    it('GET /api-integrations/:id → 200 com logs24h/errorRate', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api-integrations/${integrationId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('logs24h');
      expect(res.body).toHaveProperty('errorRate');
    });

    it('GET /api-integrations/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/api-integrations/999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('PUT /api-integrations/:id — actualiza → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api-integrations/${integrationId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Integração renomeada' })
        .expect(200);
      expect(res.body.name).toBe('Integração renomeada');
    });

    it('PATCH /api-integrations/:id/toggle — alterna active → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api-integrations/${integrationId}/toggle`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.active).toBe(false);
    });

    it('POST /api-integrations/:id/test — endpoint inválido → resultado com success:false', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api-integrations/${integrationId}/test`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.success).toBe(false);
    }, 15000);
  });

  describe('Logs', () => {
    it('GET /api-integrations/logs — todos os logs → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api-integrations/logs')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /api-integrations/:id/logs — logs desta integração incluem o teste de conectividade → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api-integrations/${integrationId}/logs`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('API Keys (modelo apiKey ausente do schema — degrada sem persistência)', () => {
    it('POST /api-integrations/api-keys — devolve a chave em bruto uma única vez → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api-integrations/api-keys')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Chave de teste', scopes: ['read'] })
        .expect(201);
      expect(res.body).toHaveProperty('key');
      expect(res.body.key).toMatch(/^ik_live_/);
    });

    it('GET /api-integrations/api-keys/list — degrada para lista vazia → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api-integrations/api-keys/list')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api-integrations/api-keys/:id/revoke — degrada sem crashar → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api-integrations/api-keys/1/revoke')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('message');
    });

    it('POST /api-integrations/api-keys/:id/rotate — degrada sem crashar → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api-integrations/api-keys/1/rotate')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('key');
    });

    it('POST /api-integrations/api-keys/validate — chave inválida → null', async () => {
      const res = await request(app.getHttpServer())
        .post('/api-integrations/api-keys/validate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ key: 'ik_live_nonexistent' })
        .expect(201);
      // NestJS devolve corpo vazio para um valor `null`; superagent parseia-o como {}.
      expect(res.body).toEqual({});
      expect(res.text).toBe('');
    });
  });

  describe('Webhooks (modelo webhook ausente do schema — degrada sem persistência)', () => {
    it('POST /api-integrations/webhooks — regista sem persistir → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api-integrations/webhooks')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Webhook de teste',
          url: 'https://hooks.example.test/x',
          events: ['course.completed'],
        })
        .expect(201);
      expect(res.body).toBeDefined();
    });

    it('GET /api-integrations/webhooks/list — degrada para lista vazia → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api-integrations/webhooks/list')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('PATCH /api-integrations/webhooks/:id/toggle — degrada sem crashar → 200', async () => {
      await request(app.getHttpServer())
        .patch('/api-integrations/webhooks/1/toggle')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('DELETE /api-integrations/webhooks/:id → 204', async () => {
      await request(app.getHttpServer())
        .delete('/api-integrations/webhooks/1')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(204);
    });

    it('POST /api-integrations/webhooks/trigger — sem subscribers (nenhum webhook real persistido) → 201', async () => {
      // Regressão: TriggerWebhookDto.payload não tinha decorator de validação —
      // com forbidNonWhitelisted (config real de main.ts) isto teria sido
      // rejeitado antes de chegar ao controller. Ver ai-tutor para o mesmo bug.
      const res = await request(app.getHttpServer())
        .post('/api-integrations/webhooks/trigger')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ event: 'course.completed', payload: { courseId: 1, userId: 1 } })
        .expect(201);
      expect(res.body.dispatched).toBe(0);
    });

    it('GET /api-integrations/webhooks/:id/deliveries — degrada para lista vazia → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api-integrations/webhooks/1/deliveries')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Stats', () => {
    it('GET /api-integrations/stats → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api-integrations/stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('integrationHealth');
    });
  });

  describe('Remover integração', () => {
    it('DELETE /api-integrations/:id → 204', async () => {
      await request(app.getHttpServer())
        .delete(`/api-integrations/${integrationId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(204);
    });

    it('DELETE /api-integrations/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/api-integrations/${integrationId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });
  });
});
