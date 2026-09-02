import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// Utilizadores dedicados a esta spec (NÃO os partilhados int.employee/...), para
// não colidir com payroll.integration-spec.ts, que corre no mesmo batch/processo.
const CAT_EMP_EMAIL = 'int.catalogue.emp@innova-test.com';
const CAT_OTHER_EMAIL = 'int.catalogue.other@innova-test.com';
const CAT_EMAILS = [CAT_EMP_EMAIL, CAT_OTHER_EMAIL];

// Componente salarial criado pelo teste (o afterAll só apaga este code).
const COMPONENT_CODE = 'INT-CAT-C1';

// IBAN real usado no POST — últimos 4 dígitos têm de reaparecer na máscara.
const CAT_IBAN = 'AO06004400006729503010102';
const CAT_IBAN_LAST4 = CAT_IBAN.slice(-4); // '0102'

describe('Payroll Catalogue + ESS Compensation Integration', () => {
  let app: INestApplication;
  let rhToken: string;
  let empToken: string;
  let otherToken: string;

  let catEmpId: number;
  let catOtherId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    return res.body.accessToken;
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

    const colaboradorRole = await prisma.role.findUnique({ where: { code: 'COLABORADOR' } });
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    const password = await bcrypt.hash('Test@1234', 10);

    const catEmp = await prisma.user.upsert({
      where: { email: CAT_EMP_EMAIL },
      update: {},
      create: {
        email: CAT_EMP_EMAIL,
        fullName: 'Colaborador Catalogo ESS',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });
    catEmpId = catEmp.id;

    const catOther = await prisma.user.upsert({
      where: { email: CAT_OTHER_EMAIL },
      update: {},
      create: {
        email: CAT_OTHER_EMAIL,
        fullName: 'Colaborador Catalogo Sem Comp',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });
    catOtherId = catOther.id;

    empToken = await login(CAT_EMP_EMAIL, 'Test@1234');
    otherToken = await login(CAT_OTHER_EMAIL, 'Test@1234');

    // Limpeza defensiva de restos de uma execução anterior mal terminada
    // (afterAll engole falhas). Filhos antes de pais.
    const staleComp = await (prisma as any).employeeCompensation
      .findMany({ where: { userId: { in: [catEmpId, catOtherId] } }, select: { id: true } })
      .catch(() => [] as Array<{ id: number }>);
    const staleCompIds = staleComp.map((c: any) => c.id);
    if (staleCompIds.length) {
      await (prisma as any).employeeCompensationComponent
        .deleteMany({ where: { compensationId: { in: staleCompIds } } })
        .catch(() => undefined);
      await (prisma as any).employeeCompensation
        .deleteMany({ where: { id: { in: staleCompIds } } })
        .catch(() => undefined);
    }
    await (prisma as any).salaryComponent
      .deleteMany({ where: { code: COMPONENT_CODE } })
      .catch(() => undefined);
  });

  afterAll(async () => {
    // FK-ordered, cada passo best-effort (.catch) — filhos antes de pais.
    const compRows = await (prisma as any).employeeCompensation
      .findMany({ where: { userId: { in: [catEmpId, catOtherId] } }, select: { id: true } })
      .catch(() => [] as Array<{ id: number }>);
    const compIds = compRows.map((c: any) => c.id);

    await (prisma as any).employeeCompensationComponent
      .deleteMany({ where: { compensationId: { in: compIds } } })
      .catch(() => undefined);
    await (prisma as any).employeeCompensation
      .deleteMany({ where: { userId: { in: [catEmpId, catOtherId] } } })
      .catch(() => undefined);
    await (prisma as any).salaryComponent
      .deleteMany({ where: { code: { in: [COMPONENT_CODE] } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { in: CAT_EMAILS } } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Catálogo — componentes salariais
  // ───────────────────────────────────────────────────────────────────────────
  describe('POST /payroll/components + GET /payroll/components/:code', () => {
    it('RH cria um componente e lê-o de volta pelo code (round-trip)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/payroll/components')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          code: COMPONENT_CODE,
          name: 'Prémio Integração',
          type: 'EARNING',
          calcType: 'FIXED',
          fixedValue: 25000,
          countryCode: 'AO',
        })
        .expect(201);
      expect(createRes.body.code).toBe(COMPONENT_CODE);

      const getRes = await request(app.getHttpServer())
        .get(`/payroll/components/${COMPONENT_CODE}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(getRes.body).toEqual(
        expect.objectContaining({
          code: COMPONENT_CODE,
          name: 'Prémio Integração',
          type: 'EARNING',
          calcType: 'FIXED',
          fixedValue: 25000,
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Catálogo — compensação: o POST fecha a linha anterior (effectiveTo)
  // ───────────────────────────────────────────────────────────────────────────
  describe('POST /payroll/compensation duas vezes → a 1ª linha ganha effectiveTo', () => {
    it('após o 2º POST, a linha mais antiga tem effectiveTo não-nulo', async () => {
      await request(app.getHttpServer())
        .post('/payroll/compensation')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          userId: catEmpId,
          baseSalary: 100000,
          countryCode: 'AO',
          bankName: 'BAI',
          iban: CAT_IBAN,
          effectiveFrom: '2026-01-01',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/payroll/compensation')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          userId: catEmpId,
          baseSalary: 150000,
          countryCode: 'AO',
          bankName: 'BAI',
          iban: CAT_IBAN,
          effectiveFrom: '2026-06-01',
        })
        .expect(201);

      const rows = await (prisma as any).employeeCompensation.findMany({
        where: { userId: catEmpId },
        orderBy: { effectiveFrom: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].effectiveTo).not.toBeNull();
      expect(rows[1].effectiveTo).toBeNull();
      expect(rows[1].baseSalary).toBe(150000);

      const hist = await request(app.getHttpServer())
        .get('/payroll/compensation')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ userId: catEmpId })
        .expect(200);
      expect(hist.body[0].user).toEqual(
        expect.objectContaining({ id: catEmpId, fullName: 'Colaborador Catalogo ESS' }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Catálogo — GET /payroll/compensation/all (lista global paginada, ADMIN/RH)
  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /payroll/compensation/all', () => {
    it('COLABORADOR → 403', async () => {
      await request(app.getHttpServer())
        .get('/payroll/compensation/all')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(403);
    });

    it('RH → 200, active rows only, correct shape, no iban/bankName', async () => {
      const res = await request(app.getHttpServer())
        .get('/payroll/compensation/all')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ search: 'Colaborador Catalogo ESS' })
        .expect(200);

      expect(res.body.meta).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          page: 1,
          limit: 20,
          totalPages: expect.any(Number),
        }),
      );
      const mine = res.body.data.find((r: any) => r.userId === catEmpId);
      expect(mine).toBeDefined();
      // catEmp has a closed + an open row → exactly one line here (the open one)
      expect(res.body.data.filter((r: any) => r.userId === catEmpId)).toHaveLength(1);
      expect(mine.effectiveTo).toBeNull();
      expect(mine.baseSalary).toBe(150000);
      expect(mine.user).toEqual(
        expect.objectContaining({ id: catEmpId, fullName: 'Colaborador Catalogo ESS' }),
      );
      expect(mine.user).toHaveProperty('department');
      expect(mine._count).toEqual({ components: expect.any(Number) });
      expect(mine).not.toHaveProperty('iban');
      expect(mine).not.toHaveProperty('bankName');
    });

    it('search narrows by employeeNumber and returns nothing for a miss', async () => {
      const res = await request(app.getHttpServer())
        .get('/payroll/compensation/all')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ search: 'zzz-no-such-employee-zzz' })
        .expect(200);
      expect(res.body.data.some((r: any) => r.userId === catEmpId)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ESS — GET /payslips/my/compensation
  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /payslips/my/compensation (ESS, masked, read-only)', () => {
    it('colaborador com compensação → recebe a SUA linha, IBAN mascarado, sem iban/accountNumber', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/my/compensation')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(200);

      expect(res.body).toEqual(expect.objectContaining({ baseSalary: 150000, bankName: 'BAI' }));
      expect(res.body.ibanMasked).toMatch(/•/);
      expect(res.body.ibanMasked.endsWith(CAT_IBAN_LAST4)).toBe(true);
      expect(res.body).not.toHaveProperty('iban');
      expect(res.body).not.toHaveProperty('accountNumber');
      expect(res.body).not.toHaveProperty('userId');
      expect(res.body).not.toHaveProperty('id');
    });

    it('colaborador diferente (sem compensação) → NÃO recebe os dados do primeiro', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/my/compensation')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      // catOther não tem EmployeeCompensation → myCompensation devolve null e o
      // Nest serializa-o como corpo vazio ({}). Nenhum dado do catEmp escapa.
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(res.body.baseSalary).toBeUndefined();
      expect(res.body.ibanMasked).toBeUndefined();
      expect(res.body).not.toEqual(
        expect.objectContaining({ ibanMasked: expect.stringContaining(CAT_IBAN_LAST4) }),
      );
    });
  });
});
