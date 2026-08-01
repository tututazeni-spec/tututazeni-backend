import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('History & Timeline Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;
  let originalManagerId: number | null;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let createdEventId: number;

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

    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    employeeId = employee!.id;
    originalManagerId = employee!.managerId;
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    managerId = manager!.id;

    // Necessário para /history/timeline/team e a convenção MGMT_ROLES desta
    // suite — o seed partilhado não define managerId por omissão.
    await prisma.user.update({ where: { id: employeeId }, data: { managerId } });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: createdEventId } }).catch(() => undefined);
    await prisma.user
      .update({ where: { id: employeeId }, data: { managerId: originalManagerId } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Audit log (CRUD)', () => {
    it('RH regista evento manual → 201, enriquecido com categoria/ícone/título', async () => {
      const res = await request(app.getHttpServer())
        .post('/history/events')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          userId: employeeId,
          action: 'PROMOTION_GRANTED',
          entity: 'User',
          entityId: employeeId,
          category: 'CAREER',
          description: 'Promovido a Sénior',
        })
        .expect(201);
      createdEventId = res.body.id;
      expect(res.body.category).toBe('CAREER');
      expect(res.body.icon).toBeTruthy();
      expect(res.body.milestone).toBe(true); // PROMOTION tem impactScore >= 75
    });

    it('colaborador não pode registar eventos → 403', async () => {
      await request(app.getHttpServer())
        .post('/history/events')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, action: 'X', entity: 'User', category: 'SYSTEM' })
        .expect(403);
    });

    it('GET /history — RH lista com filtro por userId', async () => {
      const res = await request(app.getHttpServer())
        .get('/history')
        .query({ userId: employeeId })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.some((e: any) => e.id === createdEventId)).toBe(true);
    });

    it('GET /history — filtro por categoria (pós-processamento em memória)', async () => {
      const res = await request(app.getHttpServer())
        .get('/history')
        .query({ userId: employeeId, category: 'CAREER' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.every((e: any) => e.category === 'CAREER')).toBe(true);
    });

    it('colaborador não pode listar o audit log geral → 403', async () => {
      await request(app.getHttpServer())
        .get('/history')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /history/user/:userId — gestor (GESTOR) acede — verifica correcção do role-array-drift (MGMT_ROLES sem GESTOR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/history/user/${employeeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /history/:entity/:entityId — histórico da entidade', async () => {
      const res = await request(app.getHttpServer())
        .get(`/history/User/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((e: any) => e.id === createdEventId)).toBe(true);
    });
  });

  describe('Smart Timeline', () => {
    it('GET /history/timeline/me — gestor (GESTOR) acede à própria timeline — verifica correcção do role-array-drift (ALL_ROLES sem GESTOR)', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/timeline/me')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('grouped');
    });

    it('GET /history/timeline/me — colaborador acede, timeline reflecte o evento de audit criado', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/timeline/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((e: any) => e.entity === 'User' && e.entityId === employeeId)).toBe(
        true,
      );
    });

    it('GET /history/timeline/user/:userId — gestor vê a timeline do colaborador', async () => {
      const res = await request(app.getHttpServer())
        .get(`/history/timeline/user/${employeeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('colaborador não pode ver a timeline de outro utilizador → 403', async () => {
      await request(app.getHttpServer())
        .get(`/history/timeline/user/${managerId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /history/timeline/team — gestor vê a timeline da sua equipa (inclui o colaborador)', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/timeline/team')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.teamSize).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Milestones', () => {
    it('GET /history/milestones/me — gestor (GESTOR) acede — verifica correcção do role-array-drift', async () => {
      await request(app.getHttpServer())
        .get('/history/milestones/me')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('GET /history/milestones/user/:userId — gestor vê marcos do colaborador', async () => {
      const res = await request(app.getHttpServer())
        .get(`/history/milestones/user/${employeeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Activity stats', () => {
    it('GET /history/stats/me — gestor (GESTOR) acede — verifica correcção do role-array-drift', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/stats/me')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('streak');
      expect(res.body).toHaveProperty('heatmap');
    });

    it('GET /history/stats/user/:userId — gestor vê stats do colaborador', async () => {
      const res = await request(app.getHttpServer())
        .get(`/history/stats/user/${employeeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.userId).toBe(employeeId);
    });
  });

  describe('Upcoming events e audit stats (Admin/RH)', () => {
    it('GET /history/upcoming → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/upcoming')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('anniversaries');
      expect(res.body).toHaveProperty('expiringCertificates');
    });

    it('colaborador não pode aceder a /upcoming → 403', async () => {
      await request(app.getHttpServer())
        .get('/history/upcoming')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /history/audit/stats (Admin) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/history/audit/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty('byAction');
    });

    it('gestor não pode aceder a /audit/stats (ADMIN_ROLES apenas) → 403', async () => {
      await request(app.getHttpServer())
        .get('/history/audit/stats')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });
  });
});
