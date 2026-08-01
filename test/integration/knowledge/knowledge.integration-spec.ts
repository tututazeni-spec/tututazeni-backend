import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Knowledge Base Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let categoryId: number;
  let mandatoryArticleId: number;
  let normalArticleId: number;
  let commentId: number;
  let questionId: number;

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
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    managerId = manager!.id;
  });

  afterAll(async () => {
    const articleIds = [mandatoryArticleId, normalArticleId].filter(Boolean);
    if (articleIds.length) {
      await prisma.articleAcknowledgement
        .deleteMany({ where: { articleId: { in: articleIds } } })
        .catch(() => undefined);
      await prisma.articleQuestion
        .deleteMany({ where: { articleId: { in: articleIds } } })
        .catch(() => undefined);
      await prisma.articleComment
        .deleteMany({ where: { articleId: { in: articleIds } } })
        .catch(() => undefined);
      await prisma.articleRating
        .deleteMany({ where: { articleId: { in: articleIds } } })
        .catch(() => undefined);
      await prisma.knowledgeInteraction
        .deleteMany({ where: { articleId: { in: articleIds } } })
        .catch(() => undefined);
      await prisma.articleVersion
        .deleteMany({ where: { articleId: { in: articleIds } } })
        .catch(() => undefined);
      await prisma.knowledgeTag
        .deleteMany({ where: { articleId: { in: articleIds } } })
        .catch(() => undefined);
      await prisma.knowledgeArticle
        .deleteMany({ where: { id: { in: articleIds } } })
        .catch(() => undefined);
    }
    await prisma.knowledgeSearchLog
      .deleteMany({ where: { query: 'zzz-inexistente-integracao' } })
      .catch(() => undefined);
    if (categoryId) {
      await prisma.knowledgeCategory
        .deleteMany({ where: { id: categoryId } })
        .catch(() => undefined);
    }
    await prisma.userPoints.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Categorias', () => {
    it('colaborador não pode criar categoria → 403', async () => {
      await request(app.getHttpServer())
        .post('/knowledge/categories')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X' })
        .expect(403);
    });

    it('RH cria categoria (slug auto-gerado) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/knowledge/categories')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Políticas Integração Teste' })
        .expect(201);
      categoryId = res.body.id;
      expect(res.body.slug).toBeTruthy();
    });

    it('GET /knowledge/categories — lista com contagens', async () => {
      const res = await request(app.getHttpServer())
        .get('/knowledge/categories')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.id === categoryId)).toBe(true);
    });
  });

  describe('Artigos — CRUD, versões e publicação', () => {
    it('colaborador cria artigo obrigatório (inicia DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .post('/knowledge')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          title: 'Política de Férias Integração',
          content: 'Conteúdo inicial do artigo de teste de integração.',
          categoryId,
          mandatory: true,
          tags: ['ferias', 'rh'],
        })
        .expect(201);
      mandatoryArticleId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.tags.length).toBe(2);
    });

    it('gamificação: pontos atribuídos ao autor pela criação', async () => {
      const points = await prisma.userPoints.findUnique({ where: { userId: employeeId } });
      expect(points!.points).toBeGreaterThanOrEqual(30);
    });

    it('não aparece em /knowledge (só publicados) enquanto DRAFT', async () => {
      const res = await request(app.getHttpServer())
        .get('/knowledge')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((a: any) => a.id === mandatoryArticleId)).toBe(false);
    });

    it('RH publica o artigo → PUBLISHED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/knowledge/${mandatoryArticleId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('agora aparece em /knowledge', async () => {
      const res = await request(app.getHttpServer())
        .get('/knowledge')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((a: any) => a.id === mandatoryArticleId)).toBe(true);
    });

    it('actualizar conteúdo → cria nova versão automaticamente', async () => {
      await request(app.getHttpServer())
        .put(`/knowledge/${mandatoryArticleId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ content: 'Conteúdo revisto da política de férias.', changeReason: 'Revisão anual' })
        .expect(200);

      const versions = await request(app.getHttpServer())
        .get(`/knowledge/${mandatoryArticleId}/versions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(versions.body.length).toBe(2);
    });

    it('restaurar versão anterior → cria terceira versão com conteúdo original', async () => {
      const versions = await request(app.getHttpServer())
        .get(`/knowledge/${mandatoryArticleId}/versions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const v1 = versions.body.find((v: any) => v.version === 1);

      await request(app.getHttpServer())
        .post(`/knowledge/${mandatoryArticleId}/versions/${v1.id}/restore`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);

      const article = await prisma.knowledgeArticle.findUnique({
        where: { id: mandatoryArticleId },
      });
      expect(article!.content).toBe('Conteúdo inicial do artigo de teste de integração.');
    });

    it('criar segundo artigo não-obrigatório para testes de filtro/remoção', async () => {
      const res = await request(app.getHttpServer())
        .post('/knowledge')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          title: 'Guia Normal Integração',
          content: 'Conteúdo do guia normal.',
          categoryId,
          mandatory: false,
        })
        .expect(201);
      normalArticleId = res.body.id;
      await request(app.getHttpServer())
        .patch(`/knowledge/${normalArticleId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('Filtro booleano (bug: ?mandatory=false devia excluir obrigatórios)', () => {
    it('?mandatory=true — inclui só o artigo obrigatório', async () => {
      const res = await request(app.getHttpServer())
        .get('/knowledge')
        .query({ mandatory: 'true' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((a: any) => a.id === mandatoryArticleId)).toBe(true);
      expect(res.body.data.some((a: any) => a.id === normalArticleId)).toBe(false);
    });

    it('?mandatory=false — NÃO deve incluir o artigo obrigatório', async () => {
      const res = await request(app.getHttpServer())
        .get('/knowledge')
        .query({ mandatory: 'false' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((a: any) => a.id === mandatoryArticleId)).toBe(false);
      expect(res.body.data.some((a: any) => a.id === normalArticleId)).toBe(true);
    });
  });

  describe('Detalhe, visualizações, interacções e rating', () => {
    it('GET /knowledge/:id — regista VIEW única e devolve estado do utilizador', async () => {
      const res = await request(app.getHttpServer())
        .get(`/knowledge/${normalArticleId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.userBookmarked).toBe(false);
      expect(res.body.userAcknowledged).toBe(false);

      const article = await prisma.knowledgeArticle.findUnique({ where: { id: normalArticleId } });
      expect(article!.viewCount).toBe(1);
    });

    it('segunda visualização na mesma janela de 30min não duplica a contagem', async () => {
      await request(app.getHttpServer())
        .get(`/knowledge/${normalArticleId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const article = await prisma.knowledgeArticle.findUnique({ where: { id: normalArticleId } });
      expect(article!.viewCount).toBe(1);
    });

    it('BOOKMARK faz toggle (activa e depois desactiva)', async () => {
      const res1 = await request(app.getHttpServer())
        .post('/knowledge/interact')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ articleId: normalArticleId, action: 'BOOKMARK' })
        .expect(200);
      expect(res1.body.active).toBe(true);

      const bookmarks = await request(app.getHttpServer())
        .get('/knowledge/my/bookmarks')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(bookmarks.body.some((a: any) => a.id === normalArticleId)).toBe(true);

      const res2 = await request(app.getHttpServer())
        .post('/knowledge/interact')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ articleId: normalArticleId, action: 'BOOKMARK' })
        .expect(200);
      expect(res2.body.active).toBe(false);
    });

    it('avaliar artigo (1-5) → actualiza avgRating', async () => {
      await request(app.getHttpServer())
        .post('/knowledge/rate')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ articleId: normalArticleId, score: 4 })
        .expect(200);

      const article = await prisma.knowledgeArticle.findUnique({ where: { id: normalArticleId } });
      expect(article!.avgRating).toBe(4);
    });

    it('reavaliar (upsert) — não duplica, actualiza a média', async () => {
      await request(app.getHttpServer())
        .post('/knowledge/rate')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ articleId: normalArticleId, score: 2 })
        .expect(200);

      const count = await prisma.articleRating.count({
        where: { articleId: normalArticleId, userId: managerId },
      });
      expect(count).toBe(1);
      const article = await prisma.knowledgeArticle.findUnique({ where: { id: normalArticleId } });
      expect(article!.avgRating).toBe(2);
    });
  });

  describe('Comentários', () => {
    it('comentar artigo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/knowledge/comments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ articleId: normalArticleId, content: 'Muito útil, obrigado!' })
        .expect(201);
      commentId = res.body.id;
    });

    it('outro utilizador não pode remover comentário alheio → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/knowledge/comments/${commentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('autor remove o próprio comentário → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/knowledge/comments/${commentId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });
  });

  describe('Q&A', () => {
    it('colocar pergunta → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/knowledge/questions')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ articleId: normalArticleId, question: 'Aplica-se a estagiários?' })
        .expect(201);
      questionId = res.body.id;
    });

    it('responder à pergunta → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/knowledge/questions/answer')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ questionId, answer: 'Sim, aplica-se a todos.' })
        .expect(200);
      expect(res.body.answer).toBe('Sim, aplica-se a todos.');
    });
  });

  describe('Leitura obrigatória (acknowledgements)', () => {
    it('confirmar leitura do artigo obrigatório → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/knowledge/acknowledge')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ articleId: mandatoryArticleId })
        .expect(200);
      expect(res.body.acknowledged).toBe(true);
    });

    it('confirmar de novo — idempotente, não duplica', async () => {
      const res = await request(app.getHttpServer())
        .post('/knowledge/acknowledge')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ articleId: mandatoryArticleId })
        .expect(200);
      expect(res.body.alreadyAcknowledged).toBe(true);

      const count = await prisma.articleAcknowledgement.count({
        where: { articleId: mandatoryArticleId, userId: managerId },
      });
      expect(count).toBe(1);
    });

    it('RH vê relatório de confirmação de leitura', async () => {
      const res = await request(app.getHttpServer())
        .get(`/knowledge/${mandatoryArticleId}/acknowledgements`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.read).toBeGreaterThanOrEqual(1);
      expect(res.body.acknowledgedUsers.some((u: any) => u.id === managerId)).toBe(true);
    });

    it('artigo obrigatório com confirmações não pode ser eliminado → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/knowledge/${mandatoryArticleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });
  });

  describe('Trending, busca e dashboard', () => {
    it('GET /knowledge/trending — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/knowledge/trending')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /knowledge/search — encontra por termo do título', async () => {
      const res = await request(app.getHttpServer())
        .get('/knowledge/search')
        .query({ q: 'Férias Integração' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((a: any) => a.id === mandatoryArticleId)).toBe(true);
    });

    it('busca sem resultados → regista knowledgeSearchLog para gap analysis', async () => {
      await request(app.getHttpServer())
        .get('/knowledge/search')
        .query({ q: 'zzz-inexistente-integracao' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const log = await prisma.knowledgeSearchLog.findFirst({
        where: { query: 'zzz-inexistente-integracao' },
      });
      expect(log).toBeTruthy();
      expect(log!.resultsCount).toBe(0);
    });

    it('colaborador não acede ao dashboard admin → 403', async () => {
      await request(app.getHttpServer())
        .get('/knowledge/admin/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH vê o dashboard com métricas e knowledge gaps', async () => {
      const res = await request(app.getHttpServer())
        .get('/knowledge/admin/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.articles.total).toBeGreaterThanOrEqual(2);
      expect(
        res.body.knowledgeGaps.some((g: any) => g.query === 'zzz-inexistente-integracao'),
      ).toBe(true);
    });
  });

  describe('Arquivamento e remoção', () => {
    it('arquivar artigo normal → ARCHIVED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/knowledge/${normalArticleId}/archive`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ARCHIVED');
    });

    it('eliminar artigo normal (sem confirmações obrigatórias) → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/knowledge/${normalArticleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      normalArticleId = 0 as any;
    });
  });
});
