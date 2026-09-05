import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Organization Integration', () => {
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

  let unitId: number;
  let parentDeptId: number;
  let childDeptId: number;
  let positionId: number;
  let originalEmployeeManagerId: number | null;

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
    originalEmployeeManagerId = employee!.managerId;
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    managerId = manager!.id;

    await prisma.user.update({ where: { id: employeeId }, data: { managerId } });
  });

  afterAll(async () => {
    await prisma.user.update({
      where: { id: employeeId },
      data: { managerId: originalEmployeeManagerId },
    });

    if (positionId) {
      await prisma.position.deleteMany({ where: { id: positionId } }).catch(() => undefined);
    }
    if (childDeptId) {
      await prisma.department.deleteMany({ where: { id: childDeptId } }).catch(() => undefined);
    }
    if (parentDeptId) {
      await prisma.department.deleteMany({ where: { id: parentDeptId } }).catch(() => undefined);
    }
    if (unitId) {
      await prisma.unit.deleteMany({ where: { id: unitId } }).catch(() => undefined);
    }
    await prisma.orgChangeLog.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    await prisma.notificationLog
      .deleteMany({ where: { userId: employeeId } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Dashboard / KPIs (bug: managersOverloaded nunca filtrava por >10 liderados)', () => {
    it('GET /organization/stats — 200, expõe managersOverloaded correcto', async () => {
      const stats = await request(app.getHttpServer())
        .get('/organization/stats')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const span = await request(app.getHttpServer())
        .get('/organization/span-of-control')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      // Antes do fix, managersOverloaded contava QUALQUER gestor com ≥1 liderado
      // (aqui, pelo menos o int.manager passaria a contar incorrectamente).
      // Depois do fix, tem de bater certo com o cálculo real de >10 liderados.
      expect(stats.body.kpis.managersOverloaded).toBe(span.body.summary.overloaded);
    });

    it('colaborador não acede a span-of-control (ADMIN/RH only)', async () => {
      await request(app.getHttpServer())
        .get('/organization/span-of-control')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /organization/headcount — 200', async () => {
      await request(app.getHttpServer())
        .get('/organization/headcount')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('Organograma', () => {
    it('GET /organization/chart — inclui o colaborador subordinado ao gestor', async () => {
      const res = await request(app.getHttpServer())
        .get('/organization/chart')
        .query({ rootUserId: managerId, depth: 2 })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const root = res.body.find((n: any) => n.id === managerId);
      expect(root.children.some((c: any) => c.id === employeeId)).toBe(true);
    });
  });

  describe('Histórico organizacional e perfil (ownership A10-8)', () => {
    it('RH regista uma mudança organizacional', async () => {
      await request(app.getHttpServer())
        .post('/organization/changes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          userId: employeeId,
          changeType: 'PROMOTION',
          effectiveDate: new Date().toISOString(),
          reason: 'Mérito',
        })
        .expect(201);
    });

    it('GET /organization/users/:id/history — RH vê o histórico', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organization/users/${employeeId}/history`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((h: any) => h.changeType === 'PROMOTION')).toBe(true);
    });

    it('GET /organization/timeline — RH vê a timeline geral', async () => {
      const res = await request(app.getHttpServer())
        .get('/organization/timeline')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((h: any) => h.user.id === employeeId)).toBe(true);
    });

    it('colaborador não pode ver o perfil organizacional de outro colega → 404', async () => {
      await request(app.getHttpServer())
        .get(`/organization/users/${managerId}/profile`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('colaborador vê o seu próprio perfil organizacional', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organization/users/${employeeId}/profile`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(employeeId);
      expect(res.body.orgHistory.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Unidades, departamentos e posições', () => {
    it('RH cria unidade', async () => {
      const res = await request(app.getHttpServer())
        .post('/organization/units')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Unit', code: 'INT-TEST-UNIT', type: 'BRANCH' })
        .expect(201);
      unitId = res.body.id;
    });

    it('RH cria departamento pai', async () => {
      const res = await request(app.getHttpServer())
        .post('/organization/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Depto Pai', code: 'INT-TEST-PARENT', unitId })
        .expect(201);
      parentDeptId = res.body.id;
    });

    it('código de departamento duplicado (case-insensitive) → 409', async () => {
      await request(app.getHttpServer())
        .post('/organization/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Outro', code: 'int-test-parent' })
        .expect(409);
    });

    it('RH cria departamento filho', async () => {
      const res = await request(app.getHttpServer())
        .post('/organization/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Depto Filho', code: 'INT-TEST-CHILD', parentId: parentDeptId })
        .expect(201);
      childDeptId = res.body.id;
    });

    it('departamento não pode ser pai de si próprio → 400', async () => {
      await request(app.getHttpServer())
        .put(`/organization/departments/${parentDeptId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ parentId: parentDeptId })
        .expect(400);
    });

    it('?rootOnly=false — inclui o departamento filho (bug: coerção de booleano)', async () => {
      const res = await request(app.getHttpServer())
        .get('/organization/departments')
        .query({ rootOnly: 'false', search: 'Int Test' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((d: any) => d.id === childDeptId)).toBe(true);
    });

    it('?rootOnly=true — NÃO deve incluir o departamento filho', async () => {
      const res = await request(app.getHttpServer())
        .get('/organization/departments')
        .query({ rootOnly: 'true', search: 'Int Test' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((d: any) => d.id === childDeptId)).toBe(false);
      expect(res.body.data.some((d: any) => d.id === parentDeptId)).toBe(true);
    });

    it('departamento pai não pode ser eliminado (tem sub-departamento) → 400', async () => {
      await request(app.getHttpServer())
        .delete(`/organization/departments/${parentDeptId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('RH cria posição', async () => {
      const res = await request(app.getHttpServer())
        .post('/organization/positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Analista', level: 'JUNIOR', departmentId: childDeptId })
        .expect(201);
      positionId = res.body.id;
    });

    it('posição duplicada no mesmo departamento → 409', async () => {
      await request(app.getHttpServer())
        .post('/organization/positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Analista', level: 'JUNIOR', departmentId: childDeptId })
        .expect(409);
    });

    it('actualizar posição com competencyIds → 200, não 500 (bug: coluna inexistente no Position)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/organization/positions/${positionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ salaryMin: 500, competencyIds: [1, 2, 3] })
        .expect(200);
      expect(res.body.salaryMin).toBe(500);
    });

    it('remover departamento filho e depois o pai', async () => {
      await request(app.getHttpServer())
        .delete(`/organization/positions/${positionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      positionId = 0 as any;

      await request(app.getHttpServer())
        .delete(`/organization/departments/${childDeptId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      childDeptId = 0 as any;

      await request(app.getHttpServer())
        .delete(`/organization/departments/${parentDeptId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      parentDeptId = 0 as any;
    });
  });

  // A escrita de /organization/* delega agora no serviço canónico de
  // `departments` (Fase C). Estes testes provam a paridade: as regras que só
  // um dos lados tinha aplicam-se agora em ambos.
  describe('escrita consolidada — paridade organization ↔ departments (Fase C)', () => {
    it('POST /organization/departments — código minúsculo persiste UPPERCASE e mantém active↔status coerentes', async () => {
      const res = await request(app.getHttpServer())
        .post('/organization/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Fase C', code: 'int-test-fasec' })
        .expect(201);

      expect(res.body.code).toBe('INT-TEST-FASEC');

      const row = await prisma.department.findUnique({ where: { id: res.body.id } });
      expect(row?.active).toBe(true);
      expect(row?.status).toBe('ACTIVE');

      // dup case-insensitive rejeitado, tal como em POST /departments
      await request(app.getHttpServer())
        .post('/organization/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Outro', code: 'INT-TEST-FASEC' })
        .expect(409);

      await prisma.department.deleteMany({ where: { code: 'INT-TEST-FASEC' } });
    });

    it('PUT /organization/departments/:id — status:INACTIVE espelha active:false', async () => {
      const created = await request(app.getHttpServer())
        .post('/organization/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Fase C Status', code: 'INT-TEST-FASEC-ST' })
        .expect(201);

      await request(app.getHttpServer())
        .put(`/organization/departments/${created.body.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const row = await prisma.department.findUnique({ where: { id: created.body.id } });
      expect(row?.status).toBe('INACTIVE');
      expect(row?.active).toBe(false);

      await prisma.department.deleteMany({ where: { code: 'INT-TEST-FASEC-ST' } });
    });
  });
});
