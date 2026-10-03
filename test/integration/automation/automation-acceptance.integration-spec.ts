import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// §13 — critérios de aceitação: idempotência, ciclos, versionamento, auditoria,
// permissões e redacção de dados sensíveis.
describe('Automation Acceptance (§13) Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const ruleIds: number[] = [];
  let ruleId: number;
  const trigger = 'manual';
  const dedupeKey = `accept-${Date.now()}`;

  const http = () => request(app.getHttpServer());

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

    const res = await http()
      .post('/automation/rules')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({
        name: 'Regra Aceitação §13',
        trigger,
        action: 'send_notification',
        category: 'ENGAGEMENT',
        actionParams: JSON.stringify({ message: 'Aceitação §13' }),
      })
      .expect(201);
    ruleId = res.body.id;
    ruleIds.push(ruleId);
  });

  afterAll(async () => {
    // filhos antes dos pais (FK RESTRICT)
    await prisma.automationExecution
      .deleteMany({ where: { ruleId: { in: ruleIds } } })
      .catch(() => undefined);
    await prisma.automationVersion
      .deleteMany({ where: { ruleId: { in: ruleIds } } })
      .catch(() => undefined);
    await prisma.automationRule
      .deleteMany({ where: { id: { in: ruleIds } } })
      .catch(() => undefined);
    await prisma.notificationLog
      .deleteMany({ where: { userId: employeeId, message: 'Aceitação §13' } })
      .catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  it('teste em modo simulação não executa acções nem cria execução', async () => {
    const before = await prisma.automationExecution.count({ where: { ruleId } });
    const res = await http()
      .post(`/automation/rules/${ruleId}/test`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ payload: {} })
      .expect(200);
    expect(res.body.dryRun).toBe(true);
    expect(await prisma.automationExecution.count({ where: { ruleId } })).toBe(before);
  });

  it('mesma dedupeKey não duplica a execução', async () => {
    const send = () =>
      http()
        .post('/automation/trigger')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ event: trigger, payload: { dedupeKey }, userId: employeeId })
        .expect(201);

    const first = await send();
    expect(first.body.results.find((r: any) => r.ruleId === ruleId)?.status).toBe('SUCCESS');
    const second = await send();
    const dup = second.body.results.find((r: any) => r.ruleId === ruleId);
    expect(dup.status).toBe('SKIPPED');
    expect(dup.reason).toBe('Execução duplicada');
    expect(
      await prisma.automationExecution.count({ where: { ruleId, dedupeKey, status: 'SUCCESS' } }),
    ).toBe(1);
  });

  it('cadeia de eventos acima da profundidade máxima é rejeitada (ciclo)', async () => {
    const res = await http()
      .post('/automation/trigger')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({
        event: trigger,
        payload: { _automation: { depth: 999, chain: [], correlationId: 'cycle-test' } },
        userId: employeeId,
      })
      .expect(201);
    expect(res.body.triggered).toBe(0);
    expect(res.body.message).toMatch(/profunda/i);
  });

  it('regra já presente na cadeia é ignorada (ciclo evitado)', async () => {
    const res = await http()
      .post('/automation/trigger')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({
        event: trigger,
        payload: { _automation: { depth: 1, chain: [ruleId], correlationId: 'cycle-test-2' } },
        userId: employeeId,
      })
      .expect(201);
    const own = res.body.results.find((r: any) => r.ruleId === ruleId);
    expect(own.status).toBe('SKIPPED');
    expect(own.reason).toMatch(/Ciclo evitado/);
  });

  it('publicar cria versão e a alteração fica auditada', async () => {
    await http()
      .post(`/automation/rules/${ruleId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'aceitação' })
      .expect(200);

    const versions = await http()
      .get(`/automation/rules/${ruleId}/versions`)
      .set('Authorization', `Bearer ${rhToken}`)
      .expect(200);
    const list = Array.isArray(versions.body) ? versions.body : versions.body.data;
    expect(list.length).toBeGreaterThan(0);

    const audit = await http()
      .get(`/automation/rules/${ruleId}/audit`)
      .set('Authorization', `Bearer ${rhToken}`)
      .expect(200);
    const entries = Array.isArray(audit.body) ? audit.body : audit.body.data;
    expect(entries.length).toBeGreaterThan(0);
  });

  it('histórico não expõe segredos nos detalhes da execução', async () => {
    const exec = await prisma.automationExecution.findFirst({ where: { ruleId } });
    const res = await http()
      .get(`/automation/history/${exec!.id}`)
      .set('Authorization', `Bearer ${rhToken}`)
      .expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/);
  });

  describe('permissões', () => {
    it.each([
      ['/automation/rules'],
      ['/automation/history'],
      ['/automation/dead-letters'],
      ['/automation/audit'],
      ['/automation/connections'],
      ['/automation/settings'],
    ])('colaborador → 403 em GET %s', async url => {
      await http().get(url).set('Authorization', `Bearer ${employeeToken}`).expect(403);
    });

    it.each(['/automation/settings', '/automation/audit', '/automation/connections'])(
      'RH não acede a rota só-ADMIN %s → 403',
      async url => {
        await http().get(url).set('Authorization', `Bearer ${rhToken}`).expect(403);
      },
    );

    it('RH não executa em massa (POST /automation/run) → 403', async () => {
      await http().post('/automation/run').set('Authorization', `Bearer ${rhToken}`).expect(403);
    });
  });
});
