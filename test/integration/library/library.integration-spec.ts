import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const OTHER_EMPLOYEE_EMAIL = 'int.library.other@innova-test.com';
const FILE_URL = `https://${process.env.ALLOWED_FILE_HOST ?? 'ci.innova.test'}/manual-integracao.pdf`;

describe('Library Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let otherEmployeeToken: string;

  let collectionId: string;
  let itemId: string;
  let commentId: string;

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

    const colaboradorRole = await prisma.role.findUnique({ where: { code: 'COLABORADOR' } });
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    const password = await bcrypt.hash('Test@1234', 10);
    await prisma.user.upsert({
      where: { email: OTHER_EMPLOYEE_EMAIL },
      update: {},
      create: {
        email: OTHER_EMPLOYEE_EMAIL,
        fullName: 'Outro Colaborador Library',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: OTHER_EMPLOYEE_EMAIL, password: 'Test@1234' })
      .expect(201);
    otherEmployeeToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (commentId)
      await (prisma as any).libraryComment
        .deleteMany({ where: { id: commentId } })
        .catch(() => undefined);
    if (itemId) {
      await (prisma as any).libraryRating.deleteMany({ where: { itemId } }).catch(() => undefined);
      await (prisma as any).libraryAccess.deleteMany({ where: { itemId } }).catch(() => undefined);
      await (prisma as any).libraryItem
        .deleteMany({ where: { id: itemId } })
        .catch(() => undefined);
    }
    if (collectionId)
      await (prisma as any).libraryCollection
        .deleteMany({ where: { id: collectionId } })
        .catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: OTHER_EMPLOYEE_EMAIL } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Colecções', () => {
    it('colaborador não pode criar colecção → 403', async () => {
      await request(app.getHttpServer())
        .post('/library/collections')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'Colecção Integração' })
        .expect(403);
    });

    it('RH cria colecção → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/library/collections')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Colecção Integração' })
        .expect(201);
      collectionId = res.body.id;
    });

    it('lista colecções → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/library/collections')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Itens — CRUD e aprovação', () => {
    it('colaborador não pode criar item → 403', async () => {
      await request(app.getHttpServer())
        .post('/library/items')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ type: 'DOCUMENT', title: 'Manual', fileUrl: FILE_URL, collectionId })
        .expect(403);
    });

    it('RH cria item → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/library/items')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ type: 'DOCUMENT', title: 'Manual de Integração', fileUrl: FILE_URL, collectionId })
        .expect(201);
      itemId = res.body.id;
    });

    it('URL de ficheiro com host não permitido → 400', async () => {
      await request(app.getHttpServer())
        .post('/library/items')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ type: 'DOCUMENT', title: 'Manual Malicioso', fileUrl: 'https://evil.com/x.pdf' })
        .expect(400);
    });

    it('lista itens (paginado) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/library/items')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('detalhe de item existente → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/library/items/${itemId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', itemId);
    });

    it('detalhe de item inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/library/items/nao-existe')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('RH actualiza o item → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/library/items/${itemId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Manual de Integração (revisto)' })
        .expect(200);
      expect(res.body.title).toBe('Manual de Integração (revisto)');
    });

    it('RH aprova o item → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/library/items/${itemId}/approve`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.isApproved).toBe(true);
    });
  });

  describe('Visualização, download e avaliação', () => {
    it('colaborador regista visualização → 201 e incrementa views', async () => {
      await request(app.getHttpServer())
        .post(`/library/items/${itemId}/view`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/library/items/${itemId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(detail.body.views).toBeGreaterThanOrEqual(1);
    });

    it('colaborador faz download → 201 com URL do ficheiro', async () => {
      const res = await request(app.getHttpServer())
        .post(`/library/items/${itemId}/download`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('fileUrl', FILE_URL);
    });

    it('colaborador avalia o item → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/library/items/${itemId}/rate`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ score: 4 })
        .expect(201);
      expect(res.body.score).toBe(4);
    });

    it('outro colaborador avalia com 5 → média recalculada para 4.5', async () => {
      await request(app.getHttpServer())
        .post(`/library/items/${itemId}/rate`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .send({ score: 5 })
        .expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/library/items/${itemId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(detail.body.rating).toBe(4.5);
      expect(detail.body.ratingCount).toBe(2);
    });

    it('colaborador reavalia (upsert) → não duplica, actualiza o próprio score', async () => {
      await request(app.getHttpServer())
        .post(`/library/items/${itemId}/rate`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ score: 2 })
        .expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/library/items/${itemId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(detail.body.ratingCount).toBe(2);
      expect(detail.body.rating).toBe(3.5);
    });
  });

  describe('Comentários — ownership', () => {
    it('colaborador comenta o item → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/library/items/${itemId}/comments`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ content: 'Muito útil, obrigado!' })
        .expect(201);
      commentId = res.body.id;
    });

    it('outro colaborador não pode remover comentário alheio → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/library/comments/${commentId}`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });

    it('autor remove o próprio comentário → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/library/comments/${commentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });

    it('remover comentário inexistente → 404', async () => {
      await request(app.getHttpServer())
        .delete('/library/comments/nao-existe')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });
  });

  describe('Remoção do item e dashboard', () => {
    it('colaborador não pode remover item → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/library/items/${itemId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('colaborador não acede ao dashboard → 403', async () => {
      await request(app.getHttpServer())
        .get('/library/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH acede ao dashboard → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/library/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('RH remove o item (soft delete) → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/library/items/${itemId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('item removido deixa de ser acessível → 404', async () => {
      await request(app.getHttpServer())
        .get(`/library/items/${itemId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });
});
