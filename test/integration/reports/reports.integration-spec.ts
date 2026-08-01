import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Reports Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const savedReportIds: number[] = [];
  const scheduleIds: number[] = [];

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
    for (const id of scheduleIds) {
      await prisma.reportSchedule.deleteMany({ where: { id } }).catch(() => undefined);
    }
    for (const id of savedReportIds) {
      await prisma.savedReport.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Autenticação e RBAC (bug: ALL_MGMT hand-rolado omitia GESTOR)', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/reports/hr/headcount').expect(401);
    });

    it('colaborador não acede a nenhum relatório de gestão', async () => {
      await request(app.getHttpServer())
        .get('/reports/hr/headcount')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor (GESTOR) agora acede — antes ficava 403 por omissão no ALL_MGMT', async () => {
      await request(app.getHttpServer())
        .get('/reports/hr/headcount')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('RH e ADMIN também acedem', async () => {
      await request(app.getHttpServer())
        .get('/reports/hr/headcount')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/reports/hr/headcount')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('gestor não acede a payroll/compliance/usage (tier ADMIN/RH apenas)', async () => {
      await request(app.getHttpServer())
        .get('/reports/hr/payroll')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ period: '2026-01' })
        .expect(403);
      await request(app.getHttpServer())
        .get('/reports/compliance')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/reports/operational/usage')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });
  });

  describe('Relatórios HR', () => {
    it('headcount devolve resumo e agrupamentos', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/hr/headcount')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.report).toBe('HEADCOUNT');
      expect(res.body.summary.total).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(res.body.byDepartment)).toBe(true);
    });

    it('turnover devolve taxa de retenção', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/hr/turnover')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.summary.retentionRate).toBeDefined();
    });

    it('attendance não rebenta 500 (bug: include employee inexistente na AttendanceRecord)', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/hr/attendance')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ from: '2020-01-01', to: '2030-01-01' })
        .expect(200);
      expect(res.body.report).toBe('ATTENDANCE');
      expect(res.body.presenceRate).toBeDefined();
    });

    it('payroll (ADMIN/RH apenas) devolve resumo', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/hr/payroll')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ period: '2026-01' })
        .expect(200);
      expect(res.body.report).toBe('PAYROLL');
    });
  });

  describe('Relatórios de formação, performance, engagement, talento, compliance', () => {
    it('training report', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/learning/training')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.report).toBe('TRAINING');
      expect(res.body.summary).toBeDefined();
    });

    it('skill-gap report', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/learning/skill-gap')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.report).toBe('SKILL_GAP');
    });

    it('performance report (novo endpoint completo)', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/performance')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.report).toBe('PERFORMANCE');
      expect(res.body.summary.distribution).toBeDefined();
    });

    it('performance/by-period (legacy)', async () => {
      await request(app.getHttpServer())
        .get('/reports/performance/by-period')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ period: '2026-Q1' })
        .expect(200);
    });

    it('engagement report', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/engagement')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.report).toBe('ENGAGEMENT');
    });

    it('talent report', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/talent')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.report).toBe('TALENT');
    });

    it('compliance report (ADMIN/RH apenas)', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/compliance')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.report).toBe('COMPLIANCE');
    });

    it('competency-gap (legacy)', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/competency-gap')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('operational/usage (ADMIN/RH apenas)', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/operational/usage')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.report).toBe('PLATFORM_USAGE');
    });

    it('insights agrega os 4 relatórios sem 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/insights')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body.insights)).toBe(true);
    });
  });

  describe('Templates e exportação CSV', () => {
    it('templates devolve os 9 built-in quando não há guardados', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(9);
    });

    it('export/skill-gap-csv devolve CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/export/skill-gap-csv')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.split('\n')[0]).toContain('skill');
    });

    it('export/performance-csv devolve CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/export/performance-csv')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });

  describe('Saved Reports — ownership na remoção (bug: deleteReport/deleteSchedule sem verificação de dono)', () => {
    let rhReportId: number;
    let rhScheduleId: number;

    it('RH guarda um relatório', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports/saved')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Relatório INT-TEST RH',
          category: 'HR',
          reportKey: 'headcount',
          params: JSON.stringify({}),
        })
        .expect(201);
      rhReportId = res.body.id;
      savedReportIds.push(rhReportId);
    });

    it('gestor não vê o relatório guardado do RH na sua lista', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/saved')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.id === rhReportId)).toBe(false);
    });

    it('RH vê o próprio relatório na lista', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/saved')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.id === rhReportId)).toBe(true);
    });

    it('gestor (não dono, não ADMIN/RH) não pode apagar o relatório do RH → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/reports/saved/${rhReportId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });

    it('RH agenda o relatório', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports/schedules')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ savedReportId: rhReportId, frequency: 'WEEKLY' })
        .expect(201);
      rhScheduleId = res.body.id;
      scheduleIds.push(rhScheduleId);
    });

    it('gestor não pode cancelar o agendamento do RH → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/reports/schedules/${rhScheduleId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });

    it('ADMIN (privilegiado) pode cancelar o agendamento do RH', async () => {
      await request(app.getHttpServer())
        .delete(`/reports/schedules/${rhScheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('o próprio RH pode apagar o seu relatório', async () => {
      await request(app.getHttpServer())
        .delete(`/reports/saved/${rhReportId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('apagar relatório inexistente continua idempotente (200)', async () => {
      await request(app.getHttpServer())
        .delete('/reports/saved/999999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });
});
