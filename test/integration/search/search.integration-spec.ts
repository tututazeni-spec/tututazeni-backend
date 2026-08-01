import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const MARK = `inttestsearch${Date.now()}`;

describe('Search Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let activeCourseId: number;
  let inactiveCourseId: number;
  let articleId: number;

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

    const activeCourse = await prisma.course.create({
      data: { title: `${MARK} Active Course`, internalCode: `${MARK}-ACTIVE`, status: 'PUBLISHED' },
    });
    activeCourseId = activeCourse.id;

    const inactiveCourse = await prisma.course.create({
      data: { title: `${MARK} Inactive Course`, internalCode: `${MARK}-INACTIVE`, status: 'DRAFT' },
    });
    inactiveCourseId = inactiveCourse.id;

    const article = await prisma.knowledgeArticle.create({
      data: {
        title: `${MARK} Article Title`,
        summary: `${MARK} summary text`,
        content: 'Conteudo completo do artigo de teste.',
        authorId: employeeId,
        tags: { create: [{ name: `${MARK}-tag` }] },
      },
    });
    articleId = article.id;
  });

  afterAll(async () => {
    await prisma.knowledgeTag.deleteMany({ where: { articleId } }).catch(() => undefined);
    await prisma.knowledgeArticle.deleteMany({ where: { id: articleId } }).catch(() => undefined);
    await prisma.course
      .deleteMany({ where: { id: { in: [activeCourseId, inactiveCourseId] } } })
      .catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Autenticação e RBAC', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/search').query({ q: 'x' }).expect(401);
    });

    it('qualquer autenticado pode pesquisar', async () => {
      await request(app.getHttpServer())
        .get('/search')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK })
        .expect(200);
    });

    it('colaborador não acede a analytics (tier ADMIN/RH)', async () => {
      await request(app.getHttpServer())
        .get('/search/analytics')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor não acede a analytics', async () => {
      await request(app.getHttpServer())
        .get('/search/analytics')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('RH e ADMIN acedem a analytics', async () => {
      await request(app.getHttpServer())
        .get('/search/analytics')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/search/analytics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Pesquisa global', () => {
    it('encontra o curso activo pelo título', async () => {
      const res = await request(app.getHttpServer())
        .get('/search')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK, types: ['course'] })
        .expect(200);
      expect(res.body.grouped.courses.some((c: any) => c.id === activeCourseId)).toBe(true);
    });

    it('encontra o documento (bug: description/tags inexistentes na KnowledgeArticle rebentavam sempre, escondido pelo .catch())', async () => {
      const res = await request(app.getHttpServer())
        .get('/search')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK, types: ['document'] })
        .expect(200);
      expect(res.body.grouped.documents.some((d: any) => d.id === articleId)).toBe(true);
      const found = res.body.grouped.documents.find((d: any) => d.id === articleId);
      expect(found.subtitle).toContain('summary');
    });

    it('encontra o documento pela tag associada', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/documents')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: `${MARK}-tag` })
        .expect(200);
      expect(res.body.results.some((d: any) => d.id === articleId)).toBe(true);
    });

    it('?activeOnly=false (bug: nunca era lido, e ?false coagia para true) inclui o curso inactivo', async () => {
      const res = await request(app.getHttpServer())
        .get('/search')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK, types: ['course'], activeOnly: 'false' })
        .expect(200);
      expect(res.body.grouped.courses.some((c: any) => c.id === inactiveCourseId)).toBe(true);
    });

    it('sem activeOnly (default) exclui o curso inactivo', async () => {
      const res = await request(app.getHttpServer())
        .get('/search')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK, types: ['course'] })
        .expect(200);
      expect(res.body.grouped.courses.some((c: any) => c.id === inactiveCourseId)).toBe(false);
      expect(res.body.grouped.courses.some((c: any) => c.id === activeCourseId)).toBe(true);
    });

    it('query curta (<2 chars) devolve vazio sem tocar na BD', async () => {
      const res = await request(app.getHttpServer())
        .get('/search')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: 'a' })
        .expect(200);
      expect(res.body.results).toEqual([]);
    });
  });

  describe('Pesquisas tipadas', () => {
    it('GET /search/courses', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/courses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK })
        .expect(200);
      expect(res.body.results.some((c: any) => c.id === activeCourseId)).toBe(true);
    });

    it('GET /search/users', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/users')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: 'int.employee' })
        .expect(200);
      expect(res.body.type).toBe('user');
    });

    it('GET /search/competencies e /search/scenarios não rebentam', async () => {
      await request(app.getHttpServer())
        .get('/search/competencies')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK })
        .expect(200);
      await request(app.getHttpServer())
        .get('/search/scenarios')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK })
        .expect(200);
    });

    it('GET /search/pdi não rebenta', async () => {
      await request(app.getHttpServer())
        .get('/search/pdi')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK })
        .expect(200);
    });
  });

  describe('Autocomplete e sugestões', () => {
    it('autocomplete devolve sugestões sem rebentar', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/autocomplete')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ q: MARK })
        .expect(200);
      expect(Array.isArray(res.body.suggestions)).toBe(true);
    });

    it('sugestões personalizadas não rebentam', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/suggestions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.recommendedCourses).toBeDefined();
    });
  });

  describe('Histórico de pesquisas (modelo SearchHistory não existe no schema — safeM() degrada sempre para vazio)', () => {
    it('GET /search/history não rebenta, mas nunca reflecte pesquisas reais (modelo inexistente)', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/history')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.history).toEqual([]);
      expect(res.body.count).toBe(0);
    });

    it('DELETE /search/history é um no-op inofensivo (nada para limpar)', async () => {
      await request(app.getHttpServer())
        .delete('/search/history')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });
  });
});
