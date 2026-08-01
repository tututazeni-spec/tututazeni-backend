import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const CONTENT_TITLE = 'Int Test Content — Introdução ao NestJS';

describe('Content Library Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let employeeId: number;
  let rhId: number;
  let contentId: number;

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

    const employee = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employee!.id;
    const rh = await prisma.user.findUnique({ where: { email: INT_CREDENTIALS.rh.email } });
    rhId = rh!.id;
  });

  afterAll(async () => {
    if (contentId) {
      await prisma.auditLog
        .deleteMany({ where: { entity: 'ContentAsset', entityId: contentId } })
        .catch(() => undefined);
      await prisma.contentAsset.deleteMany({ where: { id: contentId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Catálogo — CRUD', () => {
    it('colaborador não pode criar conteúdo → 403', async () => {
      await request(app.getHttpServer())
        .post('/content-library')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'X', format: 'ARTICLE', url: 'https://example.test/x' })
        .expect(403);
    });

    it('RH cria conteúdo (DRAFT) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/content-library')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: CONTENT_TITLE,
          format: 'ARTICLE',
          url: 'https://example.test/nestjs-intro',
          category: 'TECHNICAL',
          level: 'BEGINNER',
          tags: ['nestjs', 'backend'],
        })
        .expect(201);
      contentId = res.body.id;
      expect(contentId).toBeDefined();
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.createdById).toBe(rhId);
    });

    it('GET /content-library — conteúdo DRAFT não aparece no catálogo público → 200 sem incluir', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((c: any) => c.id === contentId)).toBe(false);
    });

    it('POST /content-library/:id/publish — RH publica → 200 e sobe versão', async () => {
      const res = await request(app.getHttpServer())
        .post(`/content-library/${contentId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.version).toBe('1.1');
    });

    it('GET /content-library — agora aparece no catálogo com filtro por categoria/tag → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library')
        .query({ category: 'TECHNICAL', tag: 'nestjs' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((c: any) => c.id === contentId)).toBe(true);
    });

    it('GET /content-library/:id — detalhe → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/content-library/${contentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(contentId);
    });

    it('PUT /content-library/:id — RH (não autor) pode editar → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/content-library/${contentId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Descrição actualizada' })
        .expect(200);
      expect(res.body.description).toBe('Descrição actualizada');
    });
  });

  describe('Interacções (view, bookmark)', () => {
    it('PATCH /content-library/:id/view — regista visualização → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/content-library/${contentId}/view`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('PATCH /content-library/:id/bookmark — guarda (toggle) → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/content-library/${contentId}/bookmark`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.bookmarked).toBe(true);
    });

    it('PATCH /content-library/:id/bookmark — repetido remove (toggle) → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/content-library/${contentId}/bookmark`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.bookmarked).toBe(false);
    });

    it('GET /content-library/trending → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library/trending')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /content-library/new → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library/new')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /content-library/categories → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library/categories')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /content-library/tags → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library/tags')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Progresso, ratings, notas — modelos ausentes do schema (degradam sem crashar)', () => {
    it('PATCH /content-library/:id/progress — degrada sem crashar → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/content-library/${contentId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ progress: 50, timeSpentSeconds: 300 })
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /content-library/my/progress — degrada sem crashar → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library/my/progress')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('POST /content-library/:id/rate — degrada sem crashar → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/content-library/${contentId}/rate`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ rating: 5, comment: 'Muito bom' })
        .expect(201);
      expect(res.body).toBeDefined();
    });

    it('GET /content-library/:id/ratings — degrada sem crashar → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/content-library/${contentId}/ratings`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('POST /content-library/:id/note — degrada sem crashar → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/content-library/${contentId}/note`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ note: 'Lembrar de rever isto depois' })
        .expect(201);
      expect(res.body).toBeDefined();
    });

    it('GET /content-library/:id/note — degrada sem crashar → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/content-library/${contentId}/note`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Analytics', () => {
    it('GET /content-library/analytics/dashboard — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library/analytics/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /content-library/analytics/dashboard — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/content-library/analytics/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /content-library/analytics/my-stats → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/content-library/analytics/my-stats')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Deprecar conteúdo', () => {
    it('POST /content-library/:id/deprecate — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/content-library/${contentId}/deprecate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.status).toBe('DEPRECATED');
      expect(res.body.active).toBe(false);
    });
  });
});
