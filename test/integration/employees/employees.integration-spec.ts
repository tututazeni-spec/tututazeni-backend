import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const EMPLOYEE_EMAIL = 'int.employees.main@innova-test.com';
const SECOND_EMPLOYEE_EMAIL = 'int.employees.second@innova-test.com';
const SKILL_NAME = 'Int Test Skill — Employees';

describe('Employees Integration', () => {
  let app: INestApplication;
  let rhToken: string;
  let adminToken: string;
  let employeeToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let employeeId: number;
  let secondEmployeeId: number;
  let skillId: number;

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

    rhToken = await getToken(app.getHttpServer(), 'rh');
    adminToken = await getToken(app.getHttpServer(), 'admin');
    employeeToken = await getToken(app.getHttpServer(), 'employee');

    const skill = await prisma.skill.upsert({
      where: { name: SKILL_NAME },
      update: {},
      create: { name: SKILL_NAME, type: 'TECHNICAL' },
    });
    skillId = skill.id;
  });

  afterAll(async () => {
    const employees = await prisma.employee.findMany({
      where: { email: { in: [EMPLOYEE_EMAIL, SECOND_EMPLOYEE_EMAIL] } },
      select: { id: true },
    });
    const ids = employees.map(e => e.id);

    if (ids.length > 0) {
      // Todas as FKs para Employee são RESTRICT — apagar filhos antes do pai.
      await prisma.attendance
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.careerPlan
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.contract
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.employeeDocument
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.employeeSkill
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.employeeTimeline
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.feedback360
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.legacyPdi
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.selfServiceRequest
        .deleteMany({ where: { employeeId: { in: ids } } })
        .catch(() => undefined);
      await prisma.employee.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    }
    await prisma.skill.deleteMany({ where: { name: SKILL_NAME } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('CRUD principal', () => {
    it('colaborador não pode criar colaborador → 403', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', email: EMPLOYEE_EMAIL, role: 'Dev', joinedAt: '2024-01-01' })
        .expect(403);
    });

    it('RH cria colaborador → 201 com matrícula gerada', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Colaborador Integração',
          email: EMPLOYEE_EMAIL,
          role: 'Developer',
          department: 'Engenharia',
          joinedAt: '2024-01-15',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.matricula).toBeTruthy();
      employeeId = res.body.id;
    });

    it('email duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Dup', email: EMPLOYEE_EMAIL, role: 'Dev', joinedAt: '2024-01-01' })
        .expect(409);
    });

    it('RH cria segundo colaborador (para testes de bulk) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Colaborador Integração 2',
          email: SECOND_EMPLOYEE_EMAIL,
          role: 'Analyst',
          joinedAt: '2024-02-01',
        })
        .expect(201);
      secondEmployeeId = res.body.id;
    });

    it('GET /employees — RH lista colaboradores → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/employees')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta).toHaveProperty('total');
    });

    it('GET /employees — colaborador não pode listar → 403', async () => {
      await request(app.getHttpServer())
        .get('/employees')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /employees/:id — RH vê detalhe completo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(employeeId);
      expect(res.body).toHaveProperty('timeline');
    });

    it('GET /employees/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/employees/999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('GET /employees/:id/stats — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/stats`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('totalContracts');
    });

    it('PUT /employees/:id — RH atualiza cargo (regista mudança na timeline) → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/employees/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ role: 'Senior Developer' })
        .expect(200);
      expect(res.body.role).toBe('Senior Developer');
    });

    it('PUT /employees/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .put('/employees/999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ role: 'X' })
        .expect(404);
    });

    it('DELETE /employees/:id — RH (não ADMIN) não pode desligar → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/employees/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });
  });

  describe('Headcount, export e organograma', () => {
    it('GET /employees/headcount — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/employees/headcount')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('total');
    });

    it('GET /employees/headcount — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/employees/headcount')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /employees/export — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/employees/export')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('count');
    });

    it('GET /employees/org-chart — colaborador (rota permite COLABORADOR) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/employees/org-chart')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Contratos', () => {
    let contractId: number;

    it('POST /employees/contracts — RH cria contrato → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees/contracts')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          employeeId,
          startDate: '2024-01-15',
          type: 'INDEFINITE',
          status: 'ACTIVE',
        })
        .expect(201);
      contractId = res.body.id;
    });

    it('POST /employees/contracts — colaborador inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/employees/contracts')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ employeeId: 999999, startDate: '2024-01-01', type: 'INDEFINITE', status: 'ACTIVE' })
        .expect(404);
    });

    it('GET /employees/:id/contracts → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/contracts`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('PATCH /employees/contracts/:id/status → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/employees/contracts/${contractId}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(res.body.status).toBe('SUSPENDED');
    });
  });

  describe('Presenças', () => {
    it('POST /employees/attendance — RH regista presença → 201', async () => {
      await request(app.getHttpServer())
        .post('/employees/attendance')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ employeeId, date: '2024-03-01', hoursWorked: 8, status: 'PRESENT' })
        .expect(201);
    });

    it('POST /employees/attendance — mesma data duplicada → 409', async () => {
      await request(app.getHttpServer())
        .post('/employees/attendance')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ employeeId, date: '2024-03-01', hoursWorked: 6, status: 'PRESENT' })
        .expect(409);
    });

    it('GET /employees/:id/attendance → 200 com agregados', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/attendance`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.totalDays).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('totalHours');
    });
  });

  describe('Feedback 360', () => {
    it('POST /employees/feedback360 — RH adiciona feedback → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees/feedback360')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          employeeId,
          evaluatorId: secondEmployeeId,
          evaluatorRole: 'PEER',
          score: 8,
          comments: 'Bom trabalho em equipa',
          evaluatedAt: '2024-03-15',
          cycle: '2024-Q1',
        })
        .expect(201);
      expect(res.body.score).toBe(8);
    });

    it('GET /employees/:id/feedback360 — média calculada → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/feedback360`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.averageScore).toBe(8);
      expect(res.body.total).toBe(1);
    });
  });

  describe('Planos de carreira', () => {
    let careerPlanId: number;

    it('POST /employees/career-plans → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees/career-plans')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          employeeId,
          title: 'Plano Senior → Staff',
          description: 'Progressão para staff engineer',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        })
        .expect(201);
      careerPlanId = res.body.id;
      expect(res.body.status).toBe('ACTIVE');
    });

    it('GET /employees/:id/career-plans → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/career-plans`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('PATCH /employees/career-plans/:id/status → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/employees/career-plans/${careerPlanId}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });
  });

  describe('PDI', () => {
    let pdiId: number;

    it('POST /employees/pdis — com ações aninhadas → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees/pdis')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          employeeId,
          title: 'PDI 2024',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          actions: [{ description: 'Curso de liderança', deadline: '2024-06-30' }],
        })
        .expect(201);
      pdiId = res.body.id;
      expect(res.body.actions.length).toBe(1);
    });

    it('GET /employees/:id/pdis → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/pdis`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('PATCH /employees/pdis/:id/progress — 100% marca COMPLETED → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/employees/pdis/${pdiId}/progress`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ progressPercent: 100 })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });
  });

  describe('Skills', () => {
    it('POST /employees/:id/skills — atribui skill → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/employees/${employeeId}/skills`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ employeeId, skillId, currentLevel: 3, desiredLevel: 5 })
        .expect(201);
      expect(res.body.currentLevel).toBe(3);
    });

    it('GET /employees/:id/skills — com gap analysis → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/skills`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.skills[0].gap).toBe(2);
    });

    it('PATCH /employees/:id/skills/:skillId — actualiza nível → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/employees/${employeeId}/skills/${skillId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ currentLevel: 4 })
        .expect(200);
      expect(res.body.currentLevel).toBe(4);
    });

    it('DELETE /employees/:id/skills/:skillId — remove skill → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/employees/${employeeId}/skills/${skillId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('Documentos', () => {
    let documentId: number;

    it('POST /employees/:id/documents → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/employees/${employeeId}/documents`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          employeeId,
          name: 'Contrato assinado',
          type: 'CONTRACT',
          fileUrl: 'https://ci.innova.test/contrato.pdf',
        })
        .expect(201);
      documentId = res.body.id;
    });

    it('GET /employees/:id/documents — sem permissão (colaborador) → 403', async () => {
      await request(app.getHttpServer())
        .get(`/employees/${employeeId}/documents`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /employees/:id/documents → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/documents`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.documents.length).toBeGreaterThan(0);
    });

    it('DELETE /employees/documents/:id — soft delete → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/employees/documents/${documentId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('DELETE /employees/documents/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .delete('/employees/documents/999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });
  });

  describe('Timeline', () => {
    it('GET /employees/:id/timeline — inclui evento HIRED automático → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/timeline`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((e: any) => e.type === 'HIRED')).toBe(true);
    });

    it('POST /employees/:id/timeline — evento manual → 201', async () => {
      await request(app.getHttpServer())
        .post(`/employees/${employeeId}/timeline`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ employeeId, type: 'NOTE', title: 'Nota manual de teste' })
        .expect(201);
    });
  });

  describe('Solicitações de autoatendimento', () => {
    let requestId: number;

    it('POST /employees/:id/requests → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/employees/${employeeId}/requests`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ employeeId, type: 'DATA_CHANGE', reason: 'Actualização de morada' })
        .expect(201);
      requestId = res.body.id;
      expect(res.body.status).toBe('PENDING');
    });

    it('GET /employees/:id/requests → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/requests`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('PATCH /employees/requests/:id/review — aprova → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/employees/requests/${requestId}/review`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'APPROVED', reviewerId: secondEmployeeId })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('PATCH /employees/requests/:id/review — já processada → 400', async () => {
      await request(app.getHttpServer())
        .patch(`/employees/requests/${requestId}/review`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'REJECTED', reviewerId: secondEmployeeId })
        .expect(400);
    });

    it('PATCH /employees/requests/:id/review — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .patch('/employees/requests/999999/review')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'APPROVED', reviewerId: secondEmployeeId })
        .expect(404);
    });
  });

  describe('Ações em massa', () => {
    it('PATCH /employees/bulk/status — actualiza vários colaboradores → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch('/employees/bulk/status')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ employeeIds: [secondEmployeeId], status: 'ON_LEAVE' })
        .expect(200);
      expect(res.body.updated).toBe(1);
    });

    it('PATCH /employees/bulk/status — colaborador não pode → 403', async () => {
      await request(app.getHttpServer())
        .patch('/employees/bulk/status')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ employeeIds: [secondEmployeeId], status: 'ACTIVE' })
        .expect(403);
    });
  });

  describe('Audit log', () => {
    it('GET /employees/:id/audit-log → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/audit-log`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Desligamento (delete)', () => {
    it('DELETE /employees/:id — ADMIN desliga (soft delete → TERMINATED) → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/employees/${secondEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/employees/${secondEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.status).toBe('TERMINATED');
    });

    it('DELETE /employees/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .delete('/employees/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
