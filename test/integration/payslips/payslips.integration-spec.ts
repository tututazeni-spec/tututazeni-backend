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
const OTHER_EMPLOYEE_EMAIL = 'int.payslips.other@innova-test.com';

describe('Payslips Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let otherEmployeeToken: string;
  let employeeId: number;
  let otherEmployeeId: number;

  let payslipId: number;
  let secondPayslipId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

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
        fullName: 'Outro Colaborador Payslips',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });
    otherEmployeeId = otherEmployee.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: OTHER_EMPLOYEE_EMAIL, password: 'Test@1234' })
      .expect(201);
    otherEmployeeToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    // PayslipAccessLog.userId é quem VISUALIZOU o recibo (pode ser o RH que
    // acedeu à rota administrativa), não o dono do recibo — filtrar por
    // userId aqui deixava para trás os logs de acesso do RH, cuja FK RESTRICT
    // bloqueava a eliminação do Payslip. Filtrar sempre pelos payslipIds reais.
    const ownPayslips = await (prisma as any).payslip.findMany({
      where: { userId: { in: [employeeId, otherEmployeeId] } },
      select: { id: true },
    });
    const payslipIds = ownPayslips.map((p: any) => p.id);
    if (payslipIds.length) {
      await (prisma as any).payslipDispute
        .deleteMany({ where: { payslipId: { in: payslipIds } } })
        .catch(() => undefined);
      await (prisma as any).payslipAccessLog
        .deleteMany({ where: { payslipId: { in: payslipIds } } })
        .catch(() => undefined);
      await (prisma as any).payslip
        .deleteMany({ where: { id: { in: payslipIds } } })
        .catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: OTHER_EMPLOYEE_EMAIL } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Simulação (aberta, sem persistência)', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/payslips/simulate')
        .send({ baseSalary: 250000 })
        .expect(401);
    });

    it('colaborador simula o próprio salário → 200 com IRT/INSS calculados', async () => {
      const res = await request(app.getHttpServer())
        .post('/payslips/simulate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ baseSalary: 250000, bonuses: 10000 })
        .expect(200);
      expect(res.body).toHaveProperty('netSalary');
      expect(res.body.grossSalary).toBe(260000);
    });
  });

  describe('Criação (Admin/RH)', () => {
    it('colaborador não pode criar recibo → 403', async () => {
      await request(app.getHttpServer())
        .post('/payslips')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          userId: employeeId,
          period: '2026-04',
          paymentDate: '2026-04-25',
          baseSalary: 250000,
        })
        .expect(403);
    });

    it('RH cria recibo individual → 201 (DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .post('/payslips')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          userId: employeeId,
          period: '2026-04',
          paymentDate: '2026-04-25',
          baseSalary: 250000,
        })
        .expect(201);
      expect(res.body.status).toBe('DRAFT');
      payslipId = res.body.id;
    });

    it('recibo duplicado (mesmo userId+period) → 409', async () => {
      await request(app.getHttpServer())
        .post('/payslips')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          userId: employeeId,
          period: '2026-04',
          paymentDate: '2026-04-25',
          baseSalary: 250000,
        })
        .expect(409);
    });
  });

  describe('Emissão e transições de estado', () => {
    it('RH emite o recibo → 200 (ISSUED)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/payslips/${payslipId}/issue`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ISSUED');
    });

    it('reemitir recibo já ISSUED → 409', async () => {
      await request(app.getHttpServer())
        .patch(`/payslips/${payslipId}/issue`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(409);
    });

    it('colaborador vê o recibo emitido em /my → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === payslipId)).toBe(true);
    });

    it('dono vê o detalhe do seu recibo em /my/:id → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/payslips/my/${payslipId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', payslipId);
    });

    it('outro colaborador não pode ver o recibo alheio via /my/:id → 404', async () => {
      await request(app.getHttpServer())
        .get(`/payslips/my/${payslipId}`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });

    it('RH vê qualquer recibo via /:id (rota administrativa) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/payslips/${payslipId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', payslipId);
    });

    it('recibo administrativo inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/payslips/999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('colaborador confirma recepção → 200 (ACKNOWLEDGED)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/payslips/my/${payslipId}/acknowledge`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.status).toBe('ACKNOWLEDGED');
    });

    it('confirmar recibo já ACKNOWLEDGED é idempotente → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/payslips/my/${payslipId}/acknowledge`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.status).toBe('ACKNOWLEDGED');
    });

    it('editar recibo já ACKNOWLEDGED → 403', async () => {
      await request(app.getHttpServer())
        .put(`/payslips/${payslipId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ baseSalary: 300000 })
        .expect(403);
    });
  });

  describe('Disputa', () => {
    it('dono abre disputa sobre o recibo → 201 (DISPUTED)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/payslips/my/${payslipId}/dispute`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ reason: 'Valor incorrecto do subsídio' })
        .expect(201);
      expect(res.body.status).toBe('OPEN');
    });

    it('outro colaborador não pode disputar recibo alheio → 404', async () => {
      await request(app.getHttpServer())
        .post(`/payslips/my/${payslipId}/dispute`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .send({ reason: 'tentativa indevida' })
        .expect(404);
    });
  });

  describe('Resumo anual e comparação', () => {
    it('resumo anual reflecte o recibo emitido/disputado (status != DRAFT) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/my/annual-summary?year=2026')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.months).toBeGreaterThanOrEqual(1);
    });

    it('resumo anual sem recibos → 200 com resumo zerado (não 404)', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/my/annual-summary?year=2026')
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(200);
      expect(res.body.months).toBe(0);
      expect(res.body.totalGross).toBe(0);
      expect(res.body.monthlySeries).toEqual([]);
    });

    it('RH cria e emite um segundo recibo (2026-05) para comparação', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/payslips')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          userId: employeeId,
          period: '2026-05',
          paymentDate: '2026-05-25',
          baseSalary: 300000,
        })
        .expect(201);
      secondPayslipId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/payslips/${secondPayslipId}/issue`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('compara dois períodos existentes → 200 com delta positivo', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/my/compare?periodA=2026-04&periodB=2026-05')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.baseSalary.delta).toBe(50000);
    });

    it('comparar com período inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/payslips/my/compare?periodA=2026-04&periodB=2099-01')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });

  describe('Exportação (PDF / CSV)', () => {
    it('dono descarrega o próprio recibo em PDF → 200 application/pdf', async () => {
      const res = await request(app.getHttpServer())
        .get(`/payslips/my/${payslipId}/pdf`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect((res.body as Buffer).slice(0, 4).toString()).toBe('%PDF');
    });

    it('outro colaborador não descarrega o PDF de recibo alheio → 404', async () => {
      await request(app.getHttpServer())
        .get(`/payslips/my/${payslipId}/pdf`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });

    it('exporta o resumo anual em CSV → 200 text/csv com cabeçalho', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/my/annual-summary/export?year=2026')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Período');
      expect(res.text).toContain('TOTAL');
    });

    it('exporta o resumo anual em PDF (format=pdf) → 200 application/pdf', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/my/annual-summary/export?year=2026&format=pdf')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
    });
  });

  describe('Criação em massa', () => {
    it('RH gera recibos em massa apenas para userIds indicados → created:1', async () => {
      const res = await request(app.getHttpServer())
        .post('/payslips/bulk-create')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ period: '2026-06', paymentDate: '2026-06-25', userIds: [otherEmployeeId] })
        .expect(201);
      expect(res.body.created).toBe(1);
    });

    it('repetir o mesmo lote → skipped:1 (sem duplicar)', async () => {
      const res = await request(app.getHttpServer())
        .post('/payslips/bulk-create')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ period: '2026-06', paymentDate: '2026-06-25', userIds: [otherEmployeeId] })
        .expect(201);
      expect(res.body.skipped).toBe(1);
    });
  });

  describe('Administração (RH) — listagem, dashboard, logs', () => {
    it('colaborador não pode listar todos os recibos → 403', async () => {
      await request(app.getHttpServer())
        .get('/payslips')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH lista todos os recibos → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('colaborador não acede ao dashboard → 403', async () => {
      await request(app.getHttpServer())
        .get('/payslips/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH acede ao dashboard com métricas do período → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/payslips/dashboard?period=2026-04')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('counts');
      expect(res.body).toHaveProperty('financials');
    });

    it('colaborador não acede aos logs de acesso → 403', async () => {
      await request(app.getHttpServer())
        .get(`/payslips/${payslipId}/access-logs`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH vê os logs de acesso do recibo (registados pelas visualizações anteriores) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/payslips/${payslipId}/access-logs`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });
});
