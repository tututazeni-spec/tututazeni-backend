import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const COMPETENCY_NAME = 'Int Test Competency — TypeScript';

describe('Competencies Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let employeeId: number;
  let rhId: number;
  let competencyId: number;
  let positionId: number;
  let levelId: number;

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
    const rh = await prisma.user.findUnique({ where: { email: INT_CREDENTIALS.rh.email } });
    rhId = rh!.id;

    const position = await prisma.position.create({
      data: { name: 'Int Test Position — Competencies', level: 'SENIOR' },
    });
    positionId = position.id;
  });

  afterAll(async () => {
    if (competencyId) {
      await prisma.userCompetency.deleteMany({ where: { competencyId } }).catch(() => undefined);
      await prisma.competencyEvolutionLog
        .deleteMany({ where: { competencyId } })
        .catch(() => undefined);
      await prisma.competencyEndorsement
        .deleteMany({ where: { competencyId } })
        .catch(() => undefined);
      await prisma.positionCompetency
        .deleteMany({ where: { competencyId } })
        .catch(() => undefined);
      await prisma.competency.deleteMany({ where: { id: competencyId } }).catch(() => undefined);
    }
    if (positionId) {
      await prisma.position.deleteMany({ where: { id: positionId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Catálogo — CRUD', () => {
    it('colaborador não pode criar competência → 403', async () => {
      await request(app.getHttpServer())
        .post('/competencies')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', category: 'HARD_SKILL' })
        .expect(403);
    });

    it('RH cria competência → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competencies')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: COMPETENCY_NAME, category: 'HARD_SKILL', tags: ['dev'] })
        .expect(201);
      competencyId = res.body.id;
      expect(competencyId).toBeDefined();
    });

    it('nome duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/competencies')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: COMPETENCY_NAME, category: 'HARD_SKILL' })
        .expect(409);
    });

    it('GET /competencies — colaborador lista catálogo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competencies')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((c: any) => c.id === competencyId)).toBe(true);
    });

    it('GET /competencies/:id — detalhe → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competencies/${competencyId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(competencyId);
    });

    it('PUT /competencies/:id — actualiza descrição → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/competencies/${competencyId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Competência técnica em TypeScript' })
        .expect(200);
      expect(res.body.description).toBe('Competência técnica em TypeScript');
    });

    it('POST /competencies/proficiency-levels — cria nível → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competencies/proficiency-levels')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ competencyId, name: 'Avançado', value: 4 })
        .expect(201);
      levelId = res.body.id;
      expect(levelId).toBeDefined();
    });

    it('POST /competencies/proficiency-levels — valor duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/competencies/proficiency-levels')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ competencyId, name: 'Outro nome', value: 4 })
        .expect(409);
    });
  });

  describe('Mapeamentos', () => {
    it('POST /competencies/map/position — cria mapeamento (sem @@unique — find-then-write) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competencies/map/position')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ positionId, competencyId, requiredLevel: 4, priority: 'MANDATORY' })
        .expect(201);
      expect(res.body.requiredLevel).toBe(4);
    });

    it('POST /competencies/map/position — repetido actualiza em vez de duplicar → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competencies/map/position')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ positionId, competencyId, requiredLevel: 5, priority: 'OPTIONAL' })
        .expect(201);
      expect(res.body.requiredLevel).toBe(5);

      const rows = await prisma.positionCompetency.findMany({
        where: { positionId, competencyId },
      });
      expect(rows.length).toBe(1);
    });

    it('DELETE /competencies/map/position/:positionId/:competencyId → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/competencies/map/position/${positionId}/${competencyId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('Competências do utilizador', () => {
    it('POST /competencies/my/self-assess — autoavaliação → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/competencies/my/self-assess')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ competencyId, selfLevel: 3 })
        .expect(200);
      expect(res.body.selfLevel).toBe(3);
      expect(res.body.currentLevel).toBe(3);
    });

    it('GET /competencies/my/profile — inclui a competência → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competencies/my/profile')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.competencyId === competencyId)).toBe(true);
    });

    it('POST /competencies/user/manager-assess — RH avalia (detecta divergência) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competencies/user/manager-assess')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, competencyId, managerLevel: 5, feedback: 'Excelente' })
        .expect(201);
      expect(res.body.managerLevel).toBe(5);
    });

    it('GET /competencies/my/evolution — regista histórico → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competencies/my/evolution')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ competencyId })
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /competencies/my/gap/:positionId → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competencies/my/gap/${positionId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competencies/user/:userId — colaborador não pode ver de outro → 403', async () => {
      await request(app.getHttpServer())
        .get(`/competencies/user/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /competencies/user/:userId — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competencies/user/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.competencyId === competencyId)).toBe(true);
    });
  });

  describe('Endorsements', () => {
    it('POST /competencies/endorse — RH endossa colega → 201', async () => {
      await request(app.getHttpServer())
        .post('/competencies/endorse')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetUserId: employeeId, competencyId, comment: 'Óptimo trabalho em equipa' })
        .expect(201);
    });

    it('POST /competencies/endorse — repetido → 409', async () => {
      await request(app.getHttpServer())
        .post('/competencies/endorse')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetUserId: employeeId, competencyId })
        .expect(409);
    });

    it('POST /competencies/endorse — não pode endossar a si próprio → 400', async () => {
      await request(app.getHttpServer())
        .post('/competencies/endorse')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetUserId: rhId, competencyId })
        .expect(400);
    });

    it('GET /competencies/my/endorsements → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competencies/my/endorsements')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Analytics organizacional', () => {
    it('GET /competencies/top — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competencies/top')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competencies/skill-matrix — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competencies/skill-matrix')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competencies/dashboard/gaps — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competencies/dashboard/gaps')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Remoção', () => {
    it('DELETE /competencies/:id — RH (não ADMIN) → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/competencies/${competencyId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });

    it('DELETE /competencies/:id — com utilizadores associados → 400', async () => {
      await request(app.getHttpServer())
        .delete(`/competencies/${competencyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('PATCH /competencies/:id/archive → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/competencies/${competencyId}/archive`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('INACTIVE');
    });
  });
});
