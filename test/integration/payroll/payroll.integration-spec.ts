import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

const OTHER_EMPLOYEE_EMAIL = 'int.payroll.other@innova-test.com';
const NOCOMP_EMPLOYEE_EMAIL = 'int.payroll.nocomp@innova-test.com';

const TAX_YEAR = 2026;
const PERIOD_HAPPY = '2026-09';
const PERIOD_TRANSITIONS = '2026-10';
const PERIOD_NOCOMP = '2026-11';
const ALL_PERIODS = [PERIOD_HAPPY, PERIOD_TRANSITIONS, PERIOD_NOCOMP];

describe('Payroll Workflow Integration', () => {
  let app: INestApplication;
  let rhToken: string;
  let employeeToken: string;

  let employeeId: number;
  let otherEmployeeId: number;
  let noCompEmployeeId: number;

  // Runs criados ao longo dos testes — usados pela limpeza FK-ordered do afterAll.
  const runIds: number[] = [];

  // Estado partilhado entre `it`s (mesmo padrão do payslips.integration-spec).
  let happyRunId: number;
  let issuedPayslipId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  /**
   * A auditoria de approve/publish é escrita de forma assíncrona pelo
   * AuditProcessor (fila Bull 'audit'), por isso a linha do AuditLog pode ainda
   * não existir no instante em que o request HTTP responde. Faz poll curto.
   */
  async function waitForAuditRow(
    where: Record<string, unknown>,
    timeoutMs = 10000,
    intervalMs = 250,
  ): Promise<any | null> {
    const deadline = Date.now() + timeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (Date.now() < deadline) {
      const row = await (prisma as any).auditLog.findFirst({
        where,
        orderBy: { id: 'desc' },
      });
      if (row) return row;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    // Configuração EXACTA do ValidationPipe do main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    rhToken = await getToken(app.getHttpServer(), 'rh');
    employeeToken = await getToken(app.getHttpServer(), 'employee');

    const employeeUser = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employeeUser!.id;

    const colaboradorRole = await prisma.role.findUnique({ where: { code: 'COLABORADOR' } });
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    const password = await bcrypt.hash('Test@1234', 10);

    const otherEmployee = await prisma.user.upsert({
      where: { email: OTHER_EMPLOYEE_EMAIL },
      update: {},
      create: {
        email: OTHER_EMPLOYEE_EMAIL,
        fullName: 'Outro Colaborador Payroll',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });
    otherEmployeeId = otherEmployee.id;

    const noCompEmployee = await prisma.user.upsert({
      where: { email: NOCOMP_EMPLOYEE_EMAIL },
      update: {},
      create: {
        email: NOCOMP_EMPLOYEE_EMAIL,
        fullName: 'Colaborador Sem Compensacao',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });
    noCompEmployeeId = noCompEmployee.id;

    const testUserIds = [employeeId, otherEmployeeId, noCompEmployeeId];

    // ── Limpeza defensiva: restos de uma execução anterior mal terminada
    //    (afterAll engole falhas) fariam o processRun colidir com o
    //    @@unique([userId, period]) do Payslip. Ordem filhos → pais.
    const stalePayslips = await (prisma as any).payslip.findMany({
      where: { userId: { in: testUserIds }, period: { in: ALL_PERIODS } },
      select: { id: true },
    });
    const stalePayslipIds = stalePayslips.map((p: any) => p.id);
    if (stalePayslipIds.length) {
      await (prisma as any).payslipItem
        .deleteMany({ where: { payslipId: { in: stalePayslipIds } } })
        .catch(() => undefined);
      await (prisma as any).payslipAccessLog
        .deleteMany({ where: { payslipId: { in: stalePayslipIds } } })
        .catch(() => undefined);
      await (prisma as any).payslipDispute
        .deleteMany({ where: { payslipId: { in: stalePayslipIds } } })
        .catch(() => undefined);
      await (prisma as any).payslip
        .deleteMany({ where: { id: { in: stalePayslipIds } } })
        .catch(() => undefined);
    }

    // ── CountryConfig AO + escalões IRT (seedPayroll de prisma/seed.ts não é
    //    exportado — replica-se o upsert aqui; espelha getDefaultAngolaConfig).
    const config = await (prisma as any).countryConfig.upsert({
      where: { countryCode_taxYear: { countryCode: 'AO', taxYear: TAX_YEAR } },
      update: { active: true },
      create: {
        countryCode: 'AO',
        name: 'Angola',
        currency: 'AOA',
        locale: 'pt-AO',
        taxYear: TAX_YEAR,
        minimumWage: 70000,
        defaultFoodAllowance: 25000,
        defaultTransportAllowance: 15000,
        socialSecurity: { employeeRate: 0.03, employerRate: 0.08, ceiling: null },
        healthInsuranceRate: 0.02,
        unionFeeRate: 0.01,
        guaranteeFundRate: 0.005,
        active: true,
      },
    });
    const bracketCount = await (prisma as any).irtBracket.count({
      where: { configId: config.id },
    });
    if (bracketCount === 0) {
      await (prisma as any).irtBracket.createMany({
        data: [
          { min: 0, max: 70000, rate: 0, deduction: 0, order: 0 },
          { min: 70000, max: 100000, rate: 0.07, deduction: 0, order: 1 },
          { min: 100000, max: 150000, rate: 0.11, deduction: 4000, order: 2 },
          { min: 150000, max: 200000, rate: 0.14, deduction: 8500, order: 3 },
          { min: 200000, max: 300000, rate: 0.17, deduction: 14500, order: 4 },
          { min: 300000, max: 500000, rate: 0.21, deduction: 26500, order: 5 },
          { min: 500000, max: null, rate: 0.25, deduction: 46500, order: 6 },
        ].map(b => ({ ...b, configId: config.id })),
      });
    }

    // ── EmployeeCompensation: colaborador RH-flow + otherEmployee têm; o
    //    noCompEmployee fica DELIBERADAMENTE sem, para forçar NO_COMPENSATION.
    await (prisma as any).employeeCompensation
      .deleteMany({ where: { userId: { in: testUserIds } } })
      .catch(() => undefined);
    await (prisma as any).employeeCompensation.create({
      data: { userId: employeeId, baseSalary: 120000, countryCode: 'AO' },
    });
    await (prisma as any).employeeCompensation.create({
      data: { userId: otherEmployeeId, baseSalary: 120000, countryCode: 'AO' },
    });
  });

  afterAll(async () => {
    const testUserIds = [employeeId, otherEmployeeId, noCompEmployeeId];

    // FK-ordered, cada passo best-effort (.catch) — filhos antes de pais
    // (FK RESTRICT). PayslipAccessLog/PayslipDispute filtrados por payslipId
    // (nunca userId — esse é quem VISUALIZOU o recibo, não o dono).
    const runPayslips = await (prisma as any).payslip
      .findMany({ where: { runId: { in: runIds } }, select: { id: true } })
      .catch(() => [] as Array<{ id: number }>);
    const payslipIds = runPayslips.map((p: any) => p.id);

    await (prisma as any).payslipItem
      .deleteMany({ where: { payslip: { runId: { in: runIds } } } })
      .catch(() => undefined);
    if (payslipIds.length) {
      await (prisma as any).payslipAccessLog
        .deleteMany({ where: { payslipId: { in: payslipIds } } })
        .catch(() => undefined);
      await (prisma as any).payslipDispute
        .deleteMany({ where: { payslipId: { in: payslipIds } } })
        .catch(() => undefined);
    }
    await (prisma as any).payslip
      .deleteMany({ where: { runId: { in: runIds } } })
      .catch(() => undefined);
    await (prisma as any).payrollRun
      .deleteMany({ where: { id: { in: runIds } } })
      .catch(() => undefined);
    await (prisma as any).employeeCompensation
      .deleteMany({ where: { userId: { in: testUserIds } } })
      .catch(() => undefined);
    await (prisma as any).auditLog
      .deleteMany({ where: { entity: 'PayrollRun', entityId: { in: runIds } } })
      .catch(() => undefined);
    await prisma.notificationLog
      .deleteMany({ where: { userId: { in: testUserIds }, type: 'PAYSLIP_ISSUED' } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { email: { in: [OTHER_EMPLOYEE_EMAIL, NOCOMP_EMPLOYEE_EMAIL] } } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Teste 1 — Happy path: DRAFT → SIMULATED → PENDING_APPROVAL → APPROVED → PUBLISHED
  // ───────────────────────────────────────────────────────────────────────────
  describe('Happy path — ciclo completo do run', () => {
    it('RH cria o run → 201 (DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .post('/payroll/runs')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ period: PERIOD_HAPPY, userIds: [employeeId] })
        .expect(201);
      expect(res.body.status).toBe('DRAFT');
      happyRunId = res.body.id;
      runIds.push(happyRunId);
    });

    it('RH processa o run → 200 (SIMULATED), employeeCount === 1, recibo + items persistidos', async () => {
      const res = await request(app.getHttpServer())
        .post(`/payroll/runs/${happyRunId}/process`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('SIMULATED');
      expect(res.body.employeeCount).toBe(1);

      const payslips = await (prisma as any).payslip.findMany({
        where: { runId: happyRunId },
        include: { items: true },
      });
      expect(payslips).toHaveLength(1);
      expect(payslips[0].userId).toBe(employeeId);
      expect(payslips[0].period).toBe(PERIOD_HAPPY);
      expect(payslips[0].runId).toBe(happyRunId);
      expect(payslips[0].items.length).toBeGreaterThan(0);
    });

    it('RH submete o run → 200 (PENDING_APPROVAL)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/payroll/runs/${happyRunId}/submit`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('PENDING_APPROVAL');
    });

    it('RH aprova o run → 200 (APPROVED) + AuditLog action=approve com approvedById', async () => {
      const res = await request(app.getHttpServer())
        .post(`/payroll/runs/${happyRunId}/approve`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('APPROVED');

      const row = await waitForAuditRow({
        entity: 'PayrollRun',
        entityId: happyRunId,
        action: 'approve',
      });
      expect(row).toBeTruthy();
      // metadata é uma String JSON (o AuditProcessor faz JSON.stringify).
      const meta = JSON.parse(row.metadata);
      expect(meta.approvedById).toBeDefined();
      expect(typeof meta.approvedById).toBe('number');
    });

    it('RH publica o run → 200 (PUBLISHED) + recibo ISSUED + NotificationLog + AuditLog action=publish', async () => {
      const res = await request(app.getHttpServer())
        .post(`/payroll/runs/${happyRunId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');

      const payslip = await (prisma as any).payslip.findFirst({
        where: { runId: happyRunId },
        select: { id: true, status: true },
      });
      expect(payslip.status).toBe('ISSUED');
      issuedPayslipId = payslip.id;

      const notif = await prisma.notificationLog.findFirst({
        where: { userId: employeeId, type: 'PAYSLIP_ISSUED' },
        orderBy: { id: 'desc' },
      });
      expect(notif).toBeTruthy();

      const row = await waitForAuditRow({
        entity: 'PayrollRun',
        entityId: happyRunId,
        action: 'publish',
      });
      expect(row).toBeTruthy();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Teste 2 — Transições inválidas
  // ───────────────────────────────────────────────────────────────────────────
  describe('Transições inválidas', () => {
    let runId: number;

    it('cria um run fresco (DRAFT) para os testes de transição', async () => {
      const res = await request(app.getHttpServer())
        .post('/payroll/runs')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ period: PERIOD_TRANSITIONS, userIds: [employeeId] })
        .expect(201);
      runId = res.body.id;
      runIds.push(runId);
    });

    it('approve antes de submit → 409', async () => {
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/approve`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(409);
    });

    it('publish antes de approve → 409', async () => {
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(409);
    });

    it('depois de publicado: process → 403 (assertRunEditable) e publish de novo → 409', async () => {
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/process`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/submit`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/approve`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      // run imutável (PUBLISHED ∈ EDIT_LOCKED) → ForbiddenException
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/process`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);

      // transição inválida: publish requer APPROVED
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(409);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Teste 3 — submit bloqueado por erros (colaborador sem EmployeeCompensation)
  // ───────────────────────────────────────────────────────────────────────────
  describe('submit bloqueado por exceções de erro', () => {
    let runId: number;

    it('run sobre colaborador sem compensação → process devolve errorCount >= 1', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/payroll/runs')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ period: PERIOD_NOCOMP, userIds: [noCompEmployeeId] })
        .expect(201);
      runId = createRes.body.id;
      runIds.push(runId);

      const res = await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/process`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('SIMULATED');
      expect(res.body.errorCount).toBeGreaterThanOrEqual(1);
    });

    it('submit com errorCount > 0 → 409', async () => {
      await request(app.getHttpServer())
        .post(`/payroll/runs/${runId}/submit`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(409);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Teste 4 — IDOR / RBAC: colaborador não acede à API de runs
  // ───────────────────────────────────────────────────────────────────────────
  describe('IDOR — colaborador não opera runs', () => {
    it('POST /payroll/runs com token de colaborador → 403', async () => {
      await request(app.getHttpServer())
        .post('/payroll/runs')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ period: PERIOD_TRANSITIONS, userIds: [employeeId] })
        .expect(403);
    });

    it('POST /payroll/runs/:id/approve com token de colaborador → 403', async () => {
      await request(app.getHttpServer())
        .post(`/payroll/runs/${happyRunId}/approve`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Teste 5 — Imutabilidade: recibo de run PUBLISHED não é editável
  // ───────────────────────────────────────────────────────────────────────────
  describe('Imutabilidade do recibo após publicação', () => {
    it('PUT /payslips/:id de recibo ISSUED (run PUBLISHED) com RH → 403', async () => {
      await request(app.getHttpServer())
        .put(`/payslips/${issuedPayslipId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ baseSalary: 300000 })
        .expect(403);
    });
  });
});
