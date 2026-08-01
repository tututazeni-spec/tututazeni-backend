import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Executive Reports Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let reportId: number;
  let autoReportId: number;

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
  });

  afterAll(async () => {
    const ids = [reportId, autoReportId].filter(Boolean);
    if (ids.length) {
      await prisma.reportAccessLog
        .deleteMany({ where: { reportId: { in: ids } } })
        .catch(() => undefined);
      await prisma.reportApproval
        .deleteMany({ where: { reportId: { in: ids } } })
        .catch(() => undefined);
      await prisma.executiveMetric
        .deleteMany({ where: { reportId: { in: ids } } })
        .catch(() => undefined);
      await prisma.reportLog
        .deleteMany({ where: { fileUrl: { contains: 'executive-' } } })
        .catch(() => undefined);
      await prisma.executiveReport
        .deleteMany({ where: { id: { in: ids } } })
        .catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('RBAC', () => {
    it('colaborador não tem acesso a nenhuma rota do módulo → 403', async () => {
      await request(app.getHttpServer())
        .get('/executive-reports')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('CRUD e workflow (DRAFT → IN_REVIEW → APPROVED → PUBLISHED)', () => {
    it('RH cria relatório manual com métricas → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/executive-reports')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Int Test Executive Report',
          type: 'MONTHLY',
          period: '2026-06',
          metrics: [{ label: 'Headcount', value: 100, target: 120 }],
          autoGenerateNarrative: true,
        })
        .expect(201);
      reportId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.metrics).toHaveLength(1);
      expect(res.body.narrative).toBeTruthy();
    });

    it('GET /executive-reports/:id — regista acesso → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/executive-reports/${reportId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(reportId);

      const log = await prisma.reportAccessLog.findFirst({ where: { reportId } });
      expect(log).toBeTruthy();
    });

    it('submeter para revisão → IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/executive-reports/${reportId}/submit`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('IN_REVIEW');
    });

    it('não pode editar relatório fora de DRAFT/IN_REVIEW após aprovado (verifica depois)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/executive-reports/${reportId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ subtitle: 'Ajustado durante revisão' })
        .expect(200);
      expect(res.body.subtitle).toBe('Ajustado durante revisão');
    });

    it('admin aprova o relatório → APPROVED', async () => {
      const res = await request(app.getHttpServer())
        .post('/executive-reports/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reportId, decision: 'approve', comment: 'Aprovado para publicação' })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('relatório aprovado não pode ser editado → 400', async () => {
      await request(app.getHttpServer())
        .put(`/executive-reports/${reportId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ subtitle: 'x' })
        .expect(400);
    });

    it('publicar relatório aprovado → PUBLISHED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/executive-reports/${reportId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('relatório publicado não pode ser eliminado → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/executive-reports/${reportId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });

    it('arquivar relatório publicado → ARCHIVED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/executive-reports/${reportId}/archive`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ARCHIVED');
    });
  });

  describe('Auto-geração', () => {
    it('RH gera relatório automático mensal com KPIs reais → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/executive-reports/auto-generate')
        .query({ type: 'MONTHLY' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      autoReportId = res.body.id;
      expect(res.body.metrics.length).toBeGreaterThan(5);
      expect(res.body.narrative).toBeTruthy();
    });
  });

  describe('Listagem, stats, templates, snapshots', () => {
    it('GET /executive-reports — filtra por status → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/executive-reports')
        .query({ status: 'ARCHIVED' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.some((r: any) => r.id === reportId)).toBe(true);
    });

    it('GET /executive-reports/stats — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/executive-reports/stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });

    it('GET /executive-reports/templates — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/executive-reports/templates')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.length).toBe(4);
    });

    it('GET /executive-reports/snapshots/:orgId — sem dados (nunca escrito) → 200 array vazio', async () => {
      const res = await request(app.getHttpServer())
        .get('/executive-reports/snapshots/1')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });
});
