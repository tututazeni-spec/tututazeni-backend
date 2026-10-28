import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Billing Integration', () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

  let invoiceId: string;
  let tenantBefore: Record<string, unknown> | null = null;
  const http = () => request(app.getHttpServer());
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    adminToken = await getToken(app.getHttpServer(), 'admin');
    employeeToken = await getToken(app.getHttpServer(), 'employee');
    const t = await prisma.tenantConfig.findFirst();
    tenantBefore = t
      ? {
          plan: t.plan,
          maxUsers: t.maxUsers,
          maxStorageGb: t.maxStorageGb,
          trialEndsAt: t.trialEndsAt,
          billingCycleStart: t.billingCycleStart,
          contractEndDate: t.contractEndDate,
        }
      : null;
    // Estado limpo: a subscrição é única por cliente.
    await prisma.billingPayment.deleteMany();
    await prisma.billingInvoice.deleteMany();
    await prisma.billingSubscription.deleteMany();
  });

  afterAll(async () => {
    // Filhos antes dos pais (FK RESTRICT). Um resto de subscrição EXPIRED poria as outras specs em só leitura.
    await prisma.billingPayment.deleteMany().catch((): undefined => undefined);
    await prisma.billingInvoice.deleteMany().catch((): undefined => undefined);
    await prisma.billingInvoiceSequence.deleteMany().catch((): undefined => undefined);
    await prisma.billingSubscription.deleteMany().catch((): undefined => undefined);
    await prisma.billingMetricSnapshot.deleteMany().catch((): undefined => undefined);
    await prisma.billingPlan
      .deleteMany({ where: { code: 'ONLYLMS' } })
      .catch((): undefined => undefined);
    if (tenantBefore) {
      await prisma.tenantConfig
        .updateMany({ data: tenantBefore as any })
        .catch((): undefined => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  it('só ADMIN acede a /billing', async () => {
    await http().get('/billing/subscription').expect(401);
    await http()
      .get('/billing/subscription')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });

  it('catálogo tem os planos de arranque', async () => {
    const res = await http().get('/billing/plans').set(admin()).expect(200);
    expect(res.body.map((p: { code: string }) => p.code)).toEqual(
      expect.arrayContaining(['STARTER', 'GROWTH', 'ENTERPRISE']),
    );
  });

  it('trial: concedido uma vez', async () => {
    const res = await http()
      .post('/billing/subscription/trial')
      .set(admin())
      .send({ planCode: 'starter' })
      .expect(201);
    expect(res.body.status).toBe('TRIALING');
    await http()
      .post('/billing/subscription/trial')
      .set(admin())
      .send({ planCode: 'STARTER' })
      .expect(409);
  });

  it('subscribe emite fatura sequencial com IVA 14 % e hash encadeado', async () => {
    const res = await http()
      .post('/billing/subscription/subscribe')
      .set(admin())
      .send({ planCode: 'STARTER', interval: 'MONTHLY' })
      .expect(201);
    const inv = res.body.invoice;
    invoiceId = inv.id;
    expect(inv.fullNumber).toMatch(/^FT \d{4}\/1$/);
    expect(Number(inv.taxRate)).toBe(14);
    expect(Number(inv.total)).toBeCloseTo(Number(inv.subtotal) * 1.14, 2);
    expect(inv.status).toBe('ISSUED');
    const chain = await http().get('/billing/invoices/verify-chain').set(admin()).expect(200);
    expect(chain.body).toMatchObject({ valid: true, checked: 1 });
  });

  it('cobrança falhada fica registada e a fatura continua em aberto', async () => {
    const res = await http()
      .post(`/billing/invoices/${invoiceId}/payment-failed`)
      .set(admin())
      .send({ reason: 'Referência expirada' })
      .expect(201);
    expect(res.body.status).toBe('ISSUED');
    expect(res.body.payments.some((p: { status: string }) => p.status === 'FAILED')).toBe(true);
  });

  it('pagamento total passa a fatura a PAID e a subscrição a ACTIVE', async () => {
    const inv = await http().get(`/billing/invoices/${invoiceId}`).set(admin()).expect(200);
    const res = await http()
      .post(`/billing/invoices/${invoiceId}/payments`)
      .set(admin())
      .send({ amount: Number(inv.body.total), method: 'TRANSFER', reference: 'TRF-1' })
      .expect(201);
    expect(res.body.status).toBe('PAID');
    const cur = await http().get('/billing/subscription').set(admin()).expect(200);
    expect(cur.body.subscription.status).toBe('ACTIVE');
    expect(cur.body.subscription.convertedAt).toBeTruthy();
    await http()
      .post(`/billing/invoices/${invoiceId}/void`)
      .set(admin())
      .send({ reason: 'x' })
      .expect(409);
  });

  it('métricas: MRR exacto e aviso de amostra pequena', async () => {
    const res = await http().get('/billing/metrics').set(admin()).expect(200);
    expect(res.body.mrr).toBeGreaterThan(0);
    expect(res.body.payingCustomers).toBe(1);
    expect(res.body.reliable).toBe(false);
    expect(res.body.reliabilityNote).toMatch(/mínimo 10/);
    expect(res.body.collections.collectionRatePct).toBeNull(); // nenhuma fatura venceu ainda na janela
  });

  it('plano sem o módulo bloqueia as suas rotas e libera ao voltar ao plano completo', async () => {
    await http()
      .put('/billing/plans/ONLYLMS')
      .set(admin())
      .send({
        name: 'So LMS',
        priceMonthly: 1,
        priceYearly: 12,
        maxUsers: 100000,
        maxStorageGb: 50,
        modules: ['LMS'],
      })
      .expect(200);
    await http()
      .post('/billing/subscription/change-plan')
      .set(admin())
      .send({ planCode: 'ONLYLMS' })
      .expect(201);
    const blocked = await http().get('/payroll/runs').set(admin()).expect(403);
    expect(blocked.body.message).toMatch(/não está incluído no seu plano/);
    await http()
      .post('/billing/subscription/change-plan')
      .set(admin())
      .send({ planCode: 'STARTER' })
      .expect(201);
    const ok = await http().get('/payroll/runs').set(admin());
    expect(ok.status).not.toBe(403);
  });

  it('descer para um plano abaixo dos utilizadores existentes é recusado', async () => {
    await http()
      .put('/billing/plans/ONLYLMS')
      .set(admin())
      .send({ name: 'So LMS', priceMonthly: 1, priceYearly: 12, maxUsers: 1, maxStorageGb: 50 })
      .expect(200);
    await http()
      .post('/billing/subscription/change-plan')
      .set(admin())
      .send({ planCode: 'ONLYLMS' })
      .expect(400);
  });

  it('cancelamento imediato põe a plataforma em modo só de leitura (consultas e /billing continuam)', async () => {
    await http()
      .post('/billing/subscription/cancel')
      .set(admin())
      .send({ atPeriodEnd: false })
      .expect(201);
    const write = await http().post('/courses').set(admin()).send({}).expect(403);
    expect(write.body.message).toMatch(/modo só de leitura/);
    const read = await http().get('/courses').set(admin());
    expect(read.status).not.toBe(403);
    await http().get('/billing/subscription').set(admin()).expect(200);
  });
});
