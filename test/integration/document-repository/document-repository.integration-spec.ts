import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Document Repository Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;
  let departmentName: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let categoryId: number;
  let documentId: number;
  let confidentialDocId: number;
  let permissionId: number;
  let shareToken: string;

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
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    departmentName = dept!.name;
  });

  afterAll(async () => {
    const ids = [documentId, confidentialDocId].filter(Boolean);
    if (ids.length) {
      await prisma.docDownload
        .deleteMany({ where: { documentId: { in: ids } } })
        .catch(() => undefined);
      await prisma.docAuditLog
        .deleteMany({ where: { documentId: { in: ids } } })
        .catch(() => undefined);
      await prisma.docShareLink
        .deleteMany({ where: { documentId: { in: ids } } })
        .catch(() => undefined);
      await prisma.docPermission
        .deleteMany({ where: { documentId: { in: ids } } })
        .catch(() => undefined);
      await prisma.docVersion
        .deleteMany({ where: { documentId: { in: ids } } })
        .catch(() => undefined);
      await prisma.document.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    }
    if (categoryId) {
      await prisma.docCategoryModel
        .deleteMany({ where: { id: categoryId } })
        .catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Categories', () => {
    it('colaborador não pode criar categoria → 403', async () => {
      await request(app.getHttpServer())
        .post('/documents/categories')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', type: 'OTHER' })
        .expect(403);
    });

    it('RH cria categoria → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/documents/categories')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Category', type: 'CORPORATE', retentionYears: 5 })
        .expect(201);
      categoryId = res.body.id;
      expect(categoryId).toBeDefined();
    });

    it('GET /documents/categories — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/documents/categories')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.id === categoryId)).toBe(true);
    });
  });

  describe('Documents — CRUD, versões, notes/requestSignature (verifica correcção schema)', () => {
    it('gestor publica documento com notes e requestSignature → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/documents')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Int Test Document',
          category: 'CORPORATE',
          sensitivity: 'INTERNAL',
          fileUrl: 'https://ci.innova.test/docs/int-test.pdf',
          mimeType: 'application/pdf',
          notes: 'Documento para testes de integração',
          requestSignature: true,
        })
        .expect(201);
      documentId = res.body.id;
      expect(documentId).toBeDefined();
      expect(res.body.notes).toBe('Documento para testes de integração');
      expect(res.body.requestSignature).toBe(true);
      expect(res.body.retentionUntil).toBeTruthy();
    });

    it('GET /documents/:id — 200 com versão inicial', async () => {
      const res = await request(app.getHttpServer())
        .get(`/documents/${documentId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.versions).toHaveLength(1);
    });

    it('PUT /documents/:id — RH actualiza metadados → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/documents/${documentId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Descrição actualizada' })
        .expect(200);
      expect(res.body.description).toBe('Descrição actualizada');
    });

    it('POST /documents/:id/versions — nova versão → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/documents/${documentId}/versions`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fileUrl: 'https://ci.innova.test/docs/int-test-v2.pdf',
          mimeType: 'application/pdf',
          changeDescription: 'Correcção de erros',
        })
        .expect(201);
      expect(res.body.versions.length).toBeGreaterThanOrEqual(2);
      expect(res.body.version).toBe('2.0');
    });

    it('GET /documents/:id/download — regista download e incrementa contador', async () => {
      const res = await request(app.getHttpServer())
        .get(`/documents/${documentId}/download`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.fileUrl).toBeTruthy();

      const doc = await prisma.document.findUnique({ where: { id: documentId } });
      expect(doc!.downloadCount).toBe(1);
    });

    it('GET /documents/:id/access-log — RH → 200 regista o download', async () => {
      const res = await request(app.getHttpServer())
        .get(`/documents/${documentId}/access-log`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((a: any) => a.user.id === employeeId)).toBe(true);
    });

    it('GET /documents/:id/audit — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/documents/${documentId}/audit`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('arquivar antes do prazo de retenção legal → 400', async () => {
      await request(app.getHttpServer())
        .patch(`/documents/${documentId}/archive`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({})
        .expect(400);
    });

    it('após expirar a retenção (simulado), arquivar → 200', async () => {
      await prisma.document.update({
        where: { id: documentId },
        data: { retentionUntil: new Date(Date.now() - 86400000) },
      });
      const res = await request(app.getHttpServer())
        .patch(`/documents/${documentId}/archive`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'Fim do ciclo de vida (teste)' })
        .expect(200);
      expect(res.body.message).toBeTruthy();
    });
  });

  describe('Listagem e scoping por departamento — verifica correcção (user.employee sempre undefined)', () => {
    it('RH publica documento CONFIDENTIAL do departamento partilhado', async () => {
      const res = await request(app.getHttpServer())
        .post('/documents')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Int Test Confidential Document',
          category: 'CORPORATE',
          sensitivity: 'CONFIDENTIAL',
          department: departmentName,
          fileUrl: 'https://ci.innova.test/docs/int-test-conf.pdf',
          mimeType: 'application/pdf',
        })
        .expect(201);
      confidentialDocId = res.body.id;
    });

    it('gestor do mesmo departamento vê o documento CONFIDENTIAL na listagem', async () => {
      const res = await request(app.getHttpServer())
        .get('/documents')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ limit: 100 })
        .expect(200);
      expect(res.body.data.some((d: any) => d.id === confidentialDocId)).toBe(true);
    });
  });

  describe('Permissions', () => {
    it('RH concede permissão de VIEW ao colaborador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/documents/permissions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ documentId, userId: employeeId, permissions: ['VIEW'] })
        .expect(201);
      permissionId = res.body.id;
      expect(permissionId).toBeDefined();
    });

    it('RH revoga a permissão → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/documents/permissions/${permissionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const row = await prisma.docPermission.findUnique({ where: { id: permissionId } });
      expect(row).toBeNull();
    });
  });

  describe('Share Links (público)', () => {
    it('gestor cria link de partilha com password → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/documents/share')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ documentId, access: 'VIEW_DOWNLOAD', password: 'Segredo@123' })
        .expect(201);
      shareToken = res.body.token;
      expect(res.body.shareUrl).toContain(shareToken);
    });

    it('resolver link sem password → 403', async () => {
      await request(app.getHttpServer()).get(`/documents/share/${shareToken}`).expect(403);
    });

    it('resolver link com password correcta (sem auth) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/documents/share/${shareToken}`)
        .query({ password: 'Segredo@123' })
        .expect(200);
      expect(res.body.id).toBe(documentId);
    });

    it('resolver link inexistente → 404', async () => {
      await request(app.getHttpServer()).get('/documents/share/codigo-invalido').expect(404);
    });
  });

  describe('Dashboard, stats, tags, expiring-soon', () => {
    it('GET /documents/dashboard — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/documents/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.kpis.total).toBeGreaterThanOrEqual(1);
    });

    it('colaborador não pode aceder ao dashboard → 403', async () => {
      await request(app.getHttpServer())
        .get('/documents/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /documents/stats — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/documents/stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /documents/tags — qualquer autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/documents/tags')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('GET /documents/expiring-soon — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/documents/expiring-soon')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
