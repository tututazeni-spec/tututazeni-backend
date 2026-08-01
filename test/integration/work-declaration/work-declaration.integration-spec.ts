import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Work Declaration Integration', () => {
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

  let templateId: number;
  let unusedTemplateId: number;
  let requestedDeclarationId: string;
  let createdDeclarationId: string;
  const createdDeclarationIds: string[] = [];

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
    const allDeclIds = [
      requestedDeclarationId,
      createdDeclarationId,
      ...createdDeclarationIds,
    ].filter(Boolean);
    await prisma.declarationSignature
      .deleteMany({ where: { declarationId: { in: allDeclIds } } })
      .catch(() => undefined);
    await prisma.declarationAuditLog
      .deleteMany({ where: { declarationId: { in: allDeclIds } } })
      .catch(() => undefined);
    await prisma.declarationAccessLog
      .deleteMany({ where: { declarationId: { in: allDeclIds } } })
      .catch(() => undefined);
    await prisma.declaration
      .deleteMany({ where: { id: { in: allDeclIds } } })
      .catch(() => undefined);
    if (templateId) {
      await prisma.declaration.deleteMany({ where: { templateId } }).catch(() => undefined);
      await prisma.declarationTemplate.delete({ where: { id: templateId } }).catch(() => undefined);
    }
    if (unusedTemplateId) {
      await prisma.declarationTemplate
        .delete({ where: { id: unusedTemplateId } })
        .catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Templates', () => {
    it('RH cria template → 201, tenantId resolvido automaticamente (não undefined)', async () => {
      const res = await request(app.getHttpServer())
        .post('/work-declarations/templates')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Declaração de Vínculo — Teste',
          type: 'EMPLOYMENT',
          bodyContent: 'Declaro que {{nome}} trabalha nesta empresa desde {{data_admissao}}.',
        })
        .expect(201);
      templateId = res.body.id;
      expect(typeof templateId).toBe('number');

      const row = await prisma.declarationTemplate.findUnique({ where: { id: templateId } });
      expect(row).toBeTruthy();
      expect(row!.tenantId).toBeTruthy();
    });

    it('colaborador não pode criar template → 403', async () => {
      await request(app.getHttpServer())
        .post('/work-declarations/templates')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', type: 'EMPLOYMENT', bodyContent: 'x' })
        .expect(403);
    });

    it('GET /templates/library — filtra por type/isActive/search sem 400 (mismatch de DTO corrigido)', async () => {
      const res = await request(app.getHttpServer())
        .get('/work-declarations/templates/library')
        .query({ type: 'EMPLOYMENT', isActive: 'true', search: 'Vínculo' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((t: any) => t.id === templateId)).toBe(true);
    });

    it('GET /templates/:id — id numérico real aceite pelo ParseIntPipe (antes rejeitava sempre como UUID)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/work-declarations/templates/${templateId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(templateId);
    });

    it('GET /templates/:id — id não numérico → 400 (ParseIntPipe)', async () => {
      await request(app.getHttpServer())
        .get('/work-declarations/templates/not-a-number')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(400);
    });

    it('POST /templates/:id/preview — resolve variáveis reais do colaborador (hireDate/nif corrigidos)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/work-declarations/templates/${templateId}/preview`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ employeeId })
        .expect(201);
      expect(res.body.rendered).toContain('Employee Int');
    });

    it('PATCH /templates/:id — RH actualiza → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/work-declarations/templates/${templateId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Actualizado via teste' })
        .expect(200);
      expect(res.body.description).toBe('Actualizado via teste');
      expect(res.body.version).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Declarations — fluxo colaborador (request)', () => {
    it('colaborador solicita declaração → 201, DRAFT, ids numéricos persistidos correctamente', async () => {
      const res = await request(app.getHttpServer())
        .post('/work-declarations/request')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ templateId, type: 'EMPLOYMENT', purpose: 'Fins bancários' })
        .expect(201);
      requestedDeclarationId = res.body.id;
      expect(res.body.status).toBe('DRAFT');

      const row = await prisma.declaration.findUnique({ where: { id: requestedDeclarationId } });
      expect(row!.employeeId).toBe(employeeId);
      expect(row!.requestedById).toBe(employeeId);
      expect(row!.tenantId).toBeTruthy();
    });

    it('GET /work-declarations/:id (cuid real) — dono acede → 200 (antes rejeitava sempre via ParseUUIDPipe)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/work-declarations/${requestedDeclarationId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(requestedDeclarationId);
    });

    it('outro colaborador (manager, não dono) → 404, não 403 (assertCanAccess)', async () => {
      await request(app.getHttpServer())
        .get(`/work-declarations/${requestedDeclarationId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });

    it('RH (privilegiado) acede à declaração de outro utilizador → 200', async () => {
      await request(app.getHttpServer())
        .get(`/work-declarations/${requestedDeclarationId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('GET /work-declarations/my/requests — colaborador vê apenas as suas (Int employeeId, não crasha)', async () => {
      const res = await request(app.getHttpServer())
        .get('/work-declarations/my/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.every((d: any) => d.employee.id === employeeId)).toBe(true);
      expect(res.body.data.some((d: any) => d.id === requestedDeclarationId)).toBe(true);
    });
  });

  describe('Declarations — fluxo RH (create directa) + filtros de listagem', () => {
    it('RH cria declaração directamente com employeeId/templateId numéricos → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/work-declarations')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          templateId,
          employeeId,
          type: 'EMPLOYMENT',
          title: 'Declaração de Vínculo Empregatício',
        })
        .expect(201);
      createdDeclarationId = res.body.id;
      expect(res.body.status).toBe('DRAFT');

      const row = await prisma.declaration.findUnique({ where: { id: createdDeclarationId } });
      expect(row!.employeeId).toBe(employeeId);
      expect(row!.assignedToId).not.toBeNull();
    });

    it('colaborador não pode criar declaração directamente → 403', async () => {
      await request(app.getHttpServer())
        .post('/work-declarations')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ templateId, employeeId, type: 'EMPLOYMENT', title: 'X' })
        .expect(403);
    });

    it('GET /work-declarations?employeeId=&fromDate=&toDate=&search=&sortBy= — sem 400 de whitelist (DTO corrigido)', async () => {
      const res = await request(app.getHttpServer())
        .get('/work-declarations')
        .query({
          employeeId,
          fromDate: '2020-01-01',
          toDate: '2030-01-01',
          search: 'Vínculo',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.some((d: any) => d.id === createdDeclarationId)).toBe(true);
    });

    it('colaborador tentando filtrar por employeeId alheio — filtro é ignorado, só vê as suas', async () => {
      const res = await request(app.getHttpServer())
        .get('/work-declarations')
        .query({ employeeId: managerId })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.every((d: any) => d.employee.id === employeeId)).toBe(true);
    });
  });

  describe('Declarations — update, assinatura, emissão, revogação', () => {
    it('PATCH /:id — RH actualiza declaração em DRAFT → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/work-declarations/${createdDeclarationId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ purpose: 'Fins académicos' })
        .expect(200);
      expect(res.body.purpose).toBe('Fins académicos');
    });

    it('POST /:id/sign — RH assina, signerId numérico persistido correctamente', async () => {
      const rh = await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } });
      const res = await request(app.getHttpServer())
        .post(`/work-declarations/${createdDeclarationId}/sign`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          type: 'IMAGE_UPLOAD',
          signatureUrl: 'https://ci.innova.test/sig.png',
          signerRole: 'RH',
        })
        .expect(201);
      expect(res.body.signerId).toBe(rh!.id);
    });

    it('PATCH /:id/issue — emite a declaração → ISSUED com pdfUrl/verificationHash', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/work-declarations/${createdDeclarationId}/issue`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ISSUED');
      expect(res.body.pdfUrl).toBeTruthy();
      expect(res.body.verificationHash).toBeTruthy();
    });

    it('GET /verify/:code — verificação pública (sem auth) → válida', async () => {
      const row = await prisma.declaration.findUnique({ where: { id: createdDeclarationId } });
      const res = await request(app.getHttpServer())
        .get(`/work-declarations/verify/${row!.code}`)
        .expect(200);
      expect(res.body.valid).toBe(true);
    });

    it('GET /:id/audit-log — regista CREATED/UPDATED/SIGNED/STATUS_CHANGED com actorId numérico', async () => {
      const res = await request(app.getHttpServer())
        .get(`/work-declarations/${createdDeclarationId}/audit-log`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const actions = res.body.map((l: any) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining(['CREATED', 'UPDATED', 'SIGNED', 'STATUS_CHANGED']),
      );
      expect(res.body.every((l: any) => typeof l.actorId === 'number')).toBe(true);
    });

    it('PATCH /:id/revoke — força REVOKED mesmo que o corpo tente outro status (ordem de spread corrigida)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/work-declarations/${createdDeclarationId}/revoke`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'ISSUED', reason: 'Erro de emissão' })
        .expect(200);
      expect(res.body.status).toBe('REVOKED');
    });
  });

  describe('Branding / tenant config', () => {
    it('ADMIN define logo → 201', async () => {
      await request(app.getHttpServer())
        .post('/work-declarations/branding/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fileUrl: 'https://ci.innova.test/logo-empresa.png' })
        .expect(201);
    });

    it('GET /branding/settings — reflete o logo definido', async () => {
      const res = await request(app.getHttpServer())
        .get('/work-declarations/branding/settings')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.logoUrl).toBe('https://ci.innova.test/logo-empresa.png');
    });

    it('colaborador não pode aceder às definições de branding → 403', async () => {
      await request(app.getHttpServer())
        .get('/work-declarations/branding/settings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Dashboard stats', () => {
    it('GET /dashboard/stats — RH → 200 com contagens', async () => {
      const res = await request(app.getHttpServer())
        .get('/work-declarations/dashboard/stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Eliminação de templates — RESTRICT guard (soft vs hard delete)', () => {
    it('template em uso → soft delete (isActive: false), não elimina a linha', async () => {
      await request(app.getHttpServer())
        .delete(`/work-declarations/templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const row = await prisma.declarationTemplate.findUnique({ where: { id: templateId } });
      expect(row).toBeTruthy();
      expect(row!.isActive).toBe(false);
    });

    it('template nunca usado → eliminação real', async () => {
      const created = await request(app.getHttpServer())
        .post('/work-declarations/templates')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Template Sem Uso', type: 'CUSTOM', bodyContent: 'x' })
        .expect(201);
      unusedTemplateId = created.body.id;

      await request(app.getHttpServer())
        .delete(`/work-declarations/templates/${unusedTemplateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const row = await prisma.declarationTemplate.findUnique({
        where: { id: unusedTemplateId },
      });
      expect(row).toBeNull();
      unusedTemplateId = 0;
    });
  });
});
