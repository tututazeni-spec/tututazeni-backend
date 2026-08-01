import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const SKILL_NAME = 'Int Test Skill Map — Node.js';
const CATEGORY_NAME = 'Int Test Category — Backend';
const ROLE_CODE = 'INT_TEST_ROLE_CM';

describe('Competency Map Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let managerToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let employeeId: number;
  let categoryId: number;
  let skillId: number;
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
    managerToken = await getToken(app.getHttpServer(), 'manager');

    const employee = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employee!.id;
  });

  afterAll(async () => {
    if (skillId) {
      await prisma.roleSkillRequirement.deleteMany({ where: { skillId } }).catch(() => undefined);
      await prisma.legacyEmployeeSkill.deleteMany({ where: { skillId } }).catch(() => undefined);
      await prisma.skillAssessmentHistory.deleteMany({ where: { skillId } }).catch(() => undefined);
      await prisma.skill.deleteMany({ where: { id: skillId } }).catch(() => undefined);
    }
    await prisma.roleSkillMatrix
      .deleteMany({ where: { roleCode: ROLE_CODE } })
      .catch(() => undefined);
    if (categoryId) {
      await prisma.skillCategory.deleteMany({ where: { id: categoryId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Categorias e catálogo de skills', () => {
    it('colaborador não pode criar categoria → 403', async () => {
      await request(app.getHttpServer())
        .post('/competency-map/categories')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: CATEGORY_NAME })
        .expect(403);
    });

    it('RH cria categoria → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competency-map/categories')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: CATEGORY_NAME, family: 'Engenharia', domain: 'Backend' })
        .expect(201);
      categoryId = res.body.id;
      expect(categoryId).toBeDefined();
    });

    it('GET /competency-map/categories → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/categories')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.id === categoryId)).toBe(true);
    });

    it('RH cria skill → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competency-map/skills')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: SKILL_NAME, type: 'TECHNICAL', categoryId })
        .expect(201);
      skillId = res.body.id;
      expect(skillId).toBeDefined();
    });

    it('GET /competency-map/skills — filtra por categoria → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/skills')
        .query({ categoryId })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((s: any) => s.id === skillId)).toBe(true);
    });

    it('GET /competency-map/skills/:id → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competency-map/skills/${skillId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(skillId);
    });

    it('PATCH /competency-map/skills/:id — actualiza → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/competency-map/skills/${skillId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Skill de integração' })
        .expect(200);
      expect(res.body.description).toBe('Skill de integração');
    });

    it('POST /competency-map/skills/proficiency-levels — cria nível → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competency-map/skills/proficiency-levels')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          skillId,
          level: 3,
          name: 'Intermédio',
          description: 'Consegue trabalhar com supervisão mínima',
          observableBehavior: 'Resolve problemas comuns sem ajuda',
        })
        .expect(201);
      levelId = res.body.id;
      expect(levelId).toBeDefined();
    });

    it('GET /competency-map/skills/:id/levels → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competency-map/skills/${skillId}/levels`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((l: any) => l.id === levelId)).toBe(true);
    });
  });

  describe('Matriz de skills por cargo', () => {
    it('RH define matriz do cargo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competency-map/role-matrix')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          roleCode: ROLE_CODE,
          department: 'Engenharia',
          skills: [{ skillId, requiredLevel: 4, weight: 1, mandatory: true }],
        })
        .expect(201);
      expect(res.body.requirements.length).toBe(1);
    });

    it('GET /competency-map/role-matrix/:roleCode → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competency-map/role-matrix/${ROLE_CODE}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.roleCode).toBe(ROLE_CODE);
    });

    it('GET /competency-map/role-matrix — lista todas → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/role-matrix')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((m: any) => m.roleCode === ROLE_CODE)).toBe(true);
    });
  });

  describe('Avaliação de skills do colaborador', () => {
    it('POST /competency-map/assess — autoavaliação nível 5 sem validação → 400', async () => {
      await request(app.getHttpServer())
        .post('/competency-map/assess')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, skillId, currentLevel: 5, source: 'SELF' })
        .expect(400);
    });

    it('POST /competency-map/assess — autoavaliação nível 3 → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competency-map/assess')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, skillId, currentLevel: 3, source: 'SELF' })
        .expect(201);
      expect(res.body.currentLevel).toBe(3);
    });

    it('POST /competency-map/assess — reavaliação regista histórico → 201', async () => {
      await request(app.getHttpServer())
        .post('/competency-map/assess')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, skillId, currentLevel: 4, source: 'SELF' })
        .expect(201);

      const history = await prisma.skillAssessmentHistory.findMany({
        where: { userId: employeeId, skillId },
      });
      expect(history.some(h => h.level === 3)).toBe(true);
    });

    it('GET /competency-map/my → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competency-map/my/radar → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/my/radar')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competency-map/my/gap — vs cargo definido → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/my/gap')
        .query({ roleCode: ROLE_CODE })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competency-map/my/history/:skillId → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competency-map/my/history/${skillId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.history.length).toBeGreaterThan(0);
    });

    it('POST /competency-map/assess/batch — GESTOR avalia em lote → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/competency-map/assess/batch')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          userId: employeeId,
          source: 'MANAGER',
          assessments: [{ skillId, currentLevel: 4, notes: 'Bom progresso' }],
        })
        .expect(201);
      expect(res.body.success).toBe(1);
    });
  });

  describe('Mapas de utilizador/equipa/departamento (RH/Gestor)', () => {
    it('GET /competency-map/user/:userId — colaborador não pode ver de outro → 403', async () => {
      await request(app.getHttpServer())
        .get(`/competency-map/user/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /competency-map/user/:userId — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competency-map/user/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competency-map/user/:userId/gap — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competency-map/user/${employeeId}/gap`)
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ roleCode: ROLE_CODE })
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competency-map/user/:userId/radar — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/competency-map/user/${employeeId}/radar`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competency-map/team — GESTOR → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/team')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Analytics organizacional', () => {
    it('GET /competency-map/heatmap — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/heatmap')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /competency-map/heatmap — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/competency-map/heatmap')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /competency-map/organisational-gap — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/competency-map/organisational-gap')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });
});
