import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const PAYROLL_PERIOD = '2026-06';

describe('Dashboard RH Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const payslipIds: number[] = [];

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
  });

  afterAll(async () => {
    if (payslipIds.length > 0) {
      await prisma.payslip.deleteMany({ where: { id: { in: payslipIds } } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('GET /dashboard-rh (full)', () => {
    it('colaborador não pode aceder → 403', async () => {
      await request(app.getHttpServer())
        .get('/dashboard-rh')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor não pode aceder ao dashboard completo (tier ADMIN) → 403', async () => {
      await request(app.getHttpServer())
        .get('/dashboard-rh')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('RH acede ao dashboard RH completo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      expect(res.body.kpis.headcount.total).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(res.body.alerts)).toBe(true);
      expect(Array.isArray(res.body.topBadgeAwardees)).toBe(true);
      expect(Array.isArray(res.body.recentActivity)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/headcount', () => {
    it('admin acede ao painel de headcount → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/headcount')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(4);
      expect(res.body.byTenure).toBeDefined();
      expect(Array.isArray(res.body.byDepartment)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/headcount-trend', () => {
    it('admin → 200 com array de meses', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/headcount-trend')
        .query({ months: 3 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveLength(3);
    });
  });

  describe('GET /dashboard-rh/turnover', () => {
    it('admin → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/turnover')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.turnoverRate).toBeDefined();
      expect(Array.isArray(res.body.insights)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/engagement — verifica correcção do RBAC (GESTOR)', () => {
    it('colaborador não pode aceder → 403', async () => {
      await request(app.getHttpServer())
        .get('/dashboard-rh/engagement')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor (GESTOR) acede ao painel de engagement → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/engagement')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.participationRate).toBeDefined();
      expect(Array.isArray(res.body.insights)).toBe(true);
    });

    it('RH acede ao painel de engagement → 200', async () => {
      await request(app.getHttpServer())
        .get('/dashboard-rh/engagement')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('GET /dashboard-rh/performance', () => {
    it('gestor (GESTOR) acede ao painel de performance → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/performance')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.distribution).toBeDefined();
      expect(Array.isArray(res.body.topPerformers)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/skills', () => {
    it('admin → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/skills')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.totalUsers).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(res.body.topGaps)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/training', () => {
    it('gestor (GESTOR) acede ao painel de formação → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/training')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.completionRate).toBeDefined();
      expect(Array.isArray(res.body.topCourses)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/compliance', () => {
    it('admin → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/compliance')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.riskLevel).toBeDefined();
      expect(Array.isArray(res.body.recentCerts)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/attendance', () => {
    it('admin → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.total).toBeDefined();
      expect(res.body.presenceRate).toBeDefined();
    });
  });

  describe('GET /dashboard-rh/talent-pipeline', () => {
    it('admin → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/talent-pipeline')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.totalPositions).toBeDefined();
      expect(Array.isArray(res.body.successionPlans)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/birthdays e /anniversaries', () => {
    it('birthdays → 200 array vazio (dateOfBirth não migrado)', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/birthdays')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('anniversaries → 200 array', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/anniversaries')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/payroll — verifica correcção (lê Payslip real, não HistoryRecord)', () => {
    it('sem payslips no período → headcount 0, totais zero', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/payroll')
        .query({ period: '1999-01' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.headcount).toBe(0);
      expect(res.body.totalGross).toBe(0);
    });

    it('com payslips reais no período → totais agregados correctamente', async () => {
      const employee = await prisma.user.findUnique({
        where: { email: 'int.employee@innova-test.com' },
      });
      const manager = await prisma.user.findUnique({
        where: { email: 'int.manager@innova-test.com' },
      });

      const p1 = await prisma.payslip.create({
        data: {
          userId: employee!.id,
          period: PAYROLL_PERIOD,
          grossSalary: 2000,
          netSalary: 1600,
          totalDeductions: 400,
        },
      });
      const p2 = await prisma.payslip.create({
        data: {
          userId: manager!.id,
          period: PAYROLL_PERIOD,
          grossSalary: 3000,
          netSalary: 2400,
          totalDeductions: 600,
        },
      });
      payslipIds.push(p1.id, p2.id);

      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/payroll')
        .query({ period: PAYROLL_PERIOD })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.headcount).toBe(2);
      expect(res.body.totalGross).toBe(5000);
      expect(res.body.totalNet).toBe(4000);
      expect(res.body.totalDeductions).toBe(1000);
      expect(res.body.avgGross).toBe(2500);
    });
  });

  describe('GET /dashboard-rh/alerts', () => {
    it('gestor (GESTOR) acede aos alertas → 200 array', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/alerts')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/predictions', () => {
    it('admin → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/predictions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.summary).toBeDefined();
      expect(Array.isArray(res.body.turnoverRisk)).toBe(true);
    });
  });

  describe('GET /dashboard-rh/correlations', () => {
    it('admin → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard-rh/correlations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.trainingVsPerformance).toBeDefined();
      expect(res.body.engagementVsPerformance).toBeDefined();
      expect(res.body.sampleSize).toBeDefined();
    });
  });
});
