import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Declarations Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let departmentName: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let purposeId: number;
  let templateId: number;
  let requestId: number;
  let rejectedRequestId: number;
  let workFormId: number;
  let submissionId: number;
  let resubmitFormId: number;

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
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    departmentName = dept!.name;
  });

  afterAll(async () => {
    await prisma.workDeclAnswer
      .deleteMany({
        where: { submission: { formId: { in: [workFormId, resubmitFormId].filter(Boolean) } } },
      })
      .catch(() => undefined);
    await prisma.workDeclReview
      .deleteMany({
        where: { submission: { formId: { in: [workFormId, resubmitFormId].filter(Boolean) } } },
      })
      .catch(() => undefined);
    await prisma.workDeclSubmission
      .deleteMany({ where: { formId: { in: [workFormId, resubmitFormId].filter(Boolean) } } })
      .catch(() => undefined);
    await prisma.workDeclQuestion
      .deleteMany({ where: { formId: { in: [workFormId, resubmitFormId].filter(Boolean) } } })
      .catch(() => undefined);
    await prisma.workDeclForm
      .deleteMany({ where: { id: { in: [workFormId, resubmitFormId].filter(Boolean) } } })
      .catch(() => undefined);

    await prisma.declarationApproval
      .deleteMany({ where: { requestId: { in: [requestId, rejectedRequestId].filter(Boolean) } } })
      .catch(() => undefined);
    await prisma.declarationRequest
      .deleteMany({ where: { id: { in: [requestId, rejectedRequestId].filter(Boolean) } } })
      .catch(() => undefined);
    if (templateId) {
      await prisma.declarationTemplate
        .deleteMany({ where: { id: templateId } })
        .catch(() => undefined);
    }
    if (purposeId) {
      await prisma.declarationPurpose
        .deleteMany({ where: { id: purposeId } })
        .catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('MODULE 1 — Document Declarations', () => {
    it('RH cria finalidade → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/declarations/documents/purposes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Comprovativo de Trabalho', category: 'LEGAL', requiresApproval: true })
        .expect(201);
      purposeId = res.body.id;
      expect(purposeId).toBeDefined();
    });

    it('colaborador não pode criar finalidade → 403', async () => {
      await request(app.getHttpServer())
        .post('/declarations/documents/purposes')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', category: 'OTHER' })
        .expect(403);
    });

    it('RH cria template — verifica correcção do schema (tenantId/type/bodyContent) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/declarations/documents/templates')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Declaração de Trabalho',
          purposeId,
          language: 'PT',
          content:
            'Declaro que {{employee_name}} trabalha na {{company_name}} desde {{hire_date}}.',
          active: true,
        })
        .expect(201);
      templateId = res.body.id;
      expect(templateId).toBeDefined();
      expect(res.body.variables).toEqual(
        expect.arrayContaining(['employee_name', 'company_name', 'hire_date']),
      );

      const row = await prisma.declarationTemplate.findUnique({ where: { id: templateId } });
      expect(row!.tenantId).toBeTruthy();
      expect(row!.bodyContent).toContain('{{employee_name}}');
    });

    it('GET /templates/:id/preview — resolve variáveis do colaborador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/declarations/documents/templates/${templateId}/preview`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.previewHtml).toContain('Employee Int');
    });

    it('colaborador solicita declaração (requer aprovação, via purpose) → PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/declarations/documents')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ templateId, purposeId, addressedTo: 'A quem interessar' })
        .expect(201);
      requestId = res.body.id;
      expect(res.body.status).toBe('PENDING');
    });

    it('outro colaborador não pode ver o pedido alheio → 404', async () => {
      await request(app.getHttpServer())
        .get(`/declarations/documents/${requestId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });

    it('RH vê o pedido em findAll → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/declarations/documents')
        .query({ status: 'PENDING' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.some((r: any) => r.id === requestId)).toBe(true);
    });

    it('RH aprova o pedido → gera automaticamente e devolve APPROVED/GENERATED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/declarations/documents/${requestId}/approve`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ approved: true })
        .expect(200);
      expect(['GENERATED', 'APPROVED']).toContain(res.body.status);
      expect(res.body.referenceNumber).toBeTruthy();
      expect(res.body.verificationCode).toBeTruthy();
    });

    it('RH emite a declaração → ISSUED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/declarations/documents/${requestId}/issue`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('ISSUED');
    });

    it('verificação pública por código (sem auth) → válida', async () => {
      const req = await prisma.declarationRequest.findUnique({ where: { id: requestId } });
      const res = await request(app.getHttpServer())
        .get(`/declarations/documents/verify/${req!.verificationCode}`)
        .expect(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.employee).toBe('Employee Int');
    });

    it('verificação com código inválido → valid false', async () => {
      const res = await request(app.getHttpServer())
        .get('/declarations/documents/verify/CODIGO-INEXISTENTE')
        .expect(200);
      expect(res.body.valid).toBe(false);
    });

    it('segundo pedido é rejeitado pelo RH → REJECTED (exercita notifyRH sem crash)', async () => {
      const created = await request(app.getHttpServer())
        .post('/declarations/documents')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ templateId, purposeId })
        .expect(201);
      rejectedRequestId = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/declarations/documents/${rejectedRequestId}/approve`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ approved: false, notes: 'Dados insuficientes' })
        .expect(200);
      expect(res.body.status).toBe('REJECTED');
    });

    it('GET /declarations/documents/dashboard — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/declarations/documents/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });
  });

  describe('MODULE 2 — Work Declarations', () => {
    it('RH cria formulário dirigido ao departamento do colaborador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/declarations/work/forms')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Declaração de Teletrabalho',
          type: 'COMPLIANCE',
          mandatory: true,
          targetAllEmployees: false,
          targetDepartments: [departmentName],
          questions: [
            {
              key: 'q1',
              label: 'Confirma o local de trabalho?',
              fieldType: 'BOOLEAN',
              required: true,
            },
          ],
        })
        .expect(201);
      workFormId = res.body.id;
      expect(workFormId).toBeDefined();
      expect(res.body.questions).toHaveLength(1);
    });

    it('GET /declarations/work/my/pending — verifica correcção do targeting por departamento', async () => {
      const res = await request(app.getHttpServer())
        .get('/declarations/work/my/pending')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.pending.some((f: any) => f.id === workFormId)).toBe(true);
    });

    it('colaborador guarda rascunho → DRAFT', async () => {
      const res = await request(app.getHttpServer())
        .post('/declarations/work/submit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ formId: workFormId, answers: [], saveAsDraft: true })
        .expect(201);
      submissionId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('colaborador submete a sério — verifica correcção do bug @@unique (não cria segunda linha)', async () => {
      const res = await request(app.getHttpServer())
        .post('/declarations/work/submit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ formId: workFormId, answers: [{ key: 'q1', value: true }] })
        .expect(201);
      expect(res.body.id).toBe(submissionId);
      expect(res.body.status).toBe('SUBMITTED');

      const rows = await prisma.workDeclSubmission.findMany({
        where: { userId: employeeId, formId: workFormId },
      });
      expect(rows).toHaveLength(1);
    });

    it('RH vê a submissão em findSubmissions com filtro de departamento — verifica correcção (nao usa relação employee inexistente)', async () => {
      const res = await request(app.getHttpServer())
        .get('/declarations/work/submissions')
        .query({ department: departmentName })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.some((s: any) => s.id === submissionId)).toBe(true);
    });

    it('RH aprova a submissão → APPROVED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/declarations/work/submissions/${submissionId}/review`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ approved: true })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('reenvio de lembrete com filtro de departamento — verifica correcção (nao usa relação employee inexistente) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/declarations/work/forms/${workFormId}/remind`)
        .query({ department: departmentName })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.sent).toBeDefined();
    });

    it('fluxo de rejeição → resubmissão (mesma linha, sem violar @@unique)', async () => {
      const created = await request(app.getHttpServer())
        .post('/declarations/work/forms')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Declaração de Conflito de Interesses',
          type: 'COMPLIANCE',
          targetAllEmployees: true,
          questions: [{ key: 'q1', label: 'Tem conflito?', fieldType: 'BOOLEAN', required: true }],
        })
        .expect(201);
      resubmitFormId = created.body.id;

      const sub1 = await request(app.getHttpServer())
        .post('/declarations/work/submit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ formId: resubmitFormId, answers: [{ key: 'q1', value: false }] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/declarations/work/submissions/${sub1.body.id}/review`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ approved: false, notes: 'Resposta inconsistente' })
        .expect(200);

      const sub2 = await request(app.getHttpServer())
        .post('/declarations/work/submit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ formId: resubmitFormId, answers: [{ key: 'q1', value: true }] })
        .expect(201);
      expect(sub2.body.id).toBe(sub1.body.id);
      expect(sub2.body.status).toBe('SUBMITTED');

      const rows = await prisma.workDeclSubmission.findMany({
        where: { userId: employeeId, formId: resubmitFormId },
      });
      expect(rows).toHaveLength(1);
    });

    it('GET /declarations/work/compliance-report — verifica correcção (antes rebentava sempre) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/declarations/work/compliance-report')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.overallRate).toBeDefined();
      expect(Array.isArray(res.body.report)).toBe(true);
      const empRow = res.body.report.find((r: any) => r.userId === employeeId);
      expect(empRow?.department).toBe(departmentName);
    });

    it('GET /declarations/work/compliance-report com filtro de departamento → 200', async () => {
      await request(app.getHttpServer())
        .get('/declarations/work/compliance-report')
        .query({ department: departmentName })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('GET /declarations/work/dashboard — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/declarations/work/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.kpis.total).toBeGreaterThanOrEqual(2);
    });

    it('colaborador não pode aceder ao dashboard → 403', async () => {
      await request(app.getHttpServer())
        .get('/declarations/work/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });
});
