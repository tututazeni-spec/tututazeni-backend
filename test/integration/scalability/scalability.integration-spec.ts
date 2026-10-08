import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Scalability Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let auditorToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let tenantId: string;
  let integrationId: number;
  let ruleId: number;
  let alertId: string;

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
    managerToken = await getToken(app.getHttpServer(), 'manager');
    rhToken = await getToken(app.getHttpServer(), 'rh');
    adminToken = await getToken(app.getHttpServer(), 'admin');
    auditorToken = await getToken(app.getHttpServer(), 'auditor');
  });

  afterAll(async () => {
    if (alertId) await prisma.systemAlert.deleteMany({ where: { id: alertId } }).catch(() => {});
    if (ruleId) {
      await prisma.automationExecution.deleteMany({ where: { ruleId } }).catch(() => undefined);
      await prisma.automationRule.deleteMany({ where: { id: ruleId } }).catch(() => undefined);
    }
    if (integrationId) {
      await prisma.integrationSyncLog
        .deleteMany({ where: { integrationId } })
        .catch(() => undefined);
      await prisma.integrationConfig
        .deleteMany({ where: { id: integrationId } })
        .catch(() => undefined);
    }
    if (tenantId) {
      await prisma.scalabilityMetric.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.slaConfig.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.contentDeliveryConfig.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenantConfig.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Registo do módulo e RBAC (bug: ScalabilityModule nunca estava importado em app.module.ts)', () => {
    it('sem token → 401 (rota existe, não 404)', async () => {
      await request(app.getHttpServer()).get('/scalability/tenants').expect(401);
    });

    it('colaborador não acede (tier ADMIN/AUDITOR)', async () => {
      await request(app.getHttpServer())
        .get('/scalability/tenants')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor não acede (tier ADMIN/AUDITOR)', async () => {
      await request(app.getHttpServer())
        .get('/scalability/tenants')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    // RH deixou de ter acesso ao módulo (era ADMIN/RH; passou a ADMIN/AUDITOR
    // em leitura e ADMIN-only em escrita, para alinhar com a restrição de
    // sidebar "só ADMIN/AUDITOR veem Escalabilidade").
    it('RH já não acede a nada no módulo (perdeu o acesso)', async () => {
      await request(app.getHttpServer())
        .get('/scalability/tenants')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });

    it('ADMIN acede à listagem de tenants', async () => {
      await request(app.getHttpServer())
        .get('/scalability/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('AUDITOR acede em leitura à listagem de tenants, mas não pode criar um', async () => {
      await request(app.getHttpServer())
        .get('/scalability/tenants')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/scalability/tenants')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ tenantCode: 'INT-TEST-SCAL-AUDITOR', tenantName: 'Auditor não pode criar' })
        .expect(403);
    });
  });

  describe('Tenants', () => {
    it('ADMIN cria tenant (+ SLA e CDN padrão)', async () => {
      const res = await request(app.getHttpServer())
        .post('/scalability/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantCode: 'INT-TEST-SCAL', tenantName: 'Int Test Scalability Corp' })
        .expect(201);
      tenantId = res.body.id;
      expect(res.body.plan).toBe('STARTER');
    });

    it('código de tenant duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/scalability/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantCode: 'INT-TEST-SCAL', tenantName: 'Duplicado' })
        .expect(409);
    });

    it('GET /tenants/:id devolve o tenant (AUDITOR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/scalability/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      expect(res.body.id).toBe(tenantId);
    });

    it('RH já não acede a GET /tenants/:id', async () => {
      await request(app.getHttpServer())
        .get(`/scalability/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });

    it('PATCH actualiza o tenant', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/scalability/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maxUsers: 500 })
        .expect(200);
      expect(res.body.maxUsers).toBe(500);
    });

    it('SLA e content-delivery padrão foram criados automaticamente', async () => {
      const slas = await request(app.getHttpServer())
        .get(`/scalability/sla/tenant/${tenantId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      expect(slas.body.length).toBeGreaterThanOrEqual(1);

      const cdn = await request(app.getHttpServer())
        .get(`/scalability/content-delivery/${tenantId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      expect(cdn.body.tenantId).toBe(tenantId);
    });
  });

  describe('Integrations (bug: endpoint/config obrigatórios em falta + Int-vs-String id)', () => {
    it('AUDITOR não pode criar integração (leitura apenas)', async () => {
      await request(app.getHttpServer())
        .post('/scalability/integrations')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ tenantId, name: 'x', type: 'SLACK' })
        .expect(403);
    });

    it('ADMIN cria integração sem rebentar (endpoint/config eram obrigatórios e não preenchidos)', async () => {
      const res = await request(app.getHttpServer())
        .post('/scalability/integrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId,
          name: 'Int Test Slack',
          type: 'SLACK',
          baseUrl: 'https://hooks.slack.com/services/int-test',
          configJson: '{"channel":"#geral"}',
        })
        .expect(201);
      integrationId = res.body.id;
      expect(typeof integrationId).toBe('number');
    });

    it('PATCH /integrations/:id (Int id) — antes rebentava por comparar string com coluna Int', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/scalability/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Int Test Slack Renamed' })
        .expect(200);
      expect(res.body.name).toBe('Int Test Slack Renamed');
    });

    it('PATCH /integrations/:id com id não-numérico → 400 (ParseIntPipe)', async () => {
      await request(app.getHttpServer())
        .patch('/scalability/integrations/not-a-number')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'x' })
        .expect(400);
    });

    it('listar integrações do tenant (AUDITOR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/scalability/integrations/tenant/${tenantId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      expect(res.body.data.some((i: any) => i.id === integrationId)).toBe(true);
    });

    it('trigger sync (integrationId numérico) cria log de sincronização', async () => {
      const res = await request(app.getHttpServer())
        .post('/scalability/integrations/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ integrationId })
        .expect(202);
      expect(res.body.syncLogId).toBeDefined();

      const logs = await request(app.getHttpServer())
        .get(`/scalability/integrations/${integrationId}/sync-logs`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      expect(logs.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Automation Rules (bug: trigger/action/condition legados obrigatórios em falta + Int id)', () => {
    it('ADMIN cria regra de automação sem rebentar (trigger/action/condition eram obrigatórios)', async () => {
      const res = await request(app.getHttpServer())
        .post('/scalability/automations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId,
          name: 'Int Test Auto-Enroll',
          triggerType: 'USER_HIRED',
          triggerConfigJson: '{}',
          actionsJson: '[]',
        })
        .expect(201);
      ruleId = res.body.id;
      expect(typeof ruleId).toBe('number');
    });

    it('triggerConfigJson inválido → 400', async () => {
      await request(app.getHttpServer())
        .post('/scalability/automations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId,
          name: 'Int Test Invalid JSON',
          triggerType: 'USER_HIRED',
          triggerConfigJson: 'not-json',
          actionsJson: '[]',
        })
        .expect(400);
    });

    it('PATCH /automations/:id (Int id)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/scalability/automations/${ruleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priority: 5 })
        .expect(200);
      expect(res.body.priority).toBe(5);
    });

    it('listar regras do tenant (AUDITOR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/scalability/automations/tenant/${tenantId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      expect(res.body.data.some((r: any) => r.id === ruleId)).toBe(true);
    });

    it('AUDITOR não pode executar regra (leitura apenas)', async () => {
      await request(app.getHttpServer())
        .post('/scalability/automations/execute')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ ruleId })
        .expect(403);
    });

    it('executar regra (ruleId numérico) cria execução', async () => {
      const res = await request(app.getHttpServer())
        .post('/scalability/automations/execute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ruleId })
        .expect(202);
      expect(res.body.executionId).toBeDefined();
    });
  });

  describe('Alertas (bug: isResolved coagia ?isResolved=false para true)', () => {
    it('ADMIN cria alerta', async () => {
      const res = await request(app.getHttpServer())
        .post('/scalability/alerts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId,
          severity: 'WARNING',
          category: 'PERFORMANCE',
          title: 'Int Test Alert',
          message: 'Latência elevada de teste',
        })
        .expect(201);
      alertId = res.body.id;
      expect(res.body.isResolved).toBe(false);
    });

    it('?isResolved=false devolve o alerta ainda aberto (não coage para true)', async () => {
      const res = await request(app.getHttpServer())
        .get('/scalability/alerts')
        .set('Authorization', `Bearer ${auditorToken}`)
        .query({ tenantId, isResolved: 'false' })
        .expect(200);
      expect(res.body.data.some((a: any) => a.id === alertId)).toBe(true);
    });

    it('?isResolved=true NÃO deve incluir o alerta ainda aberto', async () => {
      const res = await request(app.getHttpServer())
        .get('/scalability/alerts')
        .set('Authorization', `Bearer ${auditorToken}`)
        .query({ tenantId, isResolved: 'true' })
        .expect(200);
      expect(res.body.data.some((a: any) => a.id === alertId)).toBe(false);
    });

    it('AUDITOR não pode resolver alerta (leitura apenas)', async () => {
      await request(app.getHttpServer())
        .patch(`/scalability/alerts/${alertId}/resolve`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ resolvedBy: String(1) })
        .expect(403);
    });

    it('resolver o alerta (ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/scalability/alerts/${alertId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolvedBy: String(1) })
        .expect(200);
      expect(res.body.isResolved).toBe(true);
    });

    it('resolver o mesmo alerta outra vez → 400', async () => {
      await request(app.getHttpServer())
        .patch(`/scalability/alerts/${alertId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolvedBy: String(1) })
        .expect(400);
    });

    it('agora ?isResolved=true inclui o alerta', async () => {
      const res = await request(app.getHttpServer())
        .get('/scalability/alerts')
        .set('Authorization', `Bearer ${auditorToken}`)
        .query({ tenantId, isResolved: 'true' })
        .expect(200);
      expect(res.body.data.some((a: any) => a.id === alertId)).toBe(true);
    });
  });

  describe('Dashboard, métricas, bulk import e load test', () => {
    it('dashboard do tenant não rebenta e devolve estrutura completa (AUDITOR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/scalability/dashboard/${tenantId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      expect(res.body.tenantInfo.id).toBe(tenantId);
      expect(res.body.integrations).toBeDefined();
      expect(res.body.automations).toBeDefined();
      expect(res.body.alerts).toBeDefined();
      expect(res.body.slaCompliance).toBeDefined();
    });

    it('GET /scalability/dashboard (sem :tenantId) resolve sozinho o tenant único', async () => {
      const res = await request(app.getHttpServer())
        .get('/scalability/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.tenantInfo.id).toBeDefined();
      expect(res.body.integrations).toBeDefined();
    });

    it('métricas em tempo real não rebentam mesmo sem snapshot', async () => {
      await request(app.getHttpServer())
        .get('/scalability/metrics/realtime')
        .set('Authorization', `Bearer ${auditorToken}`)
        .query({ tenantId })
        .expect(200);
    });

    it('AUDITOR não pode fazer bulk import (leitura apenas)', async () => {
      const payload = Buffer.from(
        JSON.stringify([{ email: 'int.test.bulk.auditor@innova-test.com', fullName: 'x' }]),
      ).toString('base64');
      await request(app.getHttpServer())
        .post('/scalability/users/bulk-import')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ tenantId, payload, format: 'JSON' })
        .expect(403);
    });

    it('bulk import de utilizadores via JSON base64 (ADMIN)', async () => {
      const payload = Buffer.from(
        JSON.stringify([
          { email: `int.test.bulk.${Date.now()}@innova-test.com`, fullName: 'Bulk User' },
        ]),
      ).toString('base64');

      const res = await request(app.getHttpServer())
        .post('/scalability/users/bulk-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tenantId, payload, format: 'JSON' })
        .expect(200);
      expect(res.body.created).toBe(1);
      expect(res.body.failed).toBe(0);

      await prisma.user
        .deleteMany({ where: { email: { contains: 'int.test.bulk.' } } })
        .catch(() => undefined);
    });

    it('agendar teste de carga', async () => {
      const res = await request(app.getHttpServer())
        .post('/scalability/load-test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ concurrentUsers: 50, durationSeconds: 60, targetEndpoint: '/courses', tenantId })
        .expect(202);
      expect(res.body.message).toBeDefined();
    });
  });
});
