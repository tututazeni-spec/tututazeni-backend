import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Automation Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const ruleIds: number[] = [];
  let ruleId: number;
  let employeeId: number;

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
    adminToken = await getToken(app.getHttpServer(), 'admin');

    const employee = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employee!.id;
  });

  afterAll(async () => {
    if (ruleIds.length > 0) {
      await prisma.automationExecution
        .deleteMany({ where: { ruleId: { in: ruleIds } } })
        .catch(() => undefined);
      await prisma.automationRule
        .deleteMany({ where: { id: { in: ruleIds } } })
        .catch(() => undefined);
    }
    // Templates aplicados via applyTemplate/initDefaultRules usam nomes fixos
    // (DEFAULT_RULES) — limpar por nome para não deixar lixo entre execuções.
    const defaultNames = [
      'Parabéns de Aniversário',
      'Lembrete de Formação em Atraso',
      'Verificação de Recibos Pendentes',
      'PDI automático pós-avaliação excelente',
      'Badge por conclusão de curso',
      'Pontos por conclusão de curso',
      'Notificação de novo colaborador',
    ];
    const defaults = await prisma.automationRule.findMany({
      where: { name: { in: defaultNames } },
      select: { id: true },
    });
    const defaultIds = defaults.map(d => d.id);
    if (defaultIds.length > 0) {
      await prisma.automationExecution
        .deleteMany({ where: { ruleId: { in: defaultIds } } })
        .catch(() => undefined);
      await prisma.automationRule
        .deleteMany({ where: { id: { in: defaultIds } } })
        .catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Regras — CRUD (ADMIN/RH)', () => {
    it('colaborador não pode criar regra → 403', async () => {
      await request(app.getHttpServer())
        .post('/automation/rules')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', trigger: 'manual', action: 'log' })
        .expect(403);
    });

    it('RH cria regra (tenantId/triggerType/createdBy derivados automaticamente) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/automation/rules')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Regra de Integração',
          trigger: 'manual',
          action: 'send_notification',
          category: 'ENGAGEMENT',
          actionParams: JSON.stringify({ message: 'Olá da automação' }),
          priority: 5,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.category).toBe('ENGAGEMENT');
      ruleId = res.body.id;
      ruleIds.push(ruleId);
    });

    it('GET /automation/rules — filtra por categoria e inclui stats → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/automation/rules')
        .query({ category: 'ENGAGEMENT' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const created = res.body.find((r: any) => r.id === ruleId);
      expect(created).toBeDefined();
      expect(created.stats).toHaveProperty('total');
    });

    it('PUT /automation/rules/:id — actualiza nome → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/automation/rules/${ruleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Regra de Integração (v2)' })
        .expect(200);
      expect(res.body.name).toBe('Regra de Integração (v2)');
    });

    it('PATCH /automation/rules/:id/toggle — desactiva → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/automation/rules/${ruleId}/toggle`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.active).toBe(false);
    });

    it('PATCH /automation/rules/:id/toggle — reactiva → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/automation/rules/${ruleId}/toggle`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.active).toBe(true);
    });

    it('POST /automation/rules/:id/clone — clona (inactiva) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/automation/rules/${ruleId}/clone`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.active).toBe(false);
      ruleIds.push(res.body.id);
    });
  });

  describe('Disparo de eventos e execução', () => {
    it('POST /automation/trigger — dispara evento MANUAL e notifica o utilizador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/automation/trigger')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ event: 'manual', payload: {}, userId: employeeId })
        .expect(201);

      expect(res.body.triggered).toBeGreaterThan(0);
      const own = res.body.results.find((r: any) => r.ruleId === ruleId);
      expect(own.status).toBe('SUCCESS');
    });

    it('notificação foi criada para o utilizador-alvo', async () => {
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: employeeId, message: 'Olá da automação' },
      });
      expect(notif).toBeDefined();
      await prisma.notificationLog.deleteMany({ where: { id: notif!.id } });
    });

    it('GET /automation/executions — regista a execução com actionsLog real → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/automation/executions')
        .query({ ruleId })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const exec = res.body.data ?? res.body;
      const items = Array.isArray(exec) ? exec : exec.data;
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].status).toBe('SUCCESS');
      expect(items[0].actionsLog).toBeTruthy();
    });

    it('POST /automation/executions/:id/rerun — id é cuid (string), não numérico → 201', async () => {
      const exec = await prisma.automationExecution.findFirst({ where: { ruleId } });
      expect(exec).toBeDefined();

      const res = await request(app.getHttpServer())
        .post(`/automation/executions/${exec!.id}/rerun`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('SUCCESS');
    });

    it('POST /automation/run — apenas ADMIN → 403 para RH', async () => {
      await request(app.getHttpServer())
        .post('/automation/run')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });

    it('POST /automation/run — ADMIN executa todas as regras activas → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/automation/run')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('executed');
    });
  });

  describe('Templates', () => {
    it('GET /automation/templates — 7 templates embutidos → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/automation/templates')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(6);
    });

    it('POST /automation/templates/0/apply — cria regra a partir do template → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/automation/templates/0/apply')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('id');
    });

    it('POST /automation/templates/0/apply — repetido não duplica → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/automation/templates/0/apply')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.message).toContain('já existe');
    });

    it('POST /automation/rules/init-defaults — cria os templates restantes → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/automation/rules/init-defaults')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('created');
    });
  });

  describe('Stats', () => {
    it('GET /automation/stats → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/automation/stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.rules).toHaveProperty('total');
      expect(res.body).toHaveProperty('byCategory');
    });
  });

  describe('Remoção', () => {
    it('DELETE /automation/rules/:id — regra sem execuções → 204', async () => {
      const created = await request(app.getHttpServer())
        .post('/automation/rules')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Regra descartável', trigger: 'manual', action: 'log' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/automation/rules/${created.body.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(204);
    });
  });
});
